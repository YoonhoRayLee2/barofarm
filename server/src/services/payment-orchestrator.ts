// 결제 오케스트레이션 — orders/payments/payment_transactions 위에서 복합결제(포인트+머니+외부PG)를
// 조율한다. payments.status/orders.status 변경은 반드시 이 파일의 상태전이 헬퍼를 통해서만 이루어진다.
//
// 원장 분리 설계:
//   - wallet_transactions(services/wallet.ts) = 자산(포인트/머니) 잔액 변동의 상세 원장(POINT_USE/POINT_EARN/
//     POINT_RESTORE/POINT_REVOKE/REFUND 등 항목별로 여러 행).
//   - payment_transactions(이 파일) = 결제 생애주기 이벤트 원장 — approve 1회당 PAYMENT 1건,
//     cancel/partial-cancel 1회당 CANCEL 또는 REFUND 1건만 남긴다(포인트/머니 세부 변동은 wallet_transactions에
//     이미 있으므로 여기서 중복 기록하지 않는다). enum에 POINT_* 값이 있지만 이 파일에서는 사용하지 않는다.
//
// 복합결제 자산 분해 추적: orders 테이블에는 point_used_amount/money_used_amount "합계"만 있고 어떤
// 포인트 자산유형(EVENT/TEST/EARNED/COMPENSATION)에서 얼마씩 나갔는지는 별도 컬럼이 없다. 승인 시점에
// selectPointUsage로 만든 분해 계획을 payments.metadata(JSON)에 저장해두고, 취소 시 그 계획을 그대로
// 비율만큼 복원한다(정확한 자산유형별 환원을 위해 — 새 마이그레이션 없이 기존 metadata JSON 컬럼 활용).

import { PoolConnection } from 'mysql2/promise';
import pool from '../db/mysql';
import {
  withWalletTransaction,
  applyWalletTx,
  selectPointUsage,
  earnPoints,
  restorePointsAndMoney,
  WalletError,
  WalletErrorCode,
  PointAssetType,
  PaymentMethodType,
} from './wallet';
import { maybeAutoCharge } from '../routes/pay-wallet';
import { paymentService } from './payment';
import { PaymentContext, CancelContext, CardInfo, AccountInfo, MockResult, ProviderResult, PaymentErrorCode } from './payment/provider';
import { getOrderRaw, transitionOrder, OrderRow } from './order';

export type PaymentRowStatus =
  | 'READY'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATING'
  | 'AUTHORIZED'
  | 'PAID'
  | 'FAILED'
  | 'CANCELED'
  | 'PARTIALLY_CANCELED'
  | 'REFUNDED'
  | 'EXPIRED';

export interface PaymentRow {
  id: number;
  order_id: number;
  payment_key: string;
  provider: string;
  method: PaymentMethodType;
  requested_amount: number;
  approved_amount: number;
  canceled_amount: number;
  status: PaymentRowStatus;
  idempotency_key: string;
  requested_at: Date | null;
  approved_at: Date | null;
  canceled_at: Date | null;
  failure_code: string | null;
  failure_message: string | null;
  metadata: string | Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentRecord {
  id: number;
  orderId: number;
  paymentKey: string;
  provider: string;
  method: PaymentMethodType;
  requestedAmount: number;
  approvedAmount: number;
  canceledAmount: number;
  status: PaymentRowStatus;
  requestedAt: string | null;
  approvedAt: string | null;
  canceledAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

function parseMetadata(raw: PaymentRow['metadata']): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw as Record<string, any>;
}

export function toPaymentRecord(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    paymentKey: row.payment_key,
    provider: row.provider,
    method: row.method,
    requestedAmount: Number(row.requested_amount),
    approvedAmount: Number(row.approved_amount),
    canceledAmount: Number(row.canceled_amount),
    status: row.status,
    requestedAt: row.requested_at ? new Date(row.requested_at).toISOString() : null,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    canceledAt: row.canceled_at ? new Date(row.canceled_at).toISOString() : null,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
  };
}

