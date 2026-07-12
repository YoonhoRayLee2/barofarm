import './helpers/env';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pool from '../src/db/mysql';
import { createUser, createAuction, userToken, cleanupTestData } from './helpers/factories';
import { buildApp } from './helpers/app';
import auctionBidsRouter from '../src/routes/auction-bids';

const app = buildApp({ '/api/auctions': auctionBidsRouter });

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

test('정상 입찰 성공 — 현재가가 갱신된다', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const auctionId = await createAuction(seller.id, { currentPrice: 10_000 });

  const res = await request(app)
    .post(`/api/auctions/${auctionId}/bids`)
    .set('Authorization', `Bearer ${userToken(buyer.id)}`)
    .send({ amount: 11_000, idempotencyKey: `bid_${auctionId}_1` });

  assert.equal(res.status, 201);
  assert.equal(res.body.bid.amount, 11_000);

  const [rows] = await pool.query<any[]>('SELECT current_price FROM auctions WHERE id = ?', [auctionId]);
  assert.equal(rows[0].current_price, 11_000);
});

test('최소 입찰단위 미달 시 거부된다', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const auctionId = await createAuction(seller.id, { currentPrice: 10_000, minimumBidIncrement: 1_000 });

  const res = await request(app)
    .post(`/api/auctions/${auctionId}/bids`)
    .set('Authorization', `Bearer ${userToken(buyer.id)}`)
    .send({ amount: 10_500, idempotencyKey: `bid_${auctionId}_low` });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'BID_TOO_LOW');
});

test('현재가 이하 입찰은 거부된다', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const auctionId = await createAuction(seller.id, { currentPrice: 10_000 });

  const res = await request(app)
    .post(`/api/auctions/${auctionId}/bids`)
    .set('Authorization', `Bearer ${userToken(buyer.id)}`)
    .send({ amount: 9_000, idempotencyKey: `bid_${auctionId}_under` });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'BID_TOO_LOW');
});

test('동일 idempotencyKey 재요청은 중복 처리 없이 동일 입찰을 반환한다', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const auctionId = await createAuction(seller.id, { currentPrice: 10_000 });
  const idempotencyKey = `bid_${auctionId}_dup`;

  const first = await request(app)
    .post(`/api/auctions/${auctionId}/bids`)
    .set('Authorization', `Bearer ${userToken(buyer.id)}`)
    .send({ amount: 12_000, idempotencyKey });
  assert.equal(first.status, 201);
  assert.equal(first.body.replay, false);

  const second = await request(app)
    .post(`/api/auctions/${auctionId}/bids`)
    .set('Authorization', `Bearer ${userToken(buyer.id)}`)
    .send({ amount: 12_000, idempotencyKey });
  assert.equal(second.status, 200);
  assert.equal(second.body.replay, true);
  assert.equal(second.body.bid.id, first.body.bid.id);

  const [rows] = await pool.query<any[]>('SELECT COUNT(*) AS cnt FROM bids WHERE idempotency_key = ?', [idempotencyKey]);
  assert.equal(rows[0].cnt, 1);
});

test('동시 입찰 — 동일 금액 경합 시 한 건만 반영된다', async () => {
  const seller = await newUser('seller');
  const buyerA = await newUser('buyer');
  const buyerB = await newUser('buyer');
  const auctionId = await createAuction(seller.id, { currentPrice: 10_000, minimumBidIncrement: 1_000 });

  // 두 입찰자가 정확히 동일한 금액(20,000)으로 동시에 입찰한다 — 먼저 반영되는 쪽만 성공하고,
  // 다른 쪽은 "현재가(20,000)+최소단위" 조건을 더는 만족하지 못해 실행 순서와 무관하게 항상 실패해야 한다.
  const [resA, resB] = await Promise.all([
    request(app)
      .post(`/api/auctions/${auctionId}/bids`)
      .set('Authorization', `Bearer ${userToken(buyerA.id)}`)
      .send({ amount: 20_000, idempotencyKey: `bid_${auctionId}_A` }),
    request(app)
      .post(`/api/auctions/${auctionId}/bids`)
      .set('Authorization', `Bearer ${userToken(buyerB.id)}`)
      .send({ amount: 20_000, idempotencyKey: `bid_${auctionId}_B` }),
  ]);

  const statuses = [resA.status, resB.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [201, 400]);

  const [auctionRows] = await pool.query<any[]>('SELECT current_price FROM auctions WHERE id = ?', [auctionId]);
  assert.equal(auctionRows[0].current_price, 20_000);

  const [bidRows] = await pool.query<any[]>(
    `SELECT price, status FROM bids WHERE auction_id = ? AND idempotency_key IS NOT NULL`,
    [auctionId],
  );
  assert.equal(bidRows.length, 1);
  assert.equal(bidRows[0].status, 'WINNING');
  assert.equal(Number(bidRows[0].price), 20_000);
});

test('경매 종료 후(status=ended)에는 입찰이 차단된다', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const auctionId = await createAuction(seller.id, { currentPrice: 10_000, status: 'ended' });

  const res = await request(app)
    .post(`/api/auctions/${auctionId}/bids`)
    .set('Authorization', `Bearer ${userToken(buyer.id)}`)
    .send({ amount: 20_000, idempotencyKey: `bid_${auctionId}_ended` });

  // assertCanParticipate(§5.1)가 placeBid의 자체 검사보다 먼저 종료 여부를 걸러 403으로 거부한다.
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'AUCTION_ACCESS_REQUIRED');
});

test('서버시간 기준 종료판정(ends_at 경과) — status가 아직 live여도 차단된다', async () => {
  const seller = await newUser('seller');
  const buyer = await newUser('buyer');
  const auctionId = await createAuction(seller.id, {
    currentPrice: 10_000,
    status: 'live',
    endsAt: new Date(Date.now() - 60_000),
  });

  const res = await request(app)
    .post(`/api/auctions/${auctionId}/bids`)
    .set('Authorization', `Bearer ${userToken(buyer.id)}`)
    .send({ amount: 20_000, idempotencyKey: `bid_${auctionId}_expired` });

  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'AUCTION_NOT_LIVE');
});
