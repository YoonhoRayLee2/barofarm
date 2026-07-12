// 주문 서비스 — auctions(진짜 경매 낙찰/FCFS 즉시구매/공동구매 전부 auctions 테이블 row로 존재)를
// 재무 원장화하는 계층. 상태(orders.status)는 반드시 transitionOrder()를 통해서만 변경한다.
//
// 금액은 전부 auctions 테이블 값을 서버가 재조회해 계산한다 — 클라이언트가 보낸 금액은 신뢰하지 않는다.
// auctions 테이블은 읽기만 하며 이 파일에서 UPDATE하지 않는다(레거시 delivery_status 단축경로는 손대지 않음).

import { Pool, PoolConnection } from 'mysql2/promise';
import crypto from 'crypto';
import pool from '../db/mysql';
import { getWallet, selectPointUsage } from './wallet';

export type OrderStatus =
  | 'CREATED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'PREPARING'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELED'
  | 'PAYMENT_EXPIRED';

// 주문 생성 후 결제창 노출~자동만료까지 유예시간. 별도 정책 항목(config/payment-policy.ts)이
// 없어 합리적 상수로 고정한다 — 실제 만료 배치/스케줄러 구현은 이번 phase 범위 밖(주문 조회 시
// payment_due_at이 지났다고 자동으로 PAYMENT_EXPIRED 전이시키는 로직도 미구현, 필요 시 별도 작업).
const PAYMENT_DUE_MINUTES = 30;

export enum OrderErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  AUCTION_NOT_FOUND = 'AUCTION_NOT_FOUND',
  AUCTION_NOT_ENDED = 'AUCTION_NOT_ENDED',
  NOT_AUCTION_WINNER = 'NOT_AUCTION_WINNER',
  DUPLICATE_ORDER = 'DUPLICATE_ORDER',
  INSUFFICIENT_WALLET_BALANCE = 'INSUFFICIENT_WALLET_BALANCE',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_ORDER_STATUS = 'INVALID_ORDER_STATUS',
}

