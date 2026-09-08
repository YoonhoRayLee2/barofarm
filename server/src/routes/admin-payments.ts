// 어드민 결제 관리 API (Phase 7, §19-1) — 목록/검색/상세/전체취소/부분취소/이벤트로그.
// 실제 취소 로직은 services/payment-orchestrator.ts의 cancelPayment/partialCancelPayment를 그대로 재사용한다
// (payments.status 전이는 그 파일의 transitionPayment 외 경로로 하지 않는다는 원칙을 이 라우터도 그대로 따른다).
// cancelPayment/partialCancelPayment는 호출자 본인 확인(assertOwnership)을 하므로, 어드민 대행 취소 시에는
// 주문의 실제 소유자(order.user_id)를 조회해 그 값으로 호출한다(관리자 자신의 id가 아님).

import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import pool from '../db/mysql';
import { requireAdmin } from '../middleware/admin-auth';
import { recordAdminAction } from '../services/admin-audit';
import {
  cancelPayment,
  partialCancelPayment,
  PaymentOrchestratorError,
} from '../services/payment-orchestrator';

function handleError(err: unknown, res: Response): void {
  if (err instanceof PaymentOrchestratorError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  console.error('[admin-payments]', err);
  res.status(500).json({ error: 'server error' });
}

export default function createAdminPaymentsRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  // GET / — 결제 내역 목록 (주문번호/아이디/닉네임 검색, 상태·수단 필터, 페이징)
  router.get('/', async (req: Request, res: Response) => {
    const { q, status, method, page = '1' } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const pageSize = 20;
    const offset = (pageNum - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    if (q) {
      conditions.push('(o.order_number LIKE ? OR u.username LIKE ? OR u.nickname LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status) { conditions.push('p.status = ?'); params.push(status); }
    if (method) { conditions.push('p.method = ?'); params.push(method); }
    const where = `WHERE ${conditions.join(' AND ')}`;

    try {
      const [[{ total }]] = await pool.query<any>(
        `SELECT COUNT(*) AS total FROM payments p
           JOIN orders o ON o.id = p.order_id
           JOIN users u ON u.id = o.user_id
         ${where}`,
        params,
      ) as any;
      const [rows] = await pool.query<any>(
        `SELECT p.id, p.order_id, p.payment_key, p.provider, p.method, p.requested_amount, p.approved_amount,
                p.canceled_amount, p.status, p.requested_at, p.approved_at, p.canceled_at, p.failure_code,
                o.order_number, o.user_id, o.auction_id, u.username, u.nickname
           FROM payments p
           JOIN orders o ON o.id = p.order_id
           JOIN users u ON u.id = o.user_id
         ${where}
         ORDER BY p.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      ) as any;
      res.json({ payments: rows, total, page: pageNum, pageSize });
    } catch (err) {
      console.error('[admin-payments/list]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /:id — 결제 상세 (payment + order + 사용자 + payment_transactions 이벤트로그)
  router.get('/:id', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    try {
      const [[payment]] = await pool.query<any>(
        `SELECT p.*, o.order_number, o.user_id, o.auction_id, o.original_amount, o.auction_fee_amount,
                o.discount_amount, o.shipping_amount, o.point_used_amount, o.money_used_amount,
                o.external_payment_amount, o.payment_amount, o.status AS order_status, o.payment_due_at,
                u.username, u.nickname
           FROM payments p
           JOIN orders o ON o.id = p.order_id
           JOIN users u ON u.id = o.user_id
          WHERE p.id = ? LIMIT 1`,
        [id],
      ) as any;
      if (!payment) { res.status(404).json({ error: 'not found' }); return; }
      const [events] = await pool.query<any>(
        'SELECT * FROM payment_transactions WHERE payment_id = ? ORDER BY created_at DESC, id DESC',
        [id],
      ) as any;
      res.json({ ...payment, events });
    } catch (err) {
      console.error('[admin-payments/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /:id/cancel — 전체취소. body: { reason(필수), idempotencyKey? }
  router.post('/:id/cancel', async (req: Request, res: Response) => {
    const paymentId = Number(req.params.id);
    const { reason, idempotencyKey } = req.body as { reason?: string; idempotencyKey?: string };
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'reason(취소 사유)은 필수입니다' });
      return;
    }
    try {
      const [[row]] = await pool.query<any>(
        'SELECT o.user_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = ? LIMIT 1',
        [paymentId],
      ) as any;
      if (!row) { res.status(404).json({ error: 'PAYMENT_NOT_FOUND', message: 'payment not found' }); return; }

      const key = idempotencyKey || `ADMIN_CANCEL_${paymentId}_${crypto.randomUUID()}`;
      const result = await cancelPayment(row.user_id, paymentId, { idempotencyKey: key, reason });

      await recordAdminAction({
        administratorId: req.adminUserId!,
        actionType: 'PAYMENT_CANCEL',
        targetType: 'PAYMENT',
        targetId: paymentId,
        reason,
        metadata: { idempotencyKey: key, canceledAmount: result.canceledAmount, status: result.status },
        requestIp: req.ip ?? null,
      });

      res.json({ ok: true, payment: result });
    } catch (err) {
      handleError(err, res);
    }
  });

  // POST /:id/partial-cancel — 부분취소. body: { cancelAmount(필수), reason(필수), idempotencyKey? }
  router.post('/:id/partial-cancel', async (req: Request, res: Response) => {
    const paymentId = Number(req.params.id);
    const { cancelAmount, reason, idempotencyKey } = req.body as {
      cancelAmount?: number; reason?: string; idempotencyKey?: string;
    };
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'reason(취소 사유)은 필수입니다' });
      return;
    }
    if (!Number.isFinite(cancelAmount) || (cancelAmount as number) <= 0) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'cancelAmount는 양수여야 합니다' });
      return;
    }
    try {
      const [[row]] = await pool.query<any>(
        'SELECT o.user_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = ? LIMIT 1',
        [paymentId],
      ) as any;
      if (!row) { res.status(404).json({ error: 'PAYMENT_NOT_FOUND', message: 'payment not found' }); return; }

      const key = idempotencyKey || `ADMIN_PARTIAL_CANCEL_${paymentId}_${crypto.randomUUID()}`;
      const result = await partialCancelPayment(row.user_id, paymentId, {
        idempotencyKey: key,
        cancelAmount: cancelAmount as number,
        reason,
      });

      await recordAdminAction({
        administratorId: req.adminUserId!,
        actionType: 'PAYMENT_PARTIAL_CANCEL',
        targetType: 'PAYMENT',
        targetId: paymentId,
        reason,
        metadata: { idempotencyKey: key, cancelAmount, canceledAmount: result.canceledAmount, status: result.status },
        requestIp: req.ip ?? null,
      });

      res.json({ ok: true, payment: result });
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}
