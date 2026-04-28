import { Router, Request, Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { Server } from 'socket.io';
import { lives, auctions, createLive, endLive, createAuction, startTimer } from '../store/memory';
import { endAuction } from '../services/livekit-service';

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
    res.json({
      token: jwt,
      serverUrl: liveKitUrl,
      role: resolvedRole,
      roomName,
    });
  } catch (err) {
    console.error('[live/token] 토큰 발급 실패:', err);
    res.status(500).json({
      error: 'LiveKit 토큰 발급 중 오류가 발생했습니다.',
    });
  }
});

export default router;

// io를 주입받는 라우터 팩토리
export function createLiveRouter(io: Server) {
  const r = Router();

  // POST /api/lives — Live 생성 + LiveKit 토큰 발급
  r.post('/', async (req: Request, res: Response) => {
    const apiKey = process.env.LIVEKIT_KEY;
    const apiSecret = process.env.LIVEKIT_SECRET;
    const liveKitUrl = process.env.LIVEKIT_URL;

    const { sellerId, title } = req.body as { sellerId?: string; title?: string };
    if (!sellerId || !title) {
      res.status(400).json({ error: 'sellerId, title 은 필수입니다.' });
      return;
    }

    const id = crypto.randomUUID();
    const liveState = createLive(id, { sellerId: String(sellerId), title });

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
      } catch (err) {
        console.error('[lives] 토큰 발급 실패:', err);
      }
    }

    io.emit('lobby:live:new', { ...liveState, currentAuction: null });

    res.json({
      id: liveState.id,
      sellerId: liveState.sellerId,
      title: liveState.title,
      status: liveState.status,
      token,
      serverUrl: liveKitUrl ?? null,
    });
  });

  // GET /api/lives — 진행 중 방송 목록 (status='live')
  r.get('/', (_req: Request, res: Response) => {
    const result = Array.from(lives.values())
      .filter(l => l.status === 'live')
      .map(l => {
        const currentAuction = l.currentAuctionId ? (auctions.get(l.currentAuctionId) ?? null) : null;
        return { ...l, currentAuction };
      });
    res.json(result);
  });

  // PATCH /api/lives/:id/end — 방송 종료
  r.patch('/:id/end', (req: Request, res: Response) => {
    const liveId = String(req.params.id);
    const live = lives.get(liveId);
    if (!live) {
      res.status(404).json({ error: 'Live not found' });
      return;
    }
    endLive(liveId);
    io.emit('lobby:live:ended', { id: liveId });
    res.json({ success: true });
  });

  // POST /api/lives/:liveId/auctions — 방송 중 상품 등록
  r.post('/:liveId/auctions', (req: Request, res: Response) => {
    const liveId = String(req.params.liveId);
    const live = lives.get(liveId);
    if (!live || live.status !== 'live') {
      res.status(404).json({ error: 'Live not found or not active' });
      return;
    }
    const { productName, startPrice } = req.body as { productName?: string; startPrice?: number };
    if (!productName || startPrice === undefined) {
      res.status(400).json({ error: 'productName, startPrice 는 필수입니다.' });
      return;
    }
    const auctionId = crypto.randomUUID();
    createAuction(auctionId, {
      liveId,
      productName: String(productName),
      startPrice: Number(startPrice),
      sellerId: live.sellerId,
    });
    res.json({ id: auctionId });
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

  return r;
}
