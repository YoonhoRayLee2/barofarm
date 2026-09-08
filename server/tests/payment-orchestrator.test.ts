import './helpers/env';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/db/mysql';
import { createUser, createAuction, cleanupTestData } from './helpers/factories';
import { createOrder, getOrderRaw, OrderError, OrderErrorCode } from '../src/services/order';
import {
  readyPayment,
  approvePayment,
  cancelPayment,
  partialCancelPayment,
  PaymentOrchestratorError,
  PaymentOrchestratorErrorCode,
} from '../src/services/payment-orchestrator';
import { getWallet, withWalletTransaction, applyWalletTx, calcEarnPoints } from '../src/services/wallet';

const createdUserIds: number[] = [];
async function newUser(role: 'buyer' | 'seller' = 'buyer') {
  const u = await createUser({ role });
  createdUserIds.push(u.id);
  return u;
}

after(async () => {
  await cleanupTestData(createdUserIds);
  await pool.end();
});

async function seed(userId: number, assetType: 'MONEY' | 'EVENT_POINT', amount: number) {
  await withWalletTransaction((conn) =>
    applyWalletTx(conn, {
      userId,
      assetType,
      transactionType: assetType === 'MONEY' ? 'CHARGE' : 'ADMIN_POINT_GRANT',
      amount,
      idempotencyKey: `seed_${userId}_${assetType}_${Date.now()}_${Math.random()}`,
    }),
  );
}

/** 낙찰 완료(ended) 상태의 경매 + PAYMENT_PENDING 주문을 만든다. */
async function setupOrder(opts: {
  buyerId: number;
  sellerId: number;
  currentPrice: number;
  useMoneyAmount?: number;
  usePointAmount?: number;
}) {
  const auctionId = await createAuction(opts.sellerId, {
    status: 'ended',
    currentPrice: opts.currentPrice,
    topBidderId: opts.buyerId,
  });
  const order = await createOrder(opts.buyerId, {
    auctionId,
    useMoneyAmount: opts.useMoneyAmount ?? 0,
    usePointAmount: opts.usePointAmount ?? 0,
  });
  return { auctionId, order };
}

test('자체페이(포인트+머니) 전액 결제 — 외부결제 없이 승인되고 적립된다', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  await seed(buyer.id, 'EVENT_POINT', 30_000);
  await seed(buyer.id, 'MONEY', 70_000);

  const { order } = await setupOrder({ buyerId: buyer.id, sellerId: seller.id, currentPrice: 100_000, useMoneyAmount: 70_000, usePointAmount: 30_000 });
  assert.equal(order.paymentAmount, 0);

  const payment = await readyPayment(buyer.id, { orderId: order.id, method: 'MONEY', idempotencyKey: `ready_${order.id}` });
  const approved = await approvePayment(buyer.id, payment.id, { idempotencyKey: `approve_${order.id}` });

  assert.equal(approved.status, 'PAID');
  assert.equal(approved.approvedAmount, 0);

  const wallet = await getWallet(buyer.id);
  assert.equal(wallet.moneyBalance, 0);
  assert.equal(wallet.eventPointBalance, 0);
  assert.equal(wallet.earnedPointBalance, calcEarnPoints(100_000, 0));

  const finalOrder = await getOrderRaw(order.id);
  assert.equal(finalOrder!.status, 'PAID');
});

test('잔액부족(INSUFFICIENT_WALLET_BALANCE) — 지갑 머니보다 큰 사용액은 주문 생성 단계에서 거부된다', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  await seed(buyer.id, 'MONEY', 1_000);

  const auctionId = await createAuction(seller.id, { status: 'ended', currentPrice: 50_000, topBidderId: buyer.id });
  await assert.rejects(
    createOrder(buyer.id, { auctionId, useMoneyAmount: 10_000 }),
    (err: unknown) => err instanceof OrderError && err.code === OrderErrorCode.INSUFFICIENT_WALLET_BALANCE,
  );
});