// ─── 오류 코드(§20) ─────────────────────────────────────────────────────────

export enum PaymentOrchestratorErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  PAYMENT_AMOUNT_MISMATCH = 'PAYMENT_AMOUNT_MISMATCH',
  PAYMENT_ALREADY_PROCESSED = 'PAYMENT_ALREADY_PROCESSED',
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  PAYMENT_APPROVAL_FAILED = 'PAYMENT_APPROVAL_FAILED',
  PAYMENT_TIMEOUT = 'PAYMENT_TIMEOUT',
  CARD_LIMIT_EXCEEDED = 'CARD_LIMIT_EXCEEDED',
  INVALID_PAYMENT_STATUS = 'INVALID_PAYMENT_STATUS',
  CANCEL_AMOUNT_EXCEEDED = 'CANCEL_AMOUNT_EXCEEDED',
  DUPLICATE_PAYMENT_REQUEST = 'DUPLICATE_PAYMENT_REQUEST',
  FORBIDDEN = 'FORBIDDEN',
}

export class PaymentOrchestratorError extends Error {
  code: string;
  status: number;
  /** true면 provider 승인 실패로 인한 에러 — 트랜잭션 롤백 후 payments.status를 FAILED로 별도 기록해야 함 */
  isProviderFailure: boolean;
  constructor(code: string, status: number, message: string, isProviderFailure = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.isProviderFailure = isProviderFailure;
  }
}

/** ProviderResult.failureCode(PaymentErrorCode)를 응답 오류코드 문자열로 매핑한다. PaymentErrorCode enum 값은
 * 이미 §20의 명명과 동일한 문자열이므로 대부분 그대로 통과시키고, 값이 없을 때만 기본값으로 대체한다. */
function mapFailureCode(code?: PaymentErrorCode): string {
  if (!code) return PaymentOrchestratorErrorCode.PAYMENT_APPROVAL_FAILED;
  return code;
}

function statusForFailureCode(code: string): number {
  if (code === PaymentErrorCode.PAYMENT_TIMEOUT) return 504;
  return 402;
}

const PAYMENT_METHODS: PaymentMethodType[] = ['MONEY', 'CARD', 'ACCOUNT', 'MOBILE', 'VIRTUAL_ACCOUNT'];

async function getPaymentRaw(paymentId: number): Promise<PaymentRow | null> {
  const [rows] = await pool.query<any[]>('SELECT * FROM payments WHERE id = ?', [paymentId]);
  return rows[0] ?? null;
}

interface PaymentTransitionExtra {
  approvedAmount?: number;
  canceledAmount?: number;
  metadata?: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  setApprovedAtNow?: boolean;
  setCanceledAtNow?: boolean;
}

/**
 * payments.status를 from(허용된 현재 상태 목록) → to로만 전이시킨다(orders의 transitionOrder와 동일한 패턴).
 * from에 없는 상태에서 호출되면 INVALID_PAYMENT_STATUS 에러(동시성 경쟁/중복요청 방어) —
 * 이 파일 어디에서도 이 함수를 거치지 않고 `UPDATE payments SET status = ...`를 직접 실행하지 않는다.
 */
