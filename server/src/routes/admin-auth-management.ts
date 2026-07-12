// 어드민 인증 관리 API (Phase 7, §19-3) — 결제비밀번호 설정여부/실패횟수/잠금상태 조회, 결제비밀번호 강제초기화,
// 결제 인증세션/경매 입장세션 강제종료.
//
// 결제비밀번호는 해시(user_payment_credentials.password_hash)만 존재하고, 이 라우터를 포함해 어디에서도
// 원문을 조회/응답하지 않는다 — status 조회는 services/payment-credential.ts의 getCredentialStatus만 사용한다
// (해시 컬럼을 SELECT하는 쿼리는 이 파일에 없음).
//
// 어드민 강제 초기화(resetByAdmin)는 자기 자신의 로그인 비밀번호로 재확인하는 사용자 셀프서비스 초기화
// (services/payment-credential.ts resetCredential)와는 별개 경로다 — 관리자는 사용자의 로그인 비밀번호를
// 알 수 없으므로 관리자 권한(requireAdmin) 자체를 근거로 강제 삭제한다. 위험작업이므로 reason 필수 + 감사로그.

import { Router, Request, Response } from 'express';
import pool from '../db/mysql';
import { requireAdmin } from '../middleware/admin-auth';
import { recordAdminAction } from '../services/admin-audit';
import { getCredentialStatus } from '../services/payment-credential';
import { revokeAllSessionsForUser, revokeSessionById } from '../services/payment-auth-session';
import { revokeAllAccessSessionsForUser, revokeAccessSessionById } from '../services/auction-access';

export default function createAdminAuthManagementRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  // GET /users/:userId/payment-auth — 결제비밀번호 상태 + 최근 인증세션(결제/경매입장) 목록
  router.get('/users/:userId/payment-auth', async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'userId is invalid' });
      return;
    }
    try {
      const credential = await getCredentialStatus(userId);
      const [paymentAuthSessions] = await pool.query<any>(
        `SELECT id, authentication_purpose AS purpose, scope_type, scope_id, device_id,
                authenticated_at, last_used_at, expires_at, absolute_expires_at, status
           FROM payment_auth_sessions
          WHERE user_id = ?
          ORDER BY id DESC LIMIT 20`,
        [userId],
      ) as any;
      const [auctionAccessSessions] = await pool.query<any>(
        `SELECT id, auction_id, auction_group_id, scope_type, seller_id,
                authenticated_at, last_used_at, expires_at, status
           FROM auction_access_sessions
          WHERE user_id = ?
          ORDER BY id DESC LIMIT 20`,
        [userId],
      ) as any;
      res.json({ userId, credential, paymentAuthSessions, auctionAccessSessions });
    } catch (err) {
      console.error('[admin-auth-management/users/:userId/payment-auth]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /users/:userId/payment-credential/reset — 결제비밀번호 강제 초기화 + 전체 인증세션 폐기. body: { reason(필수) }
  router.post('/users/:userId/payment-credential/reset', async (req: Request, res: Response) => {
    const userId = Number(req.params.userId);
    const { reason } = req.body as { reason?: string };
    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'userId is invalid' });
      return;
    }
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'reason(초기화 사유)은 필수입니다' });
      return;
    }
    try {
      const [[user]] = await pool.query<any>('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]) as any;
      if (!user) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }

      await pool.query('DELETE FROM user_payment_credentials WHERE user_id = ?', [userId]);
      await revokeAllSessionsForUser(userId, 'ADMIN_RESET');
      await revokeAllAccessSessionsForUser(userId, 'ADMIN_RESET');

      await recordAdminAction({
        administratorId: req.adminUserId!,
        actionType: 'PAYMENT_CREDENTIAL_ADMIN_RESET',
        targetType: 'USER',
        targetId: userId,
        reason,
        requestIp: req.ip ?? null,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('[admin-auth-management/payment-credential/reset]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /payment-auth-sessions/:sessionId/revoke — 결제 인증세션 강제종료. body: { reason(필수) }
  router.post('/payment-auth-sessions/:sessionId/revoke', async (req: Request, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    const { reason } = req.body as { reason?: string };
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'reason(종료 사유)은 필수입니다' });
      return;
    }
    try {
      const [[session]] = await pool.query<any>(
        'SELECT id, user_id, status FROM payment_auth_sessions WHERE id = ? LIMIT 1',
        [sessionId],
      ) as any;
      if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }

      await revokeSessionById(sessionId, 'ADMIN_FORCE_TERMINATED');

      await recordAdminAction({
        administratorId: req.adminUserId!,
        actionType: 'PAYMENT_AUTH_SESSION_ADMIN_REVOKE',
        targetType: 'PAYMENT_AUTH_SESSION',
        targetId: sessionId,
        reason,
        metadata: { userId: session.user_id },
        requestIp: req.ip ?? null,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('[admin-auth-management/payment-auth-sessions/:sessionId/revoke]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /auction-access-sessions/:sessionId/revoke — 경매 입장세션 강제종료. body: { reason(필수) }
  router.post('/auction-access-sessions/:sessionId/revoke', async (req: Request, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    const { reason } = req.body as { reason?: string };
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'reason(종료 사유)은 필수입니다' });
      return;
    }
    try {
      const [[session]] = await pool.query<any>(
        'SELECT id, user_id, status FROM auction_access_sessions WHERE id = ? LIMIT 1',
        [sessionId],
      ) as any;
      if (!session) { res.status(404).json({ error: 'SESSION_NOT_FOUND' }); return; }

      await revokeAccessSessionById(sessionId, 'ADMIN_FORCE_TERMINATED');

      await recordAdminAction({
        administratorId: req.adminUserId!,
        actionType: 'AUCTION_ACCESS_SESSION_ADMIN_REVOKE',
        targetType: 'AUCTION_ACCESS_SESSION',
        targetId: sessionId,
        reason,
        metadata: { userId: session.user_id },
        requestIp: req.ip ?? null,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('[admin-auth-management/auction-access-sessions/:sessionId/revoke]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
}