test('복합결제(포인트+머니+외부결제) 안분 적립 — 자체페이분/외부결제분 요율을 각각 반영한다', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  await seed(buyer.id, 'EVENT_POINT', 20_000);
  await seed(buyer.id, 'MONEY', 10_000);

  const { order } = await setupOrder({ buyerId: buyer.id, sellerId: seller.id, currentPrice: 130_000, useMoneyAmount: 10_000, usePointAmount: 20_000 });
  assert.equal(order.paymentAmount, 100_000);

  const payment = await readyPayment(buyer.id, { orderId: order.id, method: 'CARD', cardInfo: { last4: '0000' }, idempotencyKey: `ready_${order.id}` });
  const approved = await approvePayment(buyer.id, payment.id, { idempotencyKey: `approve_${order.id}`, cardInfo: { last4: '0000' } });

  assert.equal(approved.status, 'PAID');
  assert.equal(approved.approvedAmount, 100_000);

  const expectedEarn = calcEarnPoints(30_000, 100_000); // 자체페이분 2% + 외부결제분 0.5% 안분 합산
  assert.ok(expectedEarn > calcEarnPoints(0, 100_000), '자체페이분이 적립에 반영되어야 한다(회귀 방지)');
  const wallet = await getWallet(buyer.id);
  assert.equal(wallet.earnedPointBalance, expectedEarn);
});

test('취소 시 포인트/머니 복원 및 적립금 회수', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  await seed(buyer.id, 'EVENT_POINT', 20_000);
  await seed(buyer.id, 'MONEY', 10_000);

  const { order } = await setupOrder({ buyerId: buyer.id, sellerId: seller.id, currentPrice: 130_000, useMoneyAmount: 10_000, usePointAmount: 20_000 });
  const payment = await readyPayment(buyer.id, { orderId: order.id, method: 'CARD', cardInfo: { last4: '0000' }, idempotencyKey: `ready_${order.id}` });
  await approvePayment(buyer.id, payment.id, { idempotencyKey: `approve_${order.id}`, cardInfo: { last4: '0000' } });

  const walletBeforeCancel = await getWallet(buyer.id);
  assert.equal(walletBeforeCancel.moneyBalance, 0);
  assert.equal(walletBeforeCancel.eventPointBalance, 0);

  const canceled = await cancelPayment(buyer.id, payment.id, { idempotencyKey: `cancel_${order.id}` });
  assert.equal(canceled.status, 'CANCELED');

  const walletAfterCancel = await getWallet(buyer.id);
  assert.equal(walletAfterCancel.moneyBalance, 10_000);
  assert.equal(walletAfterCancel.eventPointBalance, 20_000);
  assert.equal(walletAfterCancel.earnedPointBalance, 0);

  const finalOrder = await getOrderRaw(order.id);
  assert.equal(finalOrder!.status, 'CANCELED');
});

test('카드 결제 실패(끝자리 1111) — PAYMENT_APPROVAL_FAILED', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const { order } = await setupOrder({ buyerId: buyer.id, sellerId: seller.id, currentPrice: 20_000 });
  const payment = await readyPayment(buyer.id, { orderId: order.id, method: 'CARD', cardInfo: { last4: '1111' }, idempotencyKey: `ready_${order.id}` });

  await assert.rejects(
    approvePayment(buyer.id, payment.id, { idempotencyKey: `approve_${order.id}`, cardInfo: { last4: '1111' } }),
    (err: unknown) => err instanceof PaymentOrchestratorError && err.code === 'PAYMENT_APPROVAL_FAILED' && err.status === 402,
  );

  const [rows] = await pool.query<any[]>('SELECT status FROM payments WHERE id = ?', [payment.id]);
  assert.equal(rows[0].status, 'FAILED');
});

test('계좌 잔액부족(끝자리 3333) — INSUFFICIENT_BALANCE', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const { order } = await setupOrder({ buyerId: buyer.id, sellerId: seller.id, currentPrice: 20_000 });
  const payment = await readyPayment(buyer.id, { orderId: order.id, method: 'ACCOUNT', accountInfo: { last4: '3333' }, idempotencyKey: `ready_${order.id}` });

  await assert.rejects(
    approvePayment(buyer.id, payment.id, { idempotencyKey: `approve_${order.id}`, accountInfo: { last4: '3333' } }),
    (err: unknown) => err instanceof PaymentOrchestratorError && err.code === 'INSUFFICIENT_BALANCE',
  );
});

