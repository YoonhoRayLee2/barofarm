import { Router, Request, Response } from 'express';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { Server } from 'socket.io';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { lives, auctions, endedBlindBids, createLive, endLive, createAuction, startTimer, endFcfsAuction, LiveState } from '../store/memory';
import { endAuction } from '../services/livekit-service';
import { getUsersByInterest, notifyUsers } from '../services/notifications';
import pool from '../db/mysql';
import { requireAuth } from '../middleware/auth';

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'auctions');

const LIVES_UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'lives');
fs.mkdirSync(LIVES_UPLOADS_DIR, { recursive: true });

const uploadLiveThumbnail = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LIVES_UPLOADS_DIR),
    filename: (_req, file, cb) => {
      // 같은 요청에서 여러 파일이 동일 밀리초에 도착하면 Date.now()만으로는 충돌한다.
      // 랜덤 접미사를 더해 파일명 유일성을 보장한다.
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
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

// DB memo_images(JSON 문자열) → string[] (파싱 실패 시 [])
function parseMemoImages(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

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

// 라이브 알림 fan-out — 팔로워 ∪ 해당 카테고리 관심 사용자 (판매자 본인 제외)
// fire-and-forget 전용: 실패해도 본 API 응답에 영향 없음
async function fanOutLiveNotification(
  io: Server,
  live: LiveState,
  type: 'live_scheduled' | 'live_started',
  title: string,
): Promise<void> {
  try {
    const targets = new Set<number>();
    const [followers] = await pool.execute(
      'SELECT follower_id FROM follows WHERE following_id = ?',
      [Number(live.sellerId)],
    ) as [Array<{ follower_id: number }>, unknown];
    followers.forEach(({ follower_id }) => targets.add(Number(follower_id)));
    if (live.category) {
      (await getUsersByInterest(live.category)).forEach(uid => targets.add(uid));
    }
    targets.delete(Number(live.sellerId));
    if (targets.size > 0) {
      await notifyUsers(io, [...targets], {
        type,
        title,
        body: live.title,
        link: `/app/live-buyer/${live.id}`,
      });
    }
  } catch (err) {
    console.error('[live] notification fan-out 실패:', (err as Error).message);
  }
}

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
            memo: row.memo ?? null,
            memoImages: parseMemoImages(row.memo_images),
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
  r.post('/', uploadLiveThumbnail.fields([{ name: 'thumbnail', maxCount: 1 }, { name: 'memoImages', maxCount: 5 }]), async (req: Request, res: Response) => {
    const apiKey = process.env.LIVEKIT_KEY;
    const apiSecret = process.env.LIVEKIT_SECRET;
    const liveKitUrl = process.env.LIVEKIT_URL;

    const files = req.files as { thumbnail?: Express.Multer.File[]; memoImages?: Express.Multer.File[] } | undefined;
    const thumbnailFile = files?.thumbnail?.[0];
    const memoImageFiles = files?.memoImages ?? [];
    const unlinkUploaded = () => {
      if (thumbnailFile) fs.unlink(thumbnailFile.path, () => {});
      memoImageFiles.forEach(f => fs.unlink(f.path, () => {}));
    };

    const { sellerId, title, category, scheduledAt: scheduledAtRaw, memo: memoRaw } = req.body as { sellerId?: string; title?: string; category?: string; scheduledAt?: string; memo?: string };
    const scheduledAt = scheduledAtRaw ? Number(scheduledAtRaw) : undefined;
    if (!sellerId || !title) {
      unlinkUploaded();
      res.status(400).json({ error: 'sellerId, title 은 필수입니다.' });
      return;
    }

    const memo = memoRaw !== undefined ? String(memoRaw) : undefined;
    if (memo !== undefined && memo.length > 2000) {
      unlinkUploaded();
      res.status(400).json({ error: 'memo 는 최대 2000자입니다.' });
      return;
    }

    const id = crypto.randomUUID();

    // 썸네일 파일이 있으면 liveId 기반 최종 경로로 rename
    let thumbnailUrl: string | undefined;
    if (thumbnailFile) {
      const ext = path.extname(thumbnailFile.originalname).toLowerCase() || '.jpg';
      const finalName = `${id}${ext}`;
      const finalPath = path.join(LIVES_UPLOADS_DIR, finalName);
      try {
        fs.renameSync(thumbnailFile.path, finalPath);
        thumbnailUrl = `/uploads/lives/${finalName}`;
      } catch (err) {
        console.error('[live] thumbnail rename failed:', (err as Error).message);
      }
    }

    // 메모 이미지 rename — 실패한 파일만 제외하고 계속 진행 (라이브 생성은 항상 성공)
    const memoImages: string[] = [];
    memoImageFiles.forEach((file, i) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const finalName = `${id}_memo_${i}${ext}`;
      const finalPath = path.join(LIVES_UPLOADS_DIR, finalName);
      try {
        fs.renameSync(file.path, finalPath);
        memoImages.push(`/uploads/lives/${finalName}`);
      } catch (err) {
        console.error('[live] memo image rename failed:', (err as Error).message);
      }
    });

    let sellerName: string | undefined;
    try {
      const [[sellerRow]]: any = await pool.query('SELECT nickname FROM users WHERE id = ?', [Number(sellerId)]);
      sellerName = sellerRow?.nickname || undefined;
    } catch { /* DB unavailable — proceed without sellerName */ }

    const liveState = createLive(id, { sellerId: String(sellerId), sellerName, title, thumbnailUrl, category, scheduledAt, memo, memoImages });

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
          `INSERT INTO lives (id, seller_id, seller_name, title, thumbnail_url, category, status, scheduled_at, memo, memo_images, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'upcoming', ?, ?, ?, ?)`,
          [liveState.id, Number(liveState.sellerId), liveState.sellerName ?? null,
           liveState.title, liveState.thumbnailUrl ?? null, liveState.category ?? null,
           liveState.scheduledAt ?? null, liveState.memo ?? null,
           liveState.memoImages && liveState.memoImages.length > 0 ? JSON.stringify(liveState.memoImages) : null,
           liveState.createdAt]
        );
      } catch (err) {
        console.warn('[live] DB INSERT 실패:', (err as Error).message);
      }
    }

    io.emit('lobby:live:new', { ...liveState, currentAuction: null });

    // 팔로워에게 알림
    try {
      const [followers] = await pool.execute(
        'SELECT follower_id FROM follows WHERE following_id = ?',
        [Number(liveState.sellerId)],
      ) as [Array<{ follower_id: number }>, unknown];
      followers.forEach(({ follower_id }) => {
        io.to(`user:${follower_id}`).emit('follow:live:started', {
          liveId: liveState.id,
          sellerId: liveState.sellerId,
          sellerName: liveState.sellerName ?? '판매자',
          title: liveState.title,
          thumbnailUrl: liveState.thumbnailUrl ?? null,
        });
      });
    } catch { /* 알림 실패는 무시 */ }

    res.json({
      id: liveState.id,
      sellerId: liveState.sellerId,
      title: liveState.title,
      thumbnailUrl: liveState.thumbnailUrl ?? null,
      category: liveState.category ?? null,
      status: liveState.status,
      scheduledAt: liveState.scheduledAt ?? null,
      memo: liveState.memo ?? null,
      memoImages: liveState.memoImages ?? [],
      token,
      serverUrl: liveKitUrl ?? null,
    });

    // 팔로워 ∪ 관심 카테고리 사용자 DB 알림 + 소켓 push (fire-and-forget)
    void fanOutLiveNotification(
      io,
      liveState,
      liveState.status === 'upcoming' ? 'live_scheduled' : 'live_started',
      liveState.status === 'upcoming' ? '라이브 예고' : '라이브 시작',
    );
  });

  // GET /api/lives — 진행 중 방송 목록 (status='live')
  r.get('/', (_req: Request, res: Response) => {
    const result = Array.from(lives.values())
      .filter(l => l.status === 'live' || l.status === 'upcoming')
      .map(l => {
        const currentAuction = l.currentAuctionId ? (auctions.get(l.currentAuctionId) ?? null) : null;
        return { ...l, sellerName: l.sellerName ?? null, scheduledAt: l.scheduledAt ?? null, memoImages: l.memoImages ?? [], currentAuction };
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
          memo: row.memo ?? null,
          memoImages: parseMemoImages(row.memo_images),
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
      category: live.category ?? null,
      status: live.status,
      scheduledAt: live.scheduledAt ?? null,
      memo: live.memo ?? null,
      memoImages: live.memoImages ?? [],
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

  // PATCH /api/lives/:id/go-live — upcoming 라이브 방송 시작 (셀러 본인 전용)
  r.patch('/:id/go-live', requireAuth, async (req: Request, res: Response) => {
    const liveId = String(req.params.id);
    const sellerId = String(req.user!.userId);

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
          memo: row.memo ?? null,
          memoImages: parseMemoImages(row.memo_images),
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
    if (live.sellerId !== sellerId) {
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

    // 팔로워에게 알림
    try {
      const [followers] = await pool.execute(
        'SELECT follower_id FROM follows WHERE following_id = ?',
        [Number(live.sellerId)],
      ) as [Array<{ follower_id: number }>, unknown];
      followers.forEach(({ follower_id }) => {
        io.to(`user:${follower_id}`).emit('follow:live:started', {
          liveId: live.id,
          sellerId: live.sellerId,
          sellerName: live.sellerName ?? '판매자',
          title: live.title,
          thumbnailUrl: live.thumbnailUrl ?? null,
        });
      });
    } catch { /* 알림 실패는 무시 */ }

    res.json({ id: liveId, token, serverUrl: liveKitUrl ?? null });

    // 팔로워 ∪ 관심 카테고리 사용자 DB 알림 + 소켓 push (fire-and-forget)
    void fanOutLiveNotification(io, live, 'live_started', '라이브 시작');
  });

  // PATCH /api/lives/:id/memo — 라이브 메모 수정 (셀러 본인 전용, 메모 사진 개별 추가·삭제 지원)
  r.patch('/:id/memo', requireAuth, uploadLiveThumbnail.fields([{ name: 'newMemoImages', maxCount: 5 }]), async (req: Request, res: Response) => {
    const liveId = String(req.params.id);
    const sellerId = String(req.user!.userId);
    const { memo, keepImageUrls: keepImageUrlsRaw } = req.body as { memo?: string; keepImageUrls?: string };

    const files = req.files as { newMemoImages?: Express.Multer.File[] } | undefined;
    const newMemoImageFiles = files?.newMemoImages ?? [];
    const unlinkUploaded = () => { newMemoImageFiles.forEach(f => fs.unlink(f.path, () => {})); };

    if (memo !== undefined && typeof memo !== 'string') {
      unlinkUploaded();
      res.status(400).json({ error: 'memo 는 문자열이어야 합니다.' });
      return;
    }
    if (typeof memo === 'string' && memo.length > 2000) {
      unlinkUploaded();
      res.status(400).json({ error: 'memo 는 최대 2000자입니다.' });
      return;
    }

    let keepImageUrls: string[] | undefined;
    if (keepImageUrlsRaw !== undefined) {
      try {
        const parsed = JSON.parse(keepImageUrlsRaw);
        if (!Array.isArray(parsed) || !parsed.every((x): x is string => typeof x === 'string')) throw new Error('invalid');
        keepImageUrls = parsed;
      } catch {
        unlinkUploaded();
        res.status(400).json({ error: 'keepImageUrls 는 문자열 배열(JSON)이어야 합니다.' });
        return;
      }
    }

    let live = lives.get(liveId);
    if (!live) {
      try {
        const [[row]]: any = await pool.query('SELECT * FROM lives WHERE id = ?', [liveId]);
        if (!row) { unlinkUploaded(); res.status(404).json({ error: 'Live not found' }); return; }
        live = {
          id: row.id, sellerId: String(row.seller_id), sellerName: row.seller_name ?? undefined,
          title: row.title, thumbnailUrl: row.thumbnail_url ?? undefined,
          category: row.category ?? undefined, status: row.status,
          scheduledAt: row.scheduled_at ? Number(row.scheduled_at) : undefined,
          memo: row.memo ?? null,
          memoImages: parseMemoImages(row.memo_images),
          viewerCount: 0, currentAuctionId: null, createdAt: Number(row.created_at),
        };
        lives.set(liveId, live);
      } catch {
        unlinkUploaded();
        res.status(404).json({ error: 'Live not found' }); return;
      }
    }

    if (live.sellerId !== String(sellerId)) {
      unlinkUploaded();
      res.status(403).json({ error: '셀러 권한이 없습니다.' });
      return;
    }

    // 사진 관련 필드가 전혀 없으면 기존 동작(텍스트만 수정)과 100% 동일하게 처리
    const touchesImages = keepImageUrls !== undefined || newMemoImageFiles.length > 0;

    let finalMemoImages = live.memoImages ?? [];

    if (touchesImages) {
      const existing = live.memoImages ?? [];
      const kept = keepImageUrls !== undefined ? existing.filter(url => keepImageUrls!.includes(url)) : existing;
      const removed = existing.filter(url => !kept.includes(url));

      if (kept.length + newMemoImageFiles.length > 5) {
        unlinkUploaded();
        res.status(400).json({ error: '메모 사진은 최대 5장까지 등록 가능합니다.' });
        return;
      }

      // 새 파일들을 생성 로직과 동일한 방식으로 최종 경로에 저장
      const addedImages: string[] = [];
      newMemoImageFiles.forEach((file, i) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        const finalName = `${liveId}_memo_${Date.now()}_${i}${ext}`;
        const finalPath = path.join(LIVES_UPLOADS_DIR, finalName);
        try {
          fs.renameSync(file.path, finalPath);
          addedImages.push(`/uploads/lives/${finalName}`);
        } catch (err) {
          console.error('[live] memo image rename failed:', (err as Error).message);
        }
      });

      // 목록에서 빠진 기존 이미지의 실제 파일 삭제 (실패해도 무시)
      removed.forEach(url => {
        const fileName = path.basename(url);
        fs.unlink(path.join(LIVES_UPLOADS_DIR, fileName), () => {});
      });

      finalMemoImages = [...kept, ...addedImages];
      live.memoImages = finalMemoImages;
    }

    if (typeof memo === 'string') {
      live.memo = memo;
    }

    // DB 동기 갱신 (DB 미영속 라이브면 0행 갱신 — 무해)
    try {
      if (typeof memo === 'string' && touchesImages) {
        await pool.query('UPDATE lives SET memo = ?, memo_images = ? WHERE id = ?', [memo, finalMemoImages.length > 0 ? JSON.stringify(finalMemoImages) : null, liveId]);
      } else if (typeof memo === 'string') {
        await pool.query('UPDATE lives SET memo = ? WHERE id = ?', [memo, liveId]);
      } else if (touchesImages) {
        await pool.query('UPDATE lives SET memo_images = ? WHERE id = ?', [finalMemoImages.length > 0 ? JSON.stringify(finalMemoImages) : null, liveId]);
      }
    } catch (err) {
      console.warn('[live] memo DB UPDATE 실패:', (err as Error).message);
    }

    // 이미 입장해 있는 버이어들에게 실시간 반영 — 없으면 페이지 재진입 전까지 옛 메모가 보임
    io.to(liveId).emit('live:memo:updated', { liveId, memo: live.memo, memoImages: finalMemoImages });

    res.json({ memo: live.memo, memoImages: finalMemoImages });
  });

  // PATCH /api/lives/:id/end — 방송 종료 (셀러 전용)
  r.patch('/:id/end', requireAuth, async (req: Request, res: Response) => {
    const liveId = String(req.params.id);
    const sellerId = String(req.user!.userId);

    const live = lives.get(liveId);
    if (!live) {
      res.status(404).json({ error: 'Live not found' });
      return;
    }

    if (live.sellerId !== sellerId) {
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

  // POST /api/lives/:liveId/auctions — 방송 중 상품 등록 (셀러 본인 전용, multipart/form-data 또는 JSON 모두 지원)
  r.post('/:liveId/auctions', requireAuth, upload.single('image'), async (req: Request, res: Response) => {
    const liveId = String(req.params.liveId);
    const live = lives.get(liveId);
    if (!live || live.status !== 'live') {
      // 업로드된 임시 파일 정리
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(404).json({ error: 'Live not found or not active' });
      return;
    }
    if (live.sellerId !== String(req.user!.userId)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(403).json({ error: '셀러 권한이 없습니다.' });
      return;
    }

    const { productName, startPrice, mode, durationSec, stockTotal, unitCount, unitLabel } = req.body as {
      productName?: string;
      startPrice?: number;
      mode?: string;
      durationSec?: number;
      stockTotal?: number;
      unitCount?: number;
      unitLabel?: string;
    };

    console.log('[auction:create] body=', req.body, 'file=', req.file ? { name: req.file.filename, size: req.file.size } : null);

    const resolvedMode = (['fcfs', 'blind', 'giveaway'].includes(mode ?? '')) ? mode as 'fcfs' | 'blind' | 'giveaway' : 'normal';
    const resolvedDuration = resolvedMode === 'giveaway' ? 20 : (durationSec !== undefined ? Number(durationSec) : 30);

    if (!productName || (resolvedMode !== 'giveaway' && startPrice === undefined)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: 'productName, startPrice 는 필수입니다.' });
      return;
    }

    // unitCount 검증 (전달된 경우만)
    if (unitCount !== undefined) {
      const uc = Number(unitCount);
      if (!Number.isInteger(uc) || uc < 1) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: 'unitCount 는 1 이상의 정수여야 합니다.' });
        return;
      }
    }

    // 시작가는 100원 단위로 제한 (blind/giveaway 는 시작가 미사용)
    if (resolvedMode !== 'giveaway' && resolvedMode !== 'blind') {
      const sp = Number(startPrice);
      if (!Number.isInteger(sp) || sp < 0 || sp % 100 !== 0) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: 'startPrice 는 0 이상의 100원 단위 정수여야 합니다.' });
        return;
      }
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

    const resolvedUnitCount = unitCount !== undefined ? Number(unitCount) : 1;
    const resolvedUnitLabel = unitLabel !== undefined ? String(unitLabel) : '';

    // 판매자 합배송비 조회 (생성 시 1회 캐시 — 매 emit마다 조회하지 않음)
    let sellerShippingFee = 3000;
    try {
      const [feeRows] = await pool.query<any[]>(
        'SELECT seller_shipping_fee FROM users WHERE id = ?',
        [Number(live.sellerId)],
      );
      if (Array.isArray(feeRows) && feeRows.length > 0 && feeRows[0].seller_shipping_fee != null) {
        sellerShippingFee = Number(feeRows[0].seller_shipping_fee);
      }
    } catch (e) {
      console.error('[auction] seller_shipping_fee 조회 실패, 기본값 사용:', (e as Error).message);
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
      unitCount: resolvedUnitCount,
      unitLabel: resolvedUnitLabel,
      sellerShippingFee,
    });

    // DB에도 저장 (영속화)
    try {
      await pool.query(
        `INSERT INTO auctions (id, seller_id, live_id, product_name, start_price, current_price, mode, image_url, status, unit_count, unit_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          auctionId,
          Number(live.sellerId),
          liveId,
          String(productName),
          resolvedMode === 'giveaway' ? 0 : Number(startPrice),
          resolvedMode === 'giveaway' ? 0 : Number(startPrice),
          resolvedMode,
          imageUrl ?? null,
          resolvedUnitCount,
          resolvedUnitLabel,
        ],
      );
    } catch (e) {
      console.error('[auction] DB insert failed:', (e as Error).message);
    }

    res.json({ id: auctionId, imageUrl: imageUrl ?? null });
  });

  // PATCH /api/lives/:liveId/auctions/:auctionId/start — 경매 시작
  r.patch('/:liveId/auctions/:auctionId/start', requireAuth, (req: Request, res: Response) => {
    const liveId = String(req.params.liveId);
    const auctionId = String(req.params.auctionId);
    const live = lives.get(liveId);
    if (!live || live.status !== 'live') {
      res.status(404).json({ error: 'Live not found or not active' });
      return;
    }
    if (live.sellerId !== String(req.user!.userId)) {
      res.status(403).json({ error: '셀러 권한이 없습니다.' });
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

    const auctionState = auctions.get(auctionId);
    if (auctionState) {
      io.to(liveId).emit('auction:new', {
        auctionId,
        liveId,
        productName: auctionState.productName,
        startPrice: auctionState.startPrice,
        mode: auctionState.mode,
      });
    }

    res.json({ success: true });
  });

  // PATCH /api/lives/:liveId/auctions/:auctionId/end-fcfs — 선착순 셀러 중도 종료
  r.patch('/:liveId/auctions/:auctionId/end-fcfs', requireAuth, (req: Request, res: Response) => {
    const liveId = String(req.params.liveId);
    const auctionId = String(req.params.auctionId);
    const sellerId = String(req.user!.userId);

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

    if (auction.sellerId !== sellerId) {
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
