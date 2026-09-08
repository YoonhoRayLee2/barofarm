// 결제 인증세션 API — 세션 원문 토큰은 HttpOnly 쿠키로만 전달한다(응답 바디/로그에 토큰 노출 금지).

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { verifyCredential, PaymentCredentialError } from '../services/payment-credential';
import {
  issueSession,
  validateSessionToken,
  revokeSessionByToken,
  revokeAllSessionsForUser,
  setSessionCookie,
  clearSessionCookie,
  getSessionTokenFromRequest,
  PaymentAuthSessionErrorCode,
  AuthenticationPurpose,
} from '../services/payment-auth-session';

const router = Router();
router.use(requireAuth);

const VALID_PURPOSES: AuthenticationPurpose[] = ['PAYMENT', 'AUCTION_ENTRY', 'HIGH_VALUE_BID', 'HIGH_VALUE_PAYMENT'];

function getDeviceId(req: Request): string | null {
  const header = req.headers['x-device-id'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const body = (req.body as { deviceId?: string })?.deviceId;
  return body ? String(body).trim() : null;
}

function reasonToErrorCode(reason: string): PaymentAuthSessionErrorCode {
  if (reason === 'REVOKED' || reason === 'DEVICE_MISMATCH') return PaymentAuthSessionErrorCode.REVOKED;
  return PaymentAuthSessionErrorCode.EXPIRED; // NOT_FOUND, EXPIRED 모두 "재인증 필요"로 동일 취급
}

// POST /api/payment-auth/sessions — 결제비밀번호 검증 → 인증세션 발급(쿠키)
router.post('/sessions', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { password, purpose, scopeType, scopeId } = req.body as {
    password?: string;
    purpose?: string;
    scopeType?: string;
    scopeId?: string;
  };

  if (!password) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'password is required' });
    return;
  }
  if (!purpose || !VALID_PURPOSES.includes(purpose as AuthenticationPurpose)) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: `purpose must be one of ${VALID_PURPOSES.join(', ')}` });
    return;
  }

  try {
    await verifyCredential(userId, password);

    const deviceId = getDeviceId(req);
    const issued = await issueSession({
      userId,
      purpose: purpose as AuthenticationPurpose,
      deviceId,
      scopeType: scopeType ?? null,
      scopeId: scopeId ?? null,
    });

    setSessionCookie(res, issued.token, issued.absoluteExpiresAt);

    res.status(201).json({
      ok: true,
      purpose: issued.purpose,
      scopeType: scopeType ?? null,
      scopeId: scopeId ?? null,
      expiresAt: issued.expiresAt.toISOString(),
      absoluteExpiresAt: issued.absoluteExpiresAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof PaymentCredentialError) {
      res.status(400).json({ error: err.code, message: err.message });
      return;
    }
    console.error('[payment-auth] POST /sessions', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/payment-auth/sessions/current
router.get('/sessions/current', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: PaymentAuthSessionErrorCode.EXPIRED, message: '인증세션이 없습니다' });
    return;
  }

  try {
    const result = await validateSessionToken(token, { deviceId: getDeviceId(req) });
    if (!result.valid) {
      clearSessionCookie(res);
      res.status(401).json({ error: reasonToErrorCode(result.reason), message: '인증세션이 유효하지 않습니다' });
      return;
    }
    if (result.session.userId !== userId) {
      // 토큰-사용자 불일치(계정 전환 등) — 안전을 위해 세션 폐기
      await revokeSessionByToken(token, 'USER_MISMATCH');
      clearSessionCookie(res);
      res.status(401).json({ error: PaymentAuthSessionErrorCode.REVOKED, message: '인증세션이 유효하지 않습니다' });
      return;
    }

    res.json({
      valid: true,
      purpose: result.session.purpose,
      scopeType: result.session.scopeType,
      scopeId: result.session.scopeId,
      authenticatedAt: result.session.authenticatedAt,
      lastUsedAt: result.session.lastUsedAt,
      expiresAt: result.session.expiresAt.toISOString(),
      absoluteExpiresAt: result.session.absoluteExpiresAt,
    });
  } catch (err) {
    console.error('[payment-auth] GET /sessions/current', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/payment-auth/sessions/current — 사용자 직접 해제
router.delete('/sessions/current', async (req: Request, res: Response) => {
  const token = getSessionTokenFromRequest(req);
  try {
    if (token) {
      await revokeSessionByToken(token, 'USER_REVOKED');
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    console.error('[payment-auth] DELETE /sessions/current', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/payment-auth/sessions/all — 전체 세션 강제 종료(다른 디바이스 포함)
router.delete('/sessions/all', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    await revokeAllSessionsForUser(userId, 'USER_REVOKED_ALL');
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    console.error('[payment-auth] DELETE /sessions/all', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