test('타임아웃 시나리오(mockResult=timeout) — PAYMENT_TIMEOUT(504)', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const { order } = await setupOrder({ buyerId: buyer.id, sellerId: seller.id, currentPrice: 20_000 });
  const payment = await readyPayment(buyer.id, { orderId: order.id, method: 'CARD', cardInfo: { last4: '0000' }, idempotencyKey: `ready_${order.id}` });

  await assert.rejects(
    approvePayment(buyer.id, payment.id, { idempotencyKey: `approve_${order.id}`, cardInfo: { last4: '0000' }, mockResult: 'timeout' }),
    (err: unknown) => err instanceof PaymentOrchestratorError && err.code === PaymentOrchestratorErrorCode.PAYMENT_TIMEOUT && err.status === 504,
  );
});

test('금액 위변조 시도는 차단된다(서버 재계산 금액과 불일치)', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const { order } = await setupOrder({ buyerId: buyer.id, sellerId: seller.id, currentPrice: 20_000 });
  const payment = await readyPayment(buyer.id, { orderId: order.id, method: 'CARD', cardInfo: { last4: '0000' }, idempotencyKey: `ready_${order.id}` });

  await assert.rejects(
    approvePayment(buyer.id, payment.id, { idempotencyKey: `approve_${order.id}`, amount: order.paymentAmount + 1, cardInfo: { last4: '0000' } }),
    (err: unknown) => err instanceof PaymentOrchestratorError && err.code === PaymentOrchestratorErrorCode.PAYMENT_AMOUNT_MISMATCH,
  );
});

test('멱등 승인 — 동일 idempotencyKey 재요청은 재처리 없이 동일 결과를 반환한다', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const { order } = await setupOrder({ buyerId: buyer.id, sellerId: seller.id, currentPrice: 20_000 });
  const payment = await readyPayment(buyer.id, { orderId: order.id, method: 'CARD', cardInfo: { last4: '0000' }, idempotencyKey: `ready_${order.id}` });
  const idempotencyKey = `approve_${order.id}`;

  const first = await approvePayment(buyer.id, payment.id, { idempotencyKey, cardInfo: { last4: '0000' } });
  const second = await approvePayment(buyer.id, payment.id, { idempotencyKey, cardInfo: { last4: '0000' } });
  assert.equal(first.approvedAmount, second.approvedAmount);
  assert.equal(second.status, 'PAID');

  const [txRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS cnt FROM payment_transactions WHERE payment_id = ? AND transaction_type = 'PAYMENT'`,
    [payment.id],
  );
  assert.equal(txRows[0].cnt, 1);
});

test('전체취소/부분취소', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const { order } = await setupOrder({ buyerId: buyer.id, sellerId: seller.id, currentPrice: 100_000 });
  const payment = await readyPayment(buyer.id, { orderId: order.id, method: 'CARD', cardInfo: { last4: '0000' }, idempotencyKey: `ready_${order.id}` });
  await approvePayment(buyer.id, payment.id, { idempotencyKey: `approve_${order.id}`, cardInfo: { last4: '0000' } });

  const partial1 = await partialCancelPayment(buyer.id, payment.id, { idempotencyKey: `partial1_${order.id}`, cancelAmount: 40_000 });
  assert.equal(partial1.status, 'PARTIALLY_CANCELED');
  assert.equal(partial1.canceledAmount, 40_000);

  const orderMidway = await getOrderRaw(order.id);
  assert.equal(orderMidway!.status, 'PAID');

  const partial2 = await partialCancelPayment(buyer.id, payment.id, { idempotencyKey: `partial2_${order.id}`, cancelAmount: 60_000 });
  assert.equal(partial2.canceledAmount, 100_000);
  assert.equal(partial2.status, 'CANCELED');

  const orderFinal = await getOrderRaw(order.id);
  assert.equal(orderFinal!.status, 'CANCELED');

  await assert.rejects(
    partialCancelPayment(buyer.id, payment.id, { idempotencyKey: `partial3_${order.id}`, cancelAmount: 1 }),
    (err: unknown) => err instanceof PaymentOrchestratorError && err.code === PaymentOrchestratorErrorCode.INVALID_PAYMENT_STATUS,
  );
});
