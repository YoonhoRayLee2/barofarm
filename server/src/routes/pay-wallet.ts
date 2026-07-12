// 자체페이(바로팜페이) 지갑 API (§16.7) — 잔액 조회/충전(Mock)/원장 조회/자동충전 설정.

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { internalPayProvider } from '../services/payment/mock/internal-pay-provider';
import { PaymentContext, MockResult } from '../services/payment/provider';
import {
  getWallet,
  getTransactions,
  setAutoChargeSettings,
  checkAutoChargeNeeded,
  withWalletTransaction,
  applyWalletTx,
  WalletError,
  AssetType,
} from '../services/wallet';

const router = Router();
router.use(requireAuth);

function handleWalletError(err: unknown, res: Response): void {
  if (err instanceof WalletError) {
    res.status(409).json({ error: err.code, message: err.message });
    return;
  }
  console.error('[pay-wallet]', err);
  res.status(500).json({ error: 'internal_error' });
}

// GET /api/pay/wallet — 머니/포인트 잔액 + autoCharge 설정
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  try {
    const wallet = await getWallet(userId);
    res.json(wallet);
  } catch (err) {
    handleWalletError(err, res);
  }
});

// POST /api/pay/wallet/charge — 머니 충전(Mock PG 승인 후 MONEY CHARGE 원장 기록)
// body: { amount: number(양수), idempotencyKey: string, mockResult?: 'success'|'timeout'|'response_lost' }
router.post('/charge', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { amount, idempotencyKey, mockResult } = req.body as {
    amount?: number;
    idempotencyKey?: string;
    mockResult?: MockResult;
  };

  if (!Number.isFinite(amount) || (amount as number) <= 0) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'amount는 양수여야 합니다' });
    return;
  }
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'idempotencyKey is required' });
    return;
  }

  try {
    const ctx: PaymentContext = {
      paymentKey: idempotencyKey,
      // 지갑 충전은 특정 주문에 종속되지 않으므로 orderId/orderNumber는 Mock 컨텍스트용 자리표시자다
      // (internalPayProvider 구현체는 이 두 필드를 참조하지 않는다).
      orderId: 0,
      orderNumber: `WALLET_CHARGE_${idempotencyKey}`,
      method: 'MONEY',
      amount: amount as number,
      idempotencyKey,
      mockResult,
    };
    await internalPayProvider.readyPayment(ctx);
    await internalPayProvider.authenticatePayment(ctx);
    const approveResult = await internalPayProvider.approvePayment(ctx);

    if (!approveResult.success) {
      res.status(402).json({
        error: approveResult.failureCode ?? 'PAYMENT_APPROVAL_FAILED',
        message: approveResult.failureMessage,
      });
      return;
    }

    const txResult = await withWalletTransaction((conn) =>
      applyWalletTx(conn, {
        userId,
        assetType: 'MONEY',
        transactionType: 'CHARGE',
        amount: amount as number,
        referenceType: 'WALLET_CHARGE',
        referenceId: idempotencyKey,
        description: '바로팜페이 머니 충전',
        createdBy: 'USER',
        idempotencyKey,
      }),
    );

    res.json({ ok: true, ...txResult });
  } catch (err) {
    handleWalletError(err, res);
  }
});

// GET /api/pay/wallet/transactions — 원장 내역(페이징, assetType/기간 필터)
router.get('/transactions', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { limit, offset, assetType, from, to } = req.query as Record<string, string | undefined>;

  const validAssetTypes: AssetType[] = ['MONEY', 'EARNED_POINT', 'EVENT_POINT', 'TEST_POINT', 'COMPENSATION_POINT'];
  if (assetType && !validAssetTypes.includes(assetType as AssetType)) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'invalid assetType' });
    return;
  }

  try {
    const result = await getTransactions(userId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      assetType: assetType as AssetType | undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    res.json(result);
  } catch (err) {
    handleWalletError(err, res);
  }
});

// PUT /api/pay/wallet/auto-charge — 자동충전 설정
// body: { autoChargeEnabled: boolean, autoChargeThreshold: number, autoChargeAmount: number }
router.put('/auto-charge', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { autoChargeEnabled, autoChargeThreshold, autoChargeAmount } = req.body as {
    autoChargeEnabled?: boolean;
    autoChargeThreshold?: number;
    autoChargeAmount?: number;
  };

  if (typeof autoChargeEnabled !== 'boolean') {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'autoChargeEnabled(boolean) is required' });
    return;
  }
  if (!Number.isFinite(autoChargeThreshold) || (autoChargeThreshold as number) < 0) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'autoChargeThreshold는 0 이상 숫자여야 합니다' });
    return;
  }
  if (!Number.isFinite(autoChargeAmount) || (autoChargeAmount as number) < 0) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'autoChargeAmount는 0 이상 숫자여야 합니다' });
    return;
  }

  try {
    const wallet = await setAutoChargeSettings(userId, {
      autoChargeEnabled,
      autoChargeThreshold: autoChargeThreshold as number,
      autoChargeAmount: autoChargeAmount as number,
    });
    res.json(wallet);
  } catch (err) {
    handleWalletError(err, res);
  }
});

/**
 * Mock 자동충전 트리거 — 결제/차감(Phase 4)에서 잔액 차감 후 이 함수를 호출해
 * threshold 미만이면 Mock PG 승인 후 CHARGE 원장을 append한다.
 * idempotencyKey는 호출부(결제 흐름)가 참조ID 기반으로 생성해 전달한다(중복 트리거 방지).
 */
export async function maybeAutoCharge(userId: number, idempotencyKey: string) {
  const wallet = await getWallet(userId);
  const check = checkAutoChargeNeeded(wallet);
  if (!check.triggered || !check.amount) return null;

  const ctx: PaymentContext = {
    paymentKey: idempotencyKey,
    orderId: 0,
    orderNumber: `WALLET_AUTOCHARGE_${idempotencyKey}`,
    method: 'MONEY',
    amount: check.amount,
    idempotencyKey,
  };
  await internalPayProvider.readyPayment(ctx);
  await internalPayProvider.authenticatePayment(ctx);
  const approveResult = await internalPayProvider.approvePayment(ctx);
  if (!approveResult.success) return null;

  return withWalletTransaction((conn) =>
    applyWalletTx(conn, {
      userId,
      assetType: 'MONEY',
      transactionType: 'CHARGE',
      amount: check.amount as number,
      referenceType: 'WALLET_AUTO_CHARGE',
      referenceId: idempotencyKey,
      description: '자동충전(Mock)',
      createdBy: 'SYSTEM',
      idempotencyKey,
    }),
  );
}

export default router;