async function transitionPayment(
  conn: PoolConnection | typeof pool,
  paymentId: number,
  from: PaymentRowStatus[],
  to: PaymentRowStatus,
  extra: PaymentTransitionExtra = {},
): Promise<void> {
  const sets: string[] = ['status = ?'];
  const params: any[] = [to];
  if (extra.approvedAmount !== undefined) { sets.push('approved_amount = ?'); params.push(extra.approvedAmount); }
  if (extra.canceledAmount !== undefined) { sets.push('canceled_amount = ?'); params.push(extra.canceledAmount); }
  if (extra.metadata !== undefined) { sets.push('metadata = ?'); params.push(extra.metadata); }
  if (extra.failureCode !== undefined) { sets.push('failure_code = ?'); params.push(extra.failureCode); }
  if (extra.failureMessage !== undefined) { sets.push('failure_message = ?'); params.push(extra.failureMessage); }
  if (extra.setApprovedAtNow) sets.push('approved_at = NOW()');
  if (extra.setCanceledAtNow) sets.push('canceled_at = NOW()');
  params.push(paymentId, ...from);

  const [result] = await conn.query<any>(
    `UPDATE payments SET ${sets.join(', ')} WHERE id = ? AND status IN (${from.map(() => '?').join(',')})`,
    params,
  );
  if (result.affectedRows === 0) {
    throw new PaymentOrchestratorError(
      PaymentOrchestratorErrorCode.INVALID_PAYMENT_STATUS,
      409,
      `결제 상태 전이 실패 (paymentId=${paymentId}, expected one of [${from.join(',')}], target=${to})`,
    );
  }
}

async function assertOwnership(order: OrderRow, userId: number): Promise<void> {
  if (order.user_id !== userId) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.FORBIDDEN, 403, '본인 주문의 결제만 조회/처리할 수 있습니다');
  }
}

/** approve 라우트의 requirePaymentAuth amountResolver가 사용 — paymentId로 해당 주문의 결제금액을 조회 */
export async function resolvePaymentAmountForApprove(paymentId: number): Promise<number> {
  const [rows] = await pool.query<any[]>(
    'SELECT o.payment_amount FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = ?',
    [paymentId],
  );
  return rows[0] ? Number(rows[0].payment_amount) : 0;
}

// ─── ready ──────────────────────────────────────────────────────────────────

export interface ReadyPaymentInput {
  orderId: number;
  method: PaymentMethodType;
  cardInfo?: CardInfo;
  accountInfo?: AccountInfo;
  idempotencyKey: string;
}

export async function readyPayment(userId: number, input: ReadyPaymentInput): Promise<PaymentRecord> {
  if (!input.idempotencyKey) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.INVALID_REQUEST, 400, 'idempotencyKey is required');
  }
  if (!PAYMENT_METHODS.includes(input.method)) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.INVALID_REQUEST, 400, 'invalid method');
  }

  const order = await getOrderRaw(input.orderId);
  if (!order) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_NOT_FOUND, 404, 'order not found');
  }
  await assertOwnership(order, userId);
  if (order.status !== 'PAYMENT_PENDING') {
    throw new PaymentOrchestratorError(
      PaymentOrchestratorErrorCode.INVALID_PAYMENT_STATUS,
      409,
      `결제 대기 상태가 아닌 주문입니다(status=${order.status})`,
    );
  }

  // idempotencyKey 재사용 검사 — 동일 키가 이미 다른 payments row에 쓰였으면 거절, 같은 주문이면 그대로 반환.
  const [dupRows] = await pool.query<any[]>('SELECT * FROM payments WHERE idempotency_key = ?', [input.idempotencyKey]);
  if (dupRows[0]) {
    if (dupRows[0].order_id === order.id) return toPaymentRecord(dupRows[0]);
    throw new PaymentOrchestratorError(
      PaymentOrchestratorErrorCode.DUPLICATE_PAYMENT_REQUEST,
      409,
      '이미 다른 결제에 사용된 idempotencyKey입니다',
    );
  }

  // 이 주문에 대해 이미 진행 중이거나 완료된 결제가 있으면 재사용/거절 (동일 주문에 payments row 중복 생성 방지)
  const [existingRows] = await pool.query<any[]>(
    'SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1',
    [order.id],
  );
  const existing: PaymentRow | undefined = existingRows[0];
  if (existing) {
    if (existing.status === 'PAID') {
      throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_ALREADY_PROCESSED, 409, '이미 결제 완료된 주문입니다');
    }
    if (['READY', 'AUTHENTICATION_REQUIRED', 'AUTHENTICATING', 'AUTHORIZED'].includes(existing.status)) {
      return toPaymentRecord(existing);
    }
    // FAILED/CANCELED/EXPIRED/REFUNDED/PARTIALLY_CANCELED — 새 결제 시도 허용
  }

  const provider = paymentService.resolveProviderForMethod(input.method);
  const requestedAmount = Number(order.payment_amount);
  const paymentKey = `PK_${order.order_number}_${Date.now().toString(36)}`;

  const ctx: PaymentContext = {
    paymentKey,
    orderId: order.id,
    orderNumber: order.order_number,
    method: input.method,
    amount: requestedAmount,
    idempotencyKey: input.idempotencyKey,
    cardInfo: input.cardInfo,
    accountInfo: input.accountInfo,
  };
  const result = await paymentService.readyPayment(ctx);

  const [insertResult] = await pool.query<any>(
    `INSERT INTO payments
       (order_id, payment_key, provider, method, requested_amount, approved_amount, canceled_amount,
        status, idempotency_key, requested_at, metadata)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, NOW(), ?)`,
    [
      order.id, paymentKey, provider.name, input.method, requestedAmount,
      result.status, input.idempotencyKey,
      JSON.stringify({ pointUsedAmount: order.point_used_amount, moneyUsedAmount: order.money_used_amount }),
    ],
  );

  const row = await getPaymentRaw(insertResult.insertId);
  return toPaymentRecord(row!);
}

