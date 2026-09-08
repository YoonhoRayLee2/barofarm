// 결제비밀번호 API — 원문/해시는 응답에 절대 포함하지 않는다.

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createCredential,
  changeCredential,
  verifyCredential,
  resetCredential,
  getCredentialStatus,
  PaymentCredentialError,
} from '../services/payment-credential';
import { revokeAllSessionsForUser } from '../services/payment-auth-session';

const router = Router();
router.use(requireAuth);

function handleCredentialError(err: unknown, res: Response): void {
  if (err instanceof PaymentCredentialError) {
    const status = err.code === 'PAYMENT_PASSWORD_ALREADY_SET' ? 409 : 400;
    res.status(status).json({
      error: err.code,
      message: err.message,
      lockedUntil: err.lockedUntil ? err.lockedUntil.toISOString() : undefined,
    });
    return;
  }
  console.error('[payment-credentials]', err);
  res.status(500).json({ error: 'internal_error' });
}

// GET /api/payment-credentials/status
router.get('/status', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const status = await getCredentialStatus(userId);
    res.json(status);
  } catch (err) {
    handleCredentialError(err, res);
  }
});

// POST /api/payment-credentials — 최초 설정
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { password } = req.body as { password?: string };
  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'password is required' });
    return;
  }

  try {
    await createCredential(userId, password);
    res.status(201).json({ ok: true });
  } catch (err) {
    handleCredentialError(err, res);
  }
});

// PUT /api/payment-credentials — 변경 (현재 비번 검증 필요)
router.put('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'currentPassword, newPassword are required' });
    return;
  }

  try {
    await changeCredential(userId, currentPassword, newPassword);
    // 비밀번호 변경 시 해당 사용자의 모든 결제 인증세션을 폐기한다.
    await revokeAllSessionsForUser(userId, 'PASSWORD_CHANGED');
    res.json({ ok: true });
  } catch (err) {
    handleCredentialError(err, res);
  }
});

// POST /api/payment-credentials/verify — 단순 검증(세션 발급 없음)
router.post('/verify', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'password is required' });
    return;
  }

  try {
    const result = await verifyCredential(userId, password);
    res.json({ ok: true, passwordVersion: result.passwordVersion });
  } catch (err) {
    handleCredentialError(err, res);
  }
});

// POST /api/payment-credentials/reset — 계정 로그인 비밀번호로 재확인 후 초기화
router.post('/reset', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { loginPassword } = req.body as { loginPassword?: string };
  if (!loginPassword) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'loginPassword is required' });
    return;
  }

  try {
    await resetCredential(userId, loginPassword);
    // 초기화 시에도 인증세션 전체 폐기
    await revokeAllSessionsForUser(userId, 'PASSWORD_RESET');
    res.json({ ok: true });
  } catch (err) {
    handleCredentialError(err, res);
  }
});

export default router;
