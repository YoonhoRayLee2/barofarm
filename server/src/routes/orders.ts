// 주문 API (Phase 4) — auctions(경매 낙찰/FCFS/공동구매) 낙찰건을 재무 원장(orders/payments)으로 오케스트레이션한다.
// 금액은 항상 서버가 auctions 테이블을 재조회해 계산하며, 클라이언트가 보낸 금액 필드는 신뢰하지 않는다.

import { Router, Request, Response } from 'express';
import pool from '../db/mysql';
import { requireAuth } from '../middleware/auth';
import { createOrder, getOrderRaw, toOrderRecord, transitionOrder, OrderError } from '../services/order';

const router = Router();
router.use(requireAuth);

function handleOrderError(err: unknown, res: Response): void {
  if (err instanceof OrderError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  console.error('[orders]', err);
  res.status(500).json({ error: 'internal_error' });
}

// POST /api/orders — body: { auctionId, useMoneyAmount?, usePointAmount? }
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { auctionId, useMoneyAmount, usePointAmount } = req.body as {
    auctionId?: string;
    useMoneyAmount?: number;
    usePointAmount?: number;
  };

  try {
    const order = await createOrder(userId, { auctionId: auctionId ?? '', useMoneyAmount, usePointAmount });
    res.status(201).json(order);
  } catch (err) {
    handleOrderError(err, res);
  }
});

// GET /api/orders/:orderId — 본인 주문만 조회 가능
router.get('/:orderId', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'invalid orderId' });
    return;
  }

  try {
    const row = await getOrderRaw(orderId);
    if (!row) {
      res.status(404).json({ error: 'ORDER_NOT_FOUND' });
      return;
    }
    if (row.user_id !== userId) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    res.json(toOrderRecord(row));
  } catch (err) {
    console.error('[orders] GET /:orderId', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/orders/:orderId/cancel — 결제 전(CREATED/PAYMENT_PENDING) 상태에서만 취소 가능.
// PAID 이후 취소는 결제가 이미 지갑/PG에 반영되어 있으므로 /api/payments/:paymentId/cancel(환불 연계)로 처리한다.
router.post('/:orderId/cancel', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'invalid orderId' });
    return;
  }

  try {
    const row = await getOrderRaw(orderId);
    if (!row) {
      res.status(404).json({ error: 'ORDER_NOT_FOUND' });
      return;
    }
    if (row.user_id !== userId) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    if (row.status === 'PAID' || row.status === 'PREPARING' || row.status === 'SHIPPED' || row.status === 'COMPLETED') {
      res.status(409).json({
        error: 'INVALID_ORDER_STATUS',
        message: '결제 완료된 주문은 /api/payments/:paymentId/cancel(환불)로 취소해야 합니다',
      });
      return;
    }

    await transitionOrder(pool, orderId, ['CREATED', 'PAYMENT_PENDING'], 'CANCELED');
    const updated = await getOrderRaw(orderId);
    res.json(toOrderRecord(updated!));
  } catch (err) {
    handleOrderError(err, res);
  }
});

export default router;
