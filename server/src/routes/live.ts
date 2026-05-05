import { Router, Request, Response } from 'express';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { Server } from 'socket.io';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { lives, auctions, endedBlindBids, createLive, endLive, createAuction, startTimer, endFcfsAuction } from '../store/memory';
import { endAuction } from '../services/livekit-service';
import pool from '../db/mysql';

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'auctions');

const LIVES_UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'lives');
fs.mkdirSync(LIVES_UPLOADS_DIR, { recursive: true });

const uploadLiveThumbnail = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LIVES_UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `tmp_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  },
});

// multer: 임시 파일명(timestamp)으로 저장 후 auctionId로 rename
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, _file, cb) => cb(null, `tmp_${Date.now()}.jpg`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('이미지 파일만 허용됩니다.'));
  },
});

const router = Router();

type Role = 'seller' | 'buyer';

interface TokenRequestBody {
  roomName?: string;
  userId?: string | number;
  role?: Role;
}

// 기존 엔드포인트 유지 — roomName=liveId로 호출
router.post('/token', async (req: Request, res: Response) => {
  const apiKey = process.env.LIVEKIT_KEY;
  const apiSecret = process.env.LIVEKIT_SECRET;
  const liveKitUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !liveKitUrl) {
    res.status(500).json({
      error:
        'LiveKit 환경 변수가 설정되지 않았습니다. server/.env 파일에 LIVEKIT_KEY, LIVEKIT_SECRET, LIVEKIT_URL 을 모두 등록해 주세요.',
    });
    return;
  }

  const { roomName, userId, role } = req.body as TokenRequestBody;

  if (!roomName || !userId) {
    res.status(400).json({
      error: '필수 파라미터가 누락되었습니다. roomName, userId 를 전달해 주세요.',
    });
    return;
  }

  const resolvedRole: Role = (role === 'seller') ? 'seller' : 'buyer';

  try {
    const token = new AccessToken(apiKey, apiSecret, {
      identity: String(userId),
      ttl: '2h',
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: resolvedRole === 'seller',
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();

    // LK-1: 토큰 응답 로깅
    console.log('[live/token]', {
      tokenPrefix: jwt.slice(0, 20),
      serverUrl: liveKitUrl,
      role: resolvedRole,
      room: roomName,
    });

    res.json({
      token: jwt,
      serverUrl: liveKitUrl,
      role: resolvedRole,
      roomName,
    });
  } catch (err) {
    console.error('[live/token] 실패', err);
    res.status(500).json({
      error: 'LiveKit 토큰 발급 중 오류가 발생했습니다.',
    });
  }
});

// LK-4: LiveKit 도달성 헬스체크
router.get('/health', async (_req: Request, res: Response) => {
  const liveKitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_KEY;
  const apiSecret = process.env.LIVEKIT_SECRET;

  if (!liveKitUrl || !apiKey || !apiSecret) {
    res.json({ ok: false, error: 'env-missing' });
    return;
  }

  try {
    const client = new RoomServiceClient(liveKitUrl, apiKey, apiSecret);
    const rooms = await client.listRooms();
    res.json({ ok: true, roomCount: rooms.length, serverUrl: liveKitUrl });
  } catch (err) {
    res.json({ ok: false, error: (err as Error).message });
  }
});

export default router;

// io를 주입받는 라우터 팩토리
export function createLiveRouter(io: Server) {
  const r = Router();

  // 서버 시작 시 DB upcoming 라이브 복원
  (async () => {
    try {
      const [rows]: any = await pool.query(
        "SELECT * FROM lives WHERE status = 'upcoming'"
      );
      for (const row of rows) {
        if (!lives.has(row.id)) {
          lives.set(row.id, {
            id: row.id,
            sellerId: String(row.seller_id),
            sellerName: row.seller_name ?? undefined,
            title: row.title,
            thumbnailUrl: row.thumbnail_url ?? undefined,
            category: row.category ?? undefined,
            status: 'upcoming',
            scheduledAt: row.scheduled_at ? Number(row.scheduled_at) : undefined,
            viewerCount: 0,
            currentAuctionId: null,
            createdAt: Number(row.created_at),
          });
        }
      }
      console.log(`[live] DB에서 upcoming 라이브 ${rows.length}건 복원`);
    } catch (err) {
      console.warn('[live] upcoming 복원 실패 (DB 미연결):', (err as Error).message);
    }
  })();

  // POST /api/lives — Live 생성 + LiveKit 토큰 발급
  r.post('/', uploadLiveThumbnail.single('thumbnail'), async (req: Request, res: Response) => {
    const apiKey = process.env.LIVEKIT_KEY;
    const apiSecret = process.env.LIVEKIT_SECRET;
    const liveKitUrl = process.env.LIVEKIT_URL;

    const { sellerId, title, category, scheduledAt: scheduledAtRaw } = req.body as { sellerId?: string; title?: string; category?: string; scheduledAt?: string };
    const scheduledAt = scheduledAtRaw ? Number(scheduledAtRaw) : undefined;
    if (!sellerId || !title) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: 'sellerId, title 은 필수입니다.' });
      return;
    }

    const id = crypto.randomUUID();

    // 썸네일 파일이 있으면 liveId 기반 최종 경로로 rename
    let thumbnailUrl: string | undefined;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
      const finalName = `${id}${ext}`;
      const finalPath = path.join(LIVES_UPLOADS_DIR, finalName);
      try {
        fs.renameSync(req.file.path, finalPath);
        thumbnailUrl = `/uploads/lives/${finalName}`;
      } catch (err) {
        console.error('[live] thumbnail rename failed:', (err as Error).message);
      }
    }

    let sellerName: string | undefined;
    try {
      const [[sellerRow]]: any = await pool.query('SELECT nickname FROM users WHERE id = ?', [Number(sellerId)]);
      sellerName = sellerRow?.nickname || undefined;
    } catch { /* DB unavailable — proceed without sellerName */ }

    const liveState = createLive(id, { sellerId: String(sellerId), sellerName, title, thumbnailUrl, category, scheduledAt });

    // LiveKit 토큰 발급 (환경 변수 미설정이면 token 없이 응답)
    let token: string | null = null;
    if (apiKey && apiSecret && liveKitUrl) {
      try {
        const at = new AccessToken(apiKey, apiSecret, {
          identity: String(sellerId),
          ttl: '2h',
        });
        at.addGrant({
          roomJoin: true,
          room: id,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        });
        token = await at.toJwt();

        // LK-1: 토큰 응답 로깅
        console.log('[live/token]', {
          tokenPrefix: token.slice(0, 20),
          serverUrl: liveKitUrl,
          role: 'seller',
          room: id,
        });
      } catch (err) {
        console.error('[live/token] 실패', err);
      }
    }

    // upcoming이면 DB에 영속화
    if (liveState.status === 'upcoming') {
      try {
        await pool.query(
          `INSERT INTO lives (id, seller_id, seller_name, title, thumbnail_url, category, status, scheduled_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'upcoming', ?, ?)`,
          [liveState.id, Number(liveState.sellerId), liveState.sellerName ?? null,
           liveState.title, liveState.thumbnailUrl ?? null, liveState.category ?? null,
           liveState.scheduledAt ?? null, liveState.createdAt]
        );
      } catch (err) {
        console.warn('[live] DB INSERT 실패:', (err as Error).message);
      }
    }

    io.emit('lobby:live:new', { ...liveState, currentAuction: null });

    res.json({
      id: liveState.id,
      sellerId: liveState.sellerId,
      title: liveState.title,
      thumbnailUrl: liveState.thumbnailUrl ?? null,
      category: liveState.category ?? null,
      status: liveState.status,
      scheduledAt: liveState.scheduledAt ?? null,
      token,
      serverUrl: liveKitUrl ?? null,
    });
  });

  // GET /api/lives — 진행 중 방송 목록 (status='live')
  r.get('/', (_req: Request, res: Response) => {
    const result = Array.from(lives.values())
      .filter(l => l.status === 'live' || l.status === 'upcoming')
      .map(l => {
        const currentAuction = l.currentAuctionId ? (auctions.get(l.currentAuctionId) ?? null) : null;
        return { ...l, sellerName: l.sellerName ?? null, scheduledAt: l.scheduledAt ?? null, currentAuction };
      });
    res.json(result);
  });

  // GET /api/lives/:id — 단일 라이브 조회 (메모리에 없으면 DB fallback)
  r.get('/:id', async (req: Request, res: Response) => {
    const liveId = String(req.params.id);
    let live = lives.get(liveId);
    if (!live) {
      try {
        const [[row]]: any = await pool.query('SELECT * FROM lives WHERE id = ?', [liveId]);
        if (!row) { res.status(404).json({ error: 'Live not found' }); return; }
        live = {
          id: row.id, sellerId: String(row.seller_id), sellerName: row.seller_name ?? undefined,
          title: row.title, thumbnailUrl: row.thumbnail_url ?? undefined,
          category: row.category ?? undefined, status: row.status,
          scheduledAt: row.scheduled_at ? Number(row.scheduled_at) : undefined,
          viewerCount: 0, currentAuctionId: null, createdAt: Number(row.created_at),
        };
        lives.set(liveId, live);
      } catch {
        res.status(404).json({ error: 'Live not found' }); return;
      }
    }
    const currentAuction = live.currentAuctionId ? (auctions.get(live.currentAuctionId) ?? null) : null;
    res.json({
      liveId: live.id,
      sellerId: live.sellerId,
      sellerName: live.sellerName ?? null,
      title: live.title,
      thumbnailUrl: live.thumbnailUrl ?? null,
      status: live.status,
      startedAt: live.createdAt,
      currentAuction: currentAuction
        ? {
            auctionId: currentAuction.id,
            productName: currentAuction.productName,
            currentPrice: currentAuction.currentPrice,
            mode: currentAuction.mode,
            durationSec: currentAuction.durationSec,
            timeLeft: currentAuction.timeLeft,
            topBidder: currentAuction.topBidder,
            topBidderName: currentAuction.topBidderName,
            status: currentAuction.status,
            imageUrl: currentAuction.imageUrl ?? null,
          }
        : null,
    });
  });

  // PATCH /api/lives/:id/go-live — upcoming 라이브 방송 시작
  r.patch('/:id/go-live', async (req: Request, res: Response) => {
    const liveId = String(req.params.id);
    const { sellerId } = req.body as { sellerId?: string };

    let live = lives.get(liveId);

    // 메모리에 없으면 DB에서 조회
    if (!live) {
      try {
        const [[row]]: any = await pool.query('SELECT * FROM lives WHERE id = ?', [liveId]);
        if (!row) { res.status(404).json({ error: 'Live not found' }); return; }
        live = {
          id: row.id, sellerId: String(row.seller_id), sellerName: row.seller_name ?? undefined,
          title: row.title, thumbnailUrl: row.thumbnail_url ?? undefined,
          category: row.category ?? undefined, status: row.status,
          scheduledAt: row.scheduled_at ? Number(row.scheduled_at) : undefined,
          viewerCount: 0, currentAuctionId: null, createdAt: Number(row.created_at),
        };
        lives.set(liveId, live);
      } catch (err) {
        res.status(404).json({ error: 'Live not found' }); return;
      }
    }

    if (live.status !== 'upcoming') {
      res.status(409).json({ error: '이미 시작됐거나 종료된 라이브입니다.' }); return;
    }
    if (sellerId && live.sellerId !== String(sellerId)) {
      res.status(403).json({ error: '셀러 권한이 없습니다.' }); return;
    }

    // status → live
    live.status = 'live';

    // DB 업데이트
    try {
      await pool.query("UPDATE lives SET status = 'live' WHERE id = ?", [liveId]);
    } catch (err) {
      console.warn('[live] go-live DB UPDATE 실패:', (err as Error).message);
    }

    // LiveKit 토큰 발급
    const apiKey = process.env.LIVEKIT_KEY;
    const apiSecret = process.env.LIVEKIT_SECRET;
    const liveKitUrl = process.env.LIVEKIT_URL;
    let token: string | null = null;
    if (apiKey && apiSecret && liveKitUrl) {
      try {
        const at = new AccessToken(apiKey, apiSecret, {
          identity: live.sellerId, ttl: '2h',
        });
        at.addGrant({ roomJoin: true, room: liveId, canPublish: true, canSubscribe: true, canPublishData: true });
        token = await at.toJwt();
      } catch (err) {
        console.error('[live/go-live token] 실패', err);
      }
    }

    io.emit('lobby:live:new', { ...live, currentAuction: null });

    res.json({ id: liveId, token, serverUrl: liveKitUrl ?? null });
  });

  // PATCH /api/lives/:id/end — 방송 종료 (셀러 전용)
  r.patch('/:id/end', async (req: Request, res: Response) => {
    const liveId = String(req.params.id);
    const { sellerId } = req.body as { sellerId?: string };

    const live = lives.get(liveId);
    if (!live) {
      res.status(404).json({ error: 'Live not found' });
      return;
    }

    if (sellerId && live.sellerId !== String(sellerId)) {
      res.status(403).json({ error: '셀러 권한이 없습니다.' });
      return;
    }

    // 진행 중인 경매가 있으면 종료 불가
    if (live.currentAuctionId) {
      const activeAuction = auctions.get(live.currentAuctionId);
      if (activeAuction && activeAuction.status === 'live') {
        res.status(409).json({ error: '진행 중인 경매가 있습니다. 경매를 먼저 종료해 주세요.' });
        return;
      }
    }

    endLive(liveId);

    // DB 업데이트
    try {
      await pool.query("UPDATE lives SET status = 'ended' WHERE id = ?", [liveId]);
    } catch (err) {
      console.warn('[live] end DB UPDATE 실패:', (err as Error).message);
    }

    // 해당 룸의 구매자들에게 방송 종료 알림
    io.to(liveId).emit('live:ended', { liveId });
    // 로비 구독자들에게 목록 갱신 알림
    io.emit('lobby:live:ended', { id: liveId });
    res.json({ success: true });
  });

  // POST /api/lives/:liveId/auctions — 방송 중 상품 등록 (multipart/form-data 또는 JSON 모두 지원)
  r.post('/:liveId/auctions', upload.single('image'), async (req: Request, res: Response) => {
    const liveId = String(req.params.liveId);
    const live = lives.get(liveId);
    if (!live || live.status !== 'live') {
      // 업로드된 임시 파일 정리
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(404).json({ error: 'Live not found or not active' });
      return;
    }

    const { productName, startPrice, mode, durationSec, stockTotal } = req.body as {
      productName?: string;
      startPrice?: number;
      mode?: string;
      durationSec?: number;
      stockTotal?: number;
    };

    console.log('[auction:create] body=', req.body, 'file=', req.file ? { name: req.file.filename, size: req.file.size } : null);

    const resolvedMode = (['fcfs', 'blind', 'giveaway'].includes(mode ?? '')) ? mode as 'fcfs' | 'blind' | 'giveaway' : 'normal';
    const resolvedDuration = resolvedMode === 'giveaway' ? 10 : (durationSec !== undefined ? Number(durationSec) : 30);

    if (!productName || (resolvedMode !== 'giveaway' && startPrice === undefined)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: 'productName, startPrice 는 필수입니다.' });
      return;
    }

    // 모드별 durationSec 검증
    if (resolvedMode === 'normal') {
      if (resolvedDuration !== 30 && resolvedDuration !== 60) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: 'normal 모드의 durationSec 은 30 또는 60 이어야 합니다.' });
        return;
      }
    } else if (resolvedMode === 'fcfs') {
      if (
        resolvedDuration < 300 ||
        resolvedDuration > 3600 ||
        resolvedDuration % 300 !== 0
      ) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: 'fcfs 모드의 durationSec 은 300~3600 범위의 300 배수이어야 합니다.' });
        return;
      }
      const resolvedStock = stockTotal !== undefined ? Number(stockTotal) : undefined;
      if (resolvedStock === undefined || resolvedStock < 1 || resolvedStock > 99) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: 'fcfs 모드의 stockTotal 은 1~99 이어야 합니다.' });
        return;
      }
    } else if (resolvedMode === 'blind') {
      if (resolvedDuration !== 10 && resolvedDuration !== 20 && resolvedDuration !== 30) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: 'blind 모드의 durationSec 은 10, 20, 30 중 하나이어야 합니다.' });
        return;
      }
    } else if (resolvedMode === 'giveaway') {
      // durationSec 고정 10초, 서버에서 강제
    }

    const auctionId = crypto.randomUUID();

    // 이미지 파일을 auctionId 기반 최종 경로로 rename
    let imageUrl: string | undefined;
    if (req.file) {
      const finalName = `${auctionId}.jpg`;
      const finalPath = path.join(UPLOADS_DIR, finalName);
      try {
        fs.renameSync(req.file.path, finalPath);
        imageUrl = `/uploads/auctions/${finalName}`;
      } catch (err) {
        console.error('[auction] image rename failed:', (err as Error).message);
      }
    }

    createAuction(auctionId, {
      liveId,
      productName: String(productName),
      startPrice: resolvedMode === 'giveaway' ? 0 : Number(startPrice),
      sellerId: live.sellerId,
      mode: resolvedMode,
      durationSec: resolvedDuration,
      stockTotal: resolvedMode === 'fcfs' ? Number(stockTotal) : undefined,
      imageUrl,
    });

    // DB에도 저장 (영속화)
    try {
      await pool.query(
        `INSERT INTO auctions (id, seller_id, live_id, product_name, start_price, current_price, mode, image_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          auctionId,
          Number(live.sellerId),
          liveId,
          String(productName),
          resolvedMode === 'giveaway' ? 0 : Number(startPrice),
          resolvedMode === 'giveaway' ? 0 : Number(startPrice),
          resolvedMode,
          imageUrl ?? null,
        ],
      );
    } catch (e) {
      console.error('[auction] DB insert failed:', (e as Error).message);
    }

    res.json({ id: auctionId, imageUrl: imageUrl ?? null });
  });

  // PATCH /api/lives/:liveId/auctions/:auctionId/start — 경매 시작
  r.patch('/:liveId/auctions/:auctionId/start', (req: Request, res: Response) => {
    const liveId = String(req.params.liveId);
    const auctionId = String(req.params.auctionId);
    const live = lives.get(liveId);
    if (!live || live.status !== 'live') {
      res.status(404).json({ error: 'Live not found or not active' });
      return;
    }
    const auction = auctions.get(auctionId);
    if (!auction || auction.liveId !== liveId) {
      res.status(404).json({ error: 'Auction not found in this live' });
      return;
    }
    if (auction.status === 'live') {
      res.status(409).json({ error: '이미 진행 중인 경매입니다.' });
      return;
    }

    startTimer(auctionId, io, async (state) => {
      await endAuction(state);
    });

    // Live의 currentAuctionId는 startTimer 내부에서 업데이트됨
    const updatedLive = lives.get(liveId);
    io.emit('lobby:live:updated', updatedLive);

    res.json({ success: true });
  });

  // PATCH /api/lives/:liveId/auctions/:auctionId/end-fcfs — 선착순 셀러 중도 종료
  r.patch('/:liveId/auctions/:auctionId/end-fcfs', (req: Request, res: Response) => {
    const liveId = String(req.params.liveId);
    const auctionId = String(req.params.auctionId);
    const { sellerId } = req.body as { sellerId?: string };

    const live = lives.get(liveId);
    if (!live || live.status !== 'live') {
      res.status(404).json({ error: 'Live not found or not active' });
      return;
    }

    const auction = auctions.get(auctionId);
    if (!auction || auction.liveId !== liveId) {
      res.status(404).json({ error: 'Auction not found in this live' });
      return;
    }

    if (auction.mode !== 'fcfs') {
      res.status(400).json({ error: '선착순 경매가 아닙니다.' });
      return;
    }

    if (sellerId && auction.sellerId !== String(sellerId)) {
      res.status(403).json({ error: '셀러 권한이 없습니다.' });
      return;
    }

    if (auction.status !== 'live') {
      res.status(409).json({ error: '진행 중인 경매가 아닙니다.' });
      return;
    }

    const ok = endFcfsAuction(auctionId, io, async (state) => {
      await endAuction(state);
    });

    if (!ok) {
      res.status(409).json({ error: '경매를 종료할 수 없습니다.' });
      return;
    }

    res.json({ success: true });
  });

  // GET /api/lives/:liveId/auctions/:auctionId/bids — 블라인드 입찰 내역 조회
  r.get('/:liveId/auctions/:auctionId/bids', (req: Request, res: Response) => {
    const liveId = String(req.params.liveId);
    const auctionId = String(req.params.auctionId);

    // 메모리에 아직 있는 경우 (ended 직전) 또는 endedBlindBids에 보관된 경우 모두 처리
    const inMemory = auctions.get(auctionId);
    const savedBids = endedBlindBids.get(auctionId);

    // 아직 메모리에 있으면서 blind가 아닌 경우
    if (inMemory && inMemory.mode !== 'blind') {
      res.status(404).json({ error: '블라인드 경매가 아닙니다.' });
      return;
    }

    // 메모리에도 없고 endedBlindBids에도 없으면 404
    if (!inMemory && !savedBids) {
      res.status(404).json({ error: '경매를 찾을 수 없습니다.' });
      return;
    }

    // 진행 중인 경우 403
    if (inMemory && (inMemory.status !== 'ended' || !inMemory.revealAt)) {
      res.status(403).json({ error: '경매 종료 후에만 조회 가능합니다.' });
      return;
    }

    const bids = savedBids ?? (inMemory?.blindBids ?? []);
    const sorted = [...bids].sort((a, b) =>
      b.price !== a.price ? b.price - a.price : a.ts - b.ts,
    );

    res.json({ bids: sorted });
  });

  return r;
}