// ─── approve ────────────────────────────────────────────────────────────────

export interface ApprovePaymentInput {
  idempotencyKey: string;
  amount?: number;
  cardInfo?: CardInfo;
  accountInfo?: AccountInfo;
  mockResult?: MockResult;
}

async function findIdempotentReplay(idempotencyKey: string, paymentId: number): Promise<PaymentRecord | null> {
  const [rows] = await pool.query<any[]>('SELECT * FROM payment_transactions WHERE idempotency_key = ?', [idempotencyKey]);
  const tx = rows[0];
  if (!tx) return null;
  if (tx.payment_id !== paymentId) {
    throw new PaymentOrchestratorError(
      PaymentOrchestratorErrorCode.DUPLICATE_PAYMENT_REQUEST,
      409,
      '이미 다른 결제 처리에 사용된 idempotencyKey입니다',
    );
  }
  const row = await getPaymentRaw(paymentId);
  if (!row) return null;
  return toPaymentRecord(row);
}

export async function approvePayment(userId: number, paymentId: number, input: ApprovePaymentInput): Promise<PaymentRecord> {
  if (!input.idempotencyKey) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.INVALID_REQUEST, 400, 'idempotencyKey is required');
  }

  // 1) 멱등 재요청 — 이미 처리된 approve라면 재처리 없이 이전 성공 결과를 그대로 반환한다(에러 아님).
  const replay = await findIdempotentReplay(input.idempotencyKey, paymentId);
  if (replay) return replay;

  const payment = await getPaymentRaw(paymentId);
  if (!payment) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_NOT_FOUND, 404, 'payment not found');
  }
  const order = await getOrderRaw(payment.order_id);
  if (!order) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_NOT_FOUND, 404, 'order not found');
  }
  await assertOwnership(order, userId);

  if (payment.status === 'PAID') {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_ALREADY_PROCESSED, 409, '이미 승인된 결제입니다');
  }
  if (!['READY', 'AUTHENTICATING'].includes(payment.status)) {
    throw new PaymentOrchestratorError(
      PaymentOrchestratorErrorCode.INVALID_PAYMENT_STATUS,
      409,
      `승인 가능한 상태가 아닙니다(status=${payment.status})`,
    );
  }
  if (order.status !== 'PAYMENT_PENDING') {
    throw new PaymentOrchestratorError(
      PaymentOrchestratorErrorCode.INVALID_PAYMENT_STATUS,
      409,
      `결제 대기 상태가 아닌 주문입니다(status=${order.status})`,
    );
  }
  if (typeof input.amount === 'number' && input.amount !== Number(order.payment_amount)) {
    throw new PaymentOrchestratorError(
      PaymentOrchestratorErrorCode.PAYMENT_AMOUNT_MISMATCH,
      400,
      `요청 금액(${input.amount})이 주문 결제금액(${order.payment_amount})과 일치하지 않습니다`,
    );
  }

  const pointUsedAmount = Number(order.point_used_amount);
  const moneyUsedAmount = Number(order.money_used_amount);
  const remaining = Number(order.external_payment_amount); // = order.payment_amount (설계상 동일)

  let providerResult: ProviderResult | null = null;

  try {
    await withWalletTransaction(async (conn: PoolConnection) => {
      // 락 + 상태 재확인(동시 요청 경쟁 방어)
      const [orderLockRows] = await conn.query<any[]>('SELECT * FROM orders WHERE id = ? FOR UPDATE', [order.id]);
      const [paymentLockRows] = await conn.query<any[]>('SELECT * FROM payments WHERE id = ? FOR UPDATE', [paymentId]);
      const lockedOrder = orderLockRows[0];
      const lockedPayment = paymentLockRows[0];
      if (!lockedOrder || !lockedPayment) {
        throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_NOT_FOUND, 404, 'payment/order not found');
      }
      if (lockedPayment.status === 'PAID' || lockedOrder.status !== 'PAYMENT_PENDING') {
        throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_ALREADY_PROCESSED, 409, '이미 처리된 결제입니다');
      }

      let pointPlan: { assetType: PointAssetType; amount: number }[] = [];
      if (pointUsedAmount > 0) {
        pointPlan = await selectPointUsage(userId, pointUsedAmount);
        const planTotal = pointPlan.reduce((sum, item) => sum + item.amount, 0);
        if (planTotal < pointUsedAmount) {
          throw new WalletError(WalletErrorCode.INSUFFICIENT_BALANCE, '포인트 잔액이 부족합니다');
        }
        for (const item of pointPlan) {
          await applyWalletTx(conn, {
            userId,
            assetType: item.assetType,
            transactionType: 'POINT_USE',
            amount: -item.amount,
            referenceType: 'ORDER',
            referenceId: String(order.id),
            description: `주문 결제 포인트 사용 (${order.order_number})`,
            idempotencyKey: `${input.idempotencyKey}:point:${item.assetType}`,
          });
        }
      }

      if (moneyUsedAmount > 0) {
        await applyWalletTx(conn, {
          userId,
          assetType: 'MONEY',
          transactionType: 'PAYMENT',
          amount: -moneyUsedAmount,
          referenceType: 'ORDER',
          referenceId: String(order.id),
          description: `주문 결제 머니 사용 (${order.order_number})`,
          idempotencyKey: `${input.idempotencyKey}:money`,
        });
      }

      if (remaining > 0) {
        const ctx: PaymentContext = {
          paymentKey: payment.payment_key,
          orderId: order.id,
          orderNumber: order.order_number,
          method: payment.method,
          amount: remaining,
          idempotencyKey: input.idempotencyKey,
          cardInfo: input.cardInfo,
          accountInfo: input.accountInfo,
          mockResult: input.mockResult,
        };
        providerResult = await paymentService.approvePayment(ctx);
        if (!providerResult.success) {
          const failureCode = mapFailureCode(providerResult.failureCode);
          // 포인트/머니 차감을 포함해 지금까지의 모든 변경을 롤백해야 하므로 throw로 트랜잭션 전체를 되돌린다.
          throw new PaymentOrchestratorError(
            failureCode,
            statusForFailureCode(failureCode),
            providerResult.failureMessage ?? '결제 승인에 실패했습니다',
            true,
          );
        }
      }

      const earnMethod: PaymentMethodType = remaining > 0 ? payment.method : 'MONEY';
      const earnResult = await earnPoints(conn, {
        userId,
        paymentAmount: Number(order.payment_amount),
        method: earnMethod,
        referenceType: 'ORDER',
        referenceId: String(order.id),
        idempotencyKey: `${input.idempotencyKey}:earn`,
      });

      const metadata = {
        pointUsedAmount,
        moneyUsedAmount,
        pointUsagePlan: pointPlan,
        earnedPointAmount: earnResult?.amount ?? 0,
        providerTransactionId: providerResult?.providerTransactionId ?? null,
      };

      await transitionPayment(conn, paymentId, ['READY', 'AUTHENTICATING'], 'PAID', {
        approvedAmount: remaining,
        metadata: JSON.stringify(metadata),
        setApprovedAtNow: true,
      });

      await transitionOrder(conn, order.id, ['PAYMENT_PENDING'], 'PAID');

      await conn.query(
        `INSERT INTO payment_transactions
           (payment_id, transaction_type, amount, status, provider_transaction_id, idempotency_key)
         VALUES (?, 'PAYMENT', ?, 'PAID', ?, ?)`,
        [paymentId, order.payment_amount, providerResult?.providerTransactionId ?? null, input.idempotencyKey],
      );
    });
  } catch (err) {
    if (err instanceof PaymentOrchestratorError && err.isProviderFailure) {
      // 트랜잭션은 이미 롤백됨(포인트/머니 차감 원복). payments.status만 별도 트랜잭션으로 FAILED 기록.
      // from 상태가 이미 바뀌어 있어도(경합) 원래의 provider 실패 에러를 그대로 응답해야 하므로 여기서 실패해도 삼킨다.
      try {
        await transitionPayment(pool, paymentId, ['READY', 'AUTHENTICATING'], 'FAILED', {
          failureCode: err.code,
          failureMessage: err.message,
        });
      } catch (transitionErr) {
        console.error('[payment-orchestrator] failed to record FAILED status after provider failure', transitionErr);
      }
    }
    if (err instanceof WalletError) {
      throw new PaymentOrchestratorError('INSUFFICIENT_WALLET_BALANCE', 409, err.message);
    }
    throw err;
  }

  // 자동충전(Mock) — 결제로 잔액이 threshold 미만이 되면 트리거. 실패해도 결제 응답에는 영향 없음.
  try {
    await maybeAutoCharge(userId, `${input.idempotencyKey}:autocharge`);
  } catch (autoChargeErr) {
    console.error('[payment-orchestrator] maybeAutoCharge failed (non-fatal)', autoChargeErr);
  }

  const finalRow = await getPaymentRaw(paymentId);
  return toPaymentRecord(finalRow!);
}