export class OrderError extends Error {
  code: OrderErrorCode;
  status: number;
  constructor(code: OrderErrorCode, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface AuctionForOrder {
  id: string;
  current_price: number;
  seller_fee_amt: number;
  buyer_discount_amt: number;
  shipping_fee: number;
  top_bidder_id: number | null;
  seller_id: number;
  status: string;
}

export interface OrderRow {
  id: number;
  user_id: number;
  auction_id: string;
  order_number: string;
  original_amount: number;
  auction_fee_amount: number;
  discount_amount: number;
  shipping_amount: number;
  point_used_amount: number;
  money_used_amount: number;
  external_payment_amount: number;
  payment_amount: number;
  status: OrderStatus;
  payment_due_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderRecord {
  id: number;
  userId: number;
  auctionId: string;
  orderNumber: string;
  originalAmount: number;
  auctionFeeAmount: number;
  discountAmount: number;
  shippingAmount: number;
  pointUsedAmount: number;
  moneyUsedAmount: number;
  externalPaymentAmount: number;
  paymentAmount: number;
  status: OrderStatus;
  paymentDueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toOrderRecord(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    userId: row.user_id,
    auctionId: row.auction_id,
    orderNumber: row.order_number,
    originalAmount: Number(row.original_amount),
    auctionFeeAmount: Number(row.auction_fee_amount),
    discountAmount: Number(row.discount_amount),
    shippingAmount: Number(row.shipping_amount),
    pointUsedAmount: Number(row.point_used_amount),
    moneyUsedAmount: Number(row.money_used_amount),
    externalPaymentAmount: Number(row.external_payment_amount),
    paymentAmount: Number(row.payment_amount),
    status: row.status,
    paymentDueAt: row.payment_due_at ? new Date(row.payment_due_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// ─── 상태 전이 (유일한 orders.status 변경 경로) ─────────────────────────────

/**
 * orders.status를 from(허용된 현재 상태 목록) → to로만 전이시킨다.
 * from에 없는 상태에서 호출되면 INVALID_ORDER_STATUS 에러(동시성 경쟁/중복요청 방어).
 * conn을 넘기면 그 트랜잭션 안에서, 생략하면 기본 pool로 즉시 실행한다.
 */
export async function transitionOrder(
  conn: PoolConnection | Pool,
  orderId: number,
  from: OrderStatus[],
  to: OrderStatus,
  extra: { paymentDueAt?: Date | null } = {},
): Promise<void> {
  const sets: string[] = ['status = ?'];
  const params: any[] = [to];
  if ('paymentDueAt' in extra) {
    sets.push('payment_due_at = ?');
    params.push(extra.paymentDueAt ?? null);
  }
  params.push(orderId, ...from);

  const [result] = await conn.query<any>(
    `UPDATE orders SET ${sets.join(', ')} WHERE id = ? AND status IN (${from.map(() => '?').join(',')})`,
    params,
  );
  if (result.affectedRows === 0) {
    throw new OrderError(
      OrderErrorCode.INVALID_ORDER_STATUS,
      409,
      `주문 상태 전이 실패 (orderId=${orderId}, expected one of [${from.join(',')}], target=${to})`,
    );
  }
}

// ─── 조회 ───────────────────────────────────────────────────────────────────

export async function getOrderRaw(orderId: number): Promise<OrderRow | null> {
  const [rows] = await pool.query<any[]>('SELECT * FROM orders WHERE id = ?', [orderId]);
  return rows[0] ?? null;
}

// ─── 생성 ───────────────────────────────────────────────────────────────────

export interface CreateOrderParams {
  auctionId: string;
  /** 지갑 머니 사용액(양수, 원 단위) */
  useMoneyAmount?: number;
  /** 포인트 사용액(양수, 원 단위) — 어느 포인트 자산에서 차감할지는 결제 승인 시점에 selectPointUsage로 결정 */
  usePointAmount?: number;
}

function generateOrderNumber(): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD${stamp}${random}`;
}

/**
 * 주문 생성. 금액 관련 입력은 전부 무시하고 auctions 테이블 조회로 서버가 재계산한다.
 * 낙찰자 본인만 생성 가능(top_bidder_id 일치), 동일 auctionId의 유효 주문 중복 생성 방지,
 * 포인트/머니 사용액은 지갑 잔액 대비 소프트 검증만 수행한다(실제 차감은 결제 승인 시점).
 */
export async function createOrder(userId: number, params: CreateOrderParams): Promise<OrderRecord> {
  const auctionId = String(params.auctionId ?? '').trim();
  if (!auctionId) {
    throw new OrderError(OrderErrorCode.INVALID_REQUEST, 400, 'auctionId is required');
  }
  const useMoneyAmount = Math.max(0, Math.trunc(Number(params.useMoneyAmount ?? 0)));
  const usePointAmount = Math.max(0, Math.trunc(Number(params.usePointAmount ?? 0)));
  if (!Number.isFinite(useMoneyAmount) || !Number.isFinite(usePointAmount)) {
    throw new OrderError(OrderErrorCode.INVALID_REQUEST, 400, 'useMoneyAmount/usePointAmount must be numbers');
  }

  const [auctionRows] = await pool.query<any[]>(
    `SELECT id, current_price, seller_fee_amt, buyer_discount_amt, shipping_fee, top_bidder_id, seller_id, status
       FROM auctions WHERE id = ?`,
    [auctionId],
  );
  const auction: AuctionForOrder | undefined = auctionRows[0];
  if (!auction) {
    throw new OrderError(OrderErrorCode.AUCTION_NOT_FOUND, 404, 'auction not found');
  }
  if (auction.status !== 'ended') {
    throw new OrderError(OrderErrorCode.AUCTION_NOT_ENDED, 409, '아직 종료되지 않은 경매입니다');
  }
  if (auction.top_bidder_id === null || Number(auction.top_bidder_id) !== userId) {
    throw new OrderError(OrderErrorCode.NOT_AUCTION_WINNER, 403, '낙찰자 본인만 주문을 생성할 수 있습니다');
  }

  // 낙찰 시점에 services/auction-settlement.ts settleAuction()이 포인트/머니 없이(외부결제 전액) 주문을
  // 미리 만들어두므로, 여기서 곧바로 409를 던지면 구매자가 영영 포인트/머니를 적용할 방법이 없어진다.
  // 아직 결제가 시작되지 않은(PAYMENT_PENDING) 기존 주문이면 새로 만들지 않고 그 구성을 멱등 갱신한다
  // (updateExistingOrderComposition). 이미 결제가 진행/완료된 주문이면 기존대로 DUPLICATE_ORDER.
  const [existing] = await pool.query<any[]>(
    `SELECT id FROM orders WHERE auction_id = ? AND status NOT IN ('CANCELED','PAYMENT_EXPIRED') LIMIT 1`,
    [auctionId],
  );
  const existingOrderId: number | undefined = existing[0]?.id;

  const originalAmount = Number(auction.current_price);
  const auctionFeeAmount = Number(auction.seller_fee_amt);
  const discountAmount = Number(auction.buyer_discount_amt);
  const shippingAmount = Number(auction.shipping_fee ?? 0);
  const gross = Math.max(0, originalAmount + auctionFeeAmount - discountAmount + shippingAmount);

  if (useMoneyAmount + usePointAmount > gross) {
    throw new OrderError(OrderErrorCode.INVALID_REQUEST, 400, '사용 포인트/머니가 주문 금액을 초과할 수 없습니다');
  }

  // 지갑 잔액 대비 소프트 검증(실제 차감 아님) — 결제 승인 시점에 applyWalletTx가 최종 검증한다.
  if (useMoneyAmount > 0) {
    const wallet = await getWallet(userId);
    if (useMoneyAmount > wallet.moneyBalance) {
      throw new OrderError(OrderErrorCode.INSUFFICIENT_WALLET_BALANCE, 409, '머니 잔액이 부족합니다');
    }
  }
  if (usePointAmount > 0) {
    const plan = await selectPointUsage(userId, usePointAmount);
    const planTotal = plan.reduce((sum, item) => sum + item.amount, 0);
    if (planTotal < usePointAmount) {
      throw new OrderError(OrderErrorCode.INSUFFICIENT_WALLET_BALANCE, 409, '포인트 잔액이 부족합니다');
    }
  }

  const paymentAmount = Math.max(0, gross - useMoneyAmount - usePointAmount);
  // external_payment_amount는 point/money 오프셋 이후 실제 PG(카드/계좌/모바일/가상계좌)로 결제해야 할
  // 잔여액이다. 이 설계에서 payment_amount는 이미 point/money를 뺀 값이므로 두 컬럼은 동일하다
  // (payment_amount = 결제 흐름 전체의 "정산 필요 총액", external_payment_amount = 그 중 PG로 나가는 부분 —
  // money/point는 결제 승인 시점에 지갑에서 직접 차감되고 PG를 거치지 않으므로 값이 같다).
  const externalPaymentAmount = paymentAmount;

  if (existingOrderId) {
    return updateExistingOrderComposition(existingOrderId, userId, {
      pointUsedAmount: usePointAmount,
      moneyUsedAmount: useMoneyAmount,
      paymentAmount,
      externalPaymentAmount,
    });
  }

  const orderNumber = generateOrderNumber();
  let insertId: number | null = null;
  for (let attempt = 0; attempt < 5 && insertId === null; attempt++) {
    const candidate = attempt === 0 ? orderNumber : `${orderNumber}${attempt}`;
    try {
      const [result] = await pool.query<any>(
        `INSERT INTO orders
           (user_id, auction_id, order_number, original_amount, auction_fee_amount, discount_amount,
            shipping_amount, point_used_amount, money_used_amount, external_payment_amount, payment_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATED')`,
        [
          userId, auctionId, candidate, originalAmount, auctionFeeAmount, discountAmount,
          shippingAmount, usePointAmount, useMoneyAmount, externalPaymentAmount, paymentAmount,
        ],
      );
      insertId = result.insertId;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY' && attempt < 4) continue;
      throw err;
    }
  }
  if (insertId === null) {
    throw new Error('[order] failed to allocate unique order_number');
  }

  const paymentDueAt = new Date(Date.now() + PAYMENT_DUE_MINUTES * 60_000);
  await transitionOrder(pool, insertId, ['CREATED'], 'PAYMENT_PENDING', { paymentDueAt });

  const row = await getOrderRaw(insertId);
  if (!row) throw new Error('[order] order not found immediately after creation');
  return toOrderRecord(row);
}

/**
 * 낙찰 시 미리 생성된(포인트/머니 없이 전액 외부결제로 세팅된) PAYMENT_PENDING 주문의 포인트/머니 구성을
 * 멱등 갱신한다(체크아웃에서 포인트/머니를 적용해 재요청하는 경로). createOrder()가 gross/지갑 소프트검증까지
 * 마친 뒤 이 함수를 호출하므로, 여기서는 소유자·상태·결제진행여부만 FOR UPDATE 락 안에서 재확인하고
 * 컬럼을 덮어쓴다 — original_amount/auction_fee_amount/discount_amount/shipping_amount(gross 구성요소)는
 * 경매 종료 시점에 이미 고정된 값이라 변경하지 않는다.
 */
async function updateExistingOrderComposition(
  orderId: number,
  userId: number,
  amounts: {
    pointUsedAmount: number;
    moneyUsedAmount: number;
    paymentAmount: number;
    externalPaymentAmount: number;
  },
): Promise<OrderRecord> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query<any[]>('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    const order: OrderRow | undefined = rows[0];
    if (!order) {
      throw new OrderError(OrderErrorCode.ORDER_NOT_FOUND, 404, 'order not found');
    }
    if (order.user_id !== userId) {
      throw new OrderError(OrderErrorCode.FORBIDDEN, 403, '본인 주문만 수정할 수 있습니다');
    }
    if (order.status !== 'PAYMENT_PENDING') {
      // 이미 결제완료/배송중 등으로 넘어간 주문 — 기존과 동일하게 중복 생성으로 취급해 차단한다.
      throw new OrderError(OrderErrorCode.DUPLICATE_ORDER, 409, '이미 진행 중인 주문이 있습니다');
    }
    // 결제(ready)가 이미 시작됐다면(READY 이상, 실패/취소/만료 제외) 구성 변경을 금지한다 — 이미 발급된
    // payment_key/승인요청과 orders 금액이 어긋나는 것을 방지(중복결제/금액불일치 방지).
    const [paymentRows] = await conn.query<any[]>(
      `SELECT id FROM payments WHERE order_id = ? AND status NOT IN ('FAILED','CANCELED','EXPIRED') LIMIT 1`,
      [orderId],
    );
    if (paymentRows[0]) {
      throw new OrderError(OrderErrorCode.DUPLICATE_ORDER, 409, '이미 결제가 진행 중인 주문입니다');
    }

    await conn.query(
      `UPDATE orders
         SET point_used_amount = ?, money_used_amount = ?, payment_amount = ?, external_payment_amount = ?
       WHERE id = ?`,
      [amounts.pointUsedAmount, amounts.moneyUsedAmount, amounts.paymentAmount, amounts.externalPaymentAmount, orderId],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }

  const updated = await getOrderRaw(orderId);
  if (!updated) throw new Error('[order] order not found immediately after composition update');
  return toOrderRecord(updated);
}
