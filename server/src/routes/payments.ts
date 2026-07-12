// 결제 API (Phase 4) — orders 위에서 ready/approve/cancel/partial-cancel을 오케스트레이션한다.
// approve는 requirePaymentAuth('PAYMENT')로 결제 인증세션(및 고액 재인증)을 요구한다.

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePaymentAuth } from '../middleware/payment-auth';
import {
  readyPayment,
  approvePayment,
  cancelPayment,
  partialCancelPayment,
  getPaymentForUser,
  getPaymentsForOrder,
  resolvePaymentAmountForApprove,
  PaymentOrchestratorError,
} from '../services/payment-orchestrator';
import { WalletError } from '../services/wallet';

const router = Router();
router.use(requireAuth);

function handleError(err: unknown, res: Response): void {
  if (err instanceof PaymentOrchestratorError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof WalletError) {
    res.status(409).json({ error: err.code, message: err.message });
    return;
  }
  console.error('[payments]', err);
  res.status(500).json({ error: 'internal_error' });
}

// POST /api/payments/ready — body: { orderId, method, cardInfo?, accountInfo?, idempotencyKey }
router.post('/ready', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { orderId, method, cardInfo, accountInfo, idempotencyKey } = req.body ?? {};

  if (!Number.isInteger(orderId)) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'orderId is required' });
    return;
  }

  try {
    const payment = await readyPayment(userId, { orderId, method, cardInfo, accountInfo, idempotencyKey });
    res.status(201).json(payment);
  } catch (err) {
    handleError(err, res);
  }
});

// POST /api/payments/:paymentId/approve — body: { idempotencyKey, amount?, cardInfo?, accountInfo?, mockResult? }
router.post(
  '/:paymentId/approve',
  requirePaymentAuth('PAYMENT', async (req: Request) => {
    const paymentId = Number(req.params.paymentId);
    if (!Number.isInteger(paymentId)) return 0;
    return resolvePaymentAmountForApprove(paymentId);
  }),
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const paymentId = Number(req.params.paymentId);
    if (!Number.isInteger(paymentId)) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'invalid paymentId' });
      return;
    }
    const { idempotencyKey, amount, cardInfo, accountInfo, mockResult } = req.body ?? {};

    try {
      const payment = await approvePayment(userId, paymentId, { idempotencyKey, amount, cardInfo, accountInfo, mockResult });
      res.json(payment);
    } catch (err) {
      handleError(err, res);
    }
  },
);

// POST /api/payments/:paymentId/cancel — 전체취소. body: { idempotencyKey, reason? }
router.post('/:paymentId/cancel', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const paymentId = Number(req.params.paymentId);
  if (!Number.isInteger(paymentId)) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'invalid paymentId' });
    return;
  }
  const { idempotencyKey, reason } = req.body ?? {};

  try {
    const payment = await cancelPayment(userId, paymentId, { idempotencyKey, reason });
    res.json(payment);
  } catch (err) {
    handleError(err, res);
  }
});

// POST /api/payments/:paymentId/partial-cancel — 부분취소. body: { idempotencyKey, cancelAmount, reason? }
router.post('/:paymentId/partial-cancel', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const paymentId = Number(req.params.paymentId);
  if (!Number.isInteger(paymentId)) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'invalid paymentId' });
    return;
  }
  const { idempotencyKey, cancelAmount, reason } = req.body ?? {};

  try {
    const payment = await partialCancelPayment(userId, paymentId, { idempotencyKey, cancelAmount, reason });
    res.json(payment);
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/payments/by-order/:orderId — 본인 주문의 결제 목록(최신순, 재시도 포함 전체)
router.get('/by-order/:orderId', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'invalid orderId' });
    return;
  }

  try {
    const payments = await getPaymentsForOrder(userId, orderId);
    res.json({ items: payments });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/payments/:paymentId — 본인 소유 주문의 결제만 조회 가능
router.get('/:paymentId', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const paymentId = Number(req.params.paymentId);
  if (!Number.isInteger(paymentId)) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'invalid paymentId' });
    return;
  }

  try {
    const payment = await getPaymentForUser(userId, paymentId);
    res.json(payment);
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