// ─── cancel / partial-cancel ────────────────────────────────────────────────

export interface CancelPaymentInput {
  idempotencyKey: string;
  cancelAmount?: number;
  reason?: string;
}

async function cancelOrPartial(
  userId: number,
  paymentId: number,
  input: CancelPaymentInput,
  isPartial: boolean,
): Promise<PaymentRecord> {
  if (!input.idempotencyKey) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.INVALID_REQUEST, 400, 'idempotencyKey is required');
  }

  const replay = await findIdempotentReplay(input.idempotencyKey, paymentId);
  if (replay) return replay;

  const payment = await getPaymentRaw(paymentId);
  if (!payment) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_NOT_FOUND, 404, 'payment not found');
  }
  const order = await getOrderRaw(payment.order_id);
  if (!order) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_NOT_FOUND, 404, 'order not found');
  }
  await assertOwnership(order, userId);

  if (!['PAID', 'PARTIALLY_CANCELED'].includes(payment.status)) {
    throw new PaymentOrchestratorError(
      PaymentOrchestratorErrorCode.INVALID_PAYMENT_STATUS,
      409,
      `취소 가능한 상태가 아닙니다(status=${payment.status})`,
    );
  }

  const approvedAmount = Number(payment.approved_amount);
  const alreadyCanceled = Number(payment.canceled_amount);
  const remainingCancelable = approvedAmount - alreadyCanceled;

  let cancelAmount: number;
  if (isPartial) {
    cancelAmount = Math.trunc(Number(input.cancelAmount ?? 0));
    if (!Number.isFinite(cancelAmount) || cancelAmount <= 0) {
      throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.INVALID_REQUEST, 400, 'cancelAmount는 양수여야 합니다');
    }
    if (cancelAmount > remainingCancelable) {
      throw new PaymentOrchestratorError(
        PaymentOrchestratorErrorCode.CANCEL_AMOUNT_EXCEEDED,
        400,
        `취소 요청액(${cancelAmount})이 취소 가능 잔액(${remainingCancelable})을 초과합니다`,
      );
    }
  } else {
    cancelAmount = remainingCancelable;
  }

  // ratio: 이번 취소가 이 payment의 전체 승인액 중 차지하는 비율 — 포인트/머니/적립금을 같은 비율로 되돌린다.
  // approvedAmount가 0인 경우(전액 포인트+머니 결제)는 PG로 나간 금액이 없으므로 ratio=1(전액 복원)로 취급한다.
  const ratio = approvedAmount > 0 ? cancelAmount / approvedAmount : 1;

  const metadata = parseMetadata(payment.metadata);
  const pointUsagePlan: { assetType: PointAssetType; amount: number }[] = metadata.pointUsagePlan ?? [];
  const moneyUsedAmount = Number(metadata.moneyUsedAmount ?? 0);
  const earnedPointAmount = Number(metadata.earnedPointAmount ?? 0);

  await withWalletTransaction(async (conn: PoolConnection) => {
    const [paymentLockRows] = await conn.query<any[]>('SELECT * FROM payments WHERE id = ? FOR UPDATE', [paymentId]);
    const [orderLockRows] = await conn.query<any[]>('SELECT * FROM orders WHERE id = ? FOR UPDATE', [order.id]);
    const lockedPayment = paymentLockRows[0];
    const lockedOrder = orderLockRows[0];
    if (!lockedPayment || !lockedOrder) {
      throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_NOT_FOUND, 404, 'payment/order not found');
    }
    const lockedRemaining = Number(lockedPayment.approved_amount) - Number(lockedPayment.canceled_amount);
    if (cancelAmount > lockedRemaining) {
      throw new PaymentOrchestratorError(
        PaymentOrchestratorErrorCode.CANCEL_AMOUNT_EXCEEDED,
        400,
        `취소 요청액이 취소 가능 잔액(${lockedRemaining})을 초과합니다`,
      );
    }

    let providerResult: ProviderResult | null = null;
    if (cancelAmount > 0) {
      const ctx: CancelContext = {
        paymentKey: payment.payment_key,
        providerTransactionId: metadata.providerTransactionId ?? undefined,
        cancelAmount,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      };
      providerResult = isPartial
        ? await paymentService.partialCancelPayment(payment.provider, ctx)
        : await paymentService.cancelPayment(payment.provider, ctx);
      if (!providerResult.success) {
        const failureCode = mapFailureCode(providerResult.failureCode);
        throw new PaymentOrchestratorError(failureCode, statusForFailureCode(failureCode), providerResult.failureMessage ?? '결제 취소에 실패했습니다');
      }
    }

    const restoreItems = [
      ...pointUsagePlan
        .map((item) => ({ assetType: item.assetType, amount: Math.floor(item.amount * ratio) }))
        .filter((item) => item.amount > 0),
      ...(moneyUsedAmount > 0 && Math.floor(moneyUsedAmount * ratio) > 0
        ? [{ assetType: 'MONEY' as const, amount: Math.floor(moneyUsedAmount * ratio) }]
        : []),
    ];
    if (restoreItems.length > 0) {
      await restorePointsAndMoney(conn, {
        userId,
        items: restoreItems,
        referenceType: 'ORDER',
        referenceId: String(order.id),
        description: `주문 취소 복원 (${order.order_number})`,
        idempotencyKey: `${input.idempotencyKey}:restore`,
      });
    }

    const revokeAmount = Math.floor(earnedPointAmount * ratio);
    if (revokeAmount > 0) {
      await applyWalletTx(conn, {
        userId,
        assetType: 'EARNED_POINT',
        transactionType: 'POINT_REVOKE',
        amount: -revokeAmount,
        referenceType: 'ORDER',
        referenceId: String(order.id),
        description: `주문 취소로 인한 적립금 회수 (${order.order_number})`,
        idempotencyKey: `${input.idempotencyKey}:revoke`,
      });
    }

    const newCanceledAmount = alreadyCanceled + cancelAmount;
    const fullyCanceled = approvedAmount === 0 ? true : newCanceledAmount >= approvedAmount;
    // 승인 직후(주문이 아직 배송 준비 이전)의 전체취소는 CANCELED, 이미 배송 절차가 시작/완료된 뒤의
    // 전체취소(사후 환불)는 REFUNDED로 구분한다. 부분취소는 항상 PARTIALLY_CANCELED.
    const newStatus = !fullyCanceled
      ? 'PARTIALLY_CANCELED'
      : ['PREPARING', 'SHIPPED', 'COMPLETED'].includes(lockedOrder.status)
        ? 'REFUNDED'
        : 'CANCELED';

    await transitionPayment(conn, paymentId, ['PAID', 'PARTIALLY_CANCELED'], newStatus, {
      canceledAmount: newCanceledAmount,
      setCanceledAtNow: true,
    });

    await conn.query(
      `INSERT INTO payment_transactions
         (payment_id, transaction_type, amount, status, provider_transaction_id, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [paymentId, newStatus === 'REFUNDED' ? 'REFUND' : 'CANCEL', cancelAmount, newStatus, providerResult?.providerTransactionId ?? null, input.idempotencyKey],
    );

    if (fullyCanceled) {
      await transitionOrder(conn, order.id, ['PAID', 'PREPARING', 'SHIPPED', 'COMPLETED'], 'CANCELED');
    }
  });

  const finalRow = await getPaymentRaw(paymentId);
  return toPaymentRecord(finalRow!);
}

export function cancelPayment(userId: number, paymentId: number, input: CancelPaymentInput): Promise<PaymentRecord> {
  return cancelOrPartial(userId, paymentId, input, false);
}

export function partialCancelPayment(userId: number, paymentId: number, input: CancelPaymentInput): Promise<PaymentRecord> {
  return cancelOrPartial(userId, paymentId, input, true);
}

// ─── 조회 ───────────────────────────────────────────────────────────────────

export async function getPaymentForUser(userId: number, paymentId: number): Promise<PaymentRecord> {
  const payment = await getPaymentRaw(paymentId);
  if (!payment) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_NOT_FOUND, 404, 'payment not found');
  }
  const order = await getOrderRaw(payment.order_id);
  if (!order) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_NOT_FOUND, 404, 'order not found');
  }
  await assertOwnership(order, userId);
  return toPaymentRecord(payment);
}

export async function getPaymentsForOrder(userId: number, orderId: number): Promise<PaymentRecord[]> {
  const order = await getOrderRaw(orderId);
  if (!order) {
    throw new PaymentOrchestratorError(PaymentOrchestratorErrorCode.PAYMENT_NOT_FOUND, 404, 'order not found');
  }
  await assertOwnership(order, userId);
  const [rows] = await pool.query<any[]>('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC', [orderId]);
  return rows.map(toPaymentRecord);
}
