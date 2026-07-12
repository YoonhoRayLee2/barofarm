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

  const [existing] = await pool.query<any[]>(
    `SELECT id FROM orders WHERE auction_id = ? AND status NOT IN ('CANCELED','PAYMENT_EXPIRED') LIMIT 1`,
    [auctionId],
  );
  if (existing[0]) {
    throw new OrderError(OrderErrorCode.DUPLICATE_ORDER, 409, '이미 진행 중인 주문이 있습니다');
  }

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
