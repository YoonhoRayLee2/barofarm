import { Router, Request, Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';

const router = Router();

type Role = 'seller' | 'buyer';

interface TokenRequestBody {
  roomName?: string;
  userId?: string | number;
  role?: Role;
}

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

  if (!roomName || !userId || !role) {
    res.status(400).json({
      error: '필수 파라미터가 누락되었습니다. roomName, userId, role 을 모두 전달해 주세요.',
    });
    return;
  }

  if (role !== 'seller' && role !== 'buyer') {
    res.status(400).json({
      error: 'role 값은 "seller" 또는 "buyer" 여야 합니다.',
    });
    return;
  }

  try {
    const token = new AccessToken(apiKey, apiSecret, {
      identity: String(userId),
      ttl: '2h',
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: role === 'seller',
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();
    res.json({
      token: jwt,
      serverUrl: liveKitUrl,
      role,
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
