import './helpers/env';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/db/mysql';
import { createUser, cleanupTestData } from './helpers/factories';
import {
  getWallet,
  withWalletTransaction,
  applyWalletTx,
  selectPointUsage,
  calcEarnPoints,
  restorePointsAndMoney,
  WalletError,
  WalletErrorCode,
} from '../src/services/wallet';

const createdUserIds: number[] = [];
async function newUser() {
  const u = await createUser();
  createdUserIds.push(u.id);
  return u;
}

after(async () => {
  await cleanupTestData(createdUserIds);
  await pool.end();
});

test('applyWalletTx: 충전 시 잔액이 증가한다', async () => {
  const user = await newUser();
  const result = await withWalletTransaction((conn) =>
    applyWalletTx(conn, {
      userId: user.id,
      assetType: 'MONEY',
      transactionType: 'CHARGE',
      amount: 50_000,
      idempotencyKey: `seed_${user.id}_1`,
    }),
  );
  assert.equal(result.balanceAfter, 50_000);
  const wallet = await getWallet(user.id);
  assert.equal(wallet.moneyBalance, 50_000);
});

test('applyWalletTx: 잔액을 초과하는 차감은 WalletError(INSUFFICIENT_WALLET_BALANCE)를 던진다', async () => {
  const user = await newUser();
  await withWalletTransaction((conn) =>
    applyWalletTx(conn, { userId: user.id, assetType: 'MONEY', transactionType: 'CHARGE', amount: 1_000, idempotencyKey: `seed_${user.id}_2` }),
  );
  await assert.rejects(
    withWalletTransaction((conn) =>
      applyWalletTx(conn, { userId: user.id, assetType: 'MONEY', transactionType: 'PAYMENT', amount: -2_000, idempotencyKey: `over_${user.id}` }),
    ),
    (err: unknown) => err instanceof WalletError && err.code === WalletErrorCode.INSUFFICIENT_BALANCE,
  );
});

test('selectPointUsage: TEST_POINT_ENABLED=false(기본)면 테스트포인트는 계획에서 제외되고 일반/이벤트 포인트와 구분된다', async () => {
  const user = await newUser();
  await withWalletTransaction(async (conn) => {
    await applyWalletTx(conn, { userId: user.id, assetType: 'TEST_POINT', transactionType: 'ADMIN_POINT_GRANT', amount: 100_000, idempotencyKey: `tp_${user.id}` });
    await applyWalletTx(conn, { userId: user.id, assetType: 'EARNED_POINT', transactionType: 'POINT_EARN', amount: 5_000, idempotencyKey: `ep_${user.id}` });
  });

  const wallet = await getWallet(user.id);
  assert.equal(wallet.testPointBalance, 100_000);
  assert.equal(wallet.earnedPointBalance, 5_000);

  const plan = await selectPointUsage(user.id, 3_000);
  // 기본 정책(featureFlags.TEST_POINT_ENABLED=false)에서는 TEST_POINT가 계획에서 제외되고,
  // 일반적립포인트(EARNED_POINT)에서만 차감 계획이 만들어져야 한다 — 두 자산유형이 서로 섞이지 않는다.
  assert.equal(plan.length, 1);
  assert.equal(plan[0].assetType, 'EARNED_POINT');
  assert.equal(plan[0].amount, 3_000);
});

test('calcEarnPoints: 자체페이/외부결제 요율을 각각 적용하고 기본(FLOOR) 절사한다', () => {
  // barofarmPayRate 기본 2%, externalPaymentRate 기본 0.5% — 아래 값은 소수점이 생기도록 골랐다.
  const amount = calcEarnPoints(30_333, 10_777);
  const expected = Math.floor(30_333 * 0.02 + 10_777 * 0.005);
  assert.equal(amount, expected);
});

test('restorePointsAndMoney: 취소 복원 시 잔액이 되돌아온다', async () => {
  const user = await newUser();
  await withWalletTransaction((conn) =>
    applyWalletTx(conn, { userId: user.id, assetType: 'MONEY', transactionType: 'CHARGE', amount: 10_000, idempotencyKey: `seed_${user.id}_3` }),
  );
  await withWalletTransaction((conn) =>
    applyWalletTx(conn, { userId: user.id, assetType: 'MONEY', transactionType: 'PAYMENT', amount: -4_000, idempotencyKey: `pay_${user.id}` }),
  );
  let wallet = await getWallet(user.id);
  assert.equal(wallet.moneyBalance, 6_000);

  await withWalletTransaction((conn) =>
    restorePointsAndMoney(conn, {
      userId: user.id,
      items: [{ assetType: 'MONEY', amount: 4_000 }],
      idempotencyKey: `restore_${user.id}`,
    }),
  );
  wallet = await getWallet(user.id);
  assert.equal(wallet.moneyBalance, 10_000);
});
