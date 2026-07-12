import './helpers/env';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import pool from '../src/db/mysql';
import { createUser, createAuction, cleanupTestData } from './helpers/factories';
import { createCredential } from '../src/services/payment-credential';
import {
  issueSession,
  validateSessionToken,
} from '../src/services/payment-auth-session';
import { requirePaymentAuth, requireAuctionAccess } from '../src/middleware/payment-auth';

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

test('세션 발급 후 유효기간 내에는 재사용(재입력 없이) 유효하다', async () => {
  const user = await newUser();
  const issued = await issueSession({ userId: user.id, purpose: 'PAYMENT' });
  const result = await validateSessionToken(issued.token);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.session.userId, user.id);
    assert.equal(result.session.purpose, 'PAYMENT');
  }
});

test('만료된 세션은 거부된다', async () => {
  const user = await newUser();
  const issued = await issueSession({ userId: user.id, purpose: 'PAYMENT' });

  // 만료 판정을 직접 확인하기 위해 DB의 expires_at/absolute_expires_at을 과거로 되돌린다.
  await pool.query(
    `UPDATE payment_auth_sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE),
       absolute_expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE)
     WHERE user_id = ?`,
    [user.id],
  );

  const result = await validateSessionToken(issued.token);
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.reason, 'EXPIRED');
});

test('고액 거래는 일반 인증세션만으로는 거부되고, 고액용 세션이면 통과한다', async () => {
  const user = await newUser();
  await createCredential(user.id, '135790');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: user.id, username: 'dydy' };
    next();
  });
  const HIGH_AMOUNT = 5_000_000; // PAY_REAUTH_HIGH_VALUE_PAYMENT 기본값(1,000,000) 초과
  app.post('/pay', requirePaymentAuth('PAYMENT', () => HIGH_AMOUNT), (_req, res) => {
    res.json({ ok: true });
  });

  const normalSession = await issueSession({ userId: user.id, purpose: 'PAYMENT' });
  const rejected = await request(app).post('/pay').set('Cookie', `baro_pay_auth=${normalSession.token}`).send({});
  assert.equal(rejected.status, 403);
  assert.equal(rejected.body.error, 'HIGH_VALUE_REAUTH_REQUIRED');

  const highValueSession = await issueSession({ userId: user.id, purpose: 'HIGH_VALUE_PAYMENT' });
  const accepted = await request(app).post('/pay').set('Cookie', `baro_pay_auth=${highValueSession.token}`).send({});
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.ok, true);
});

test('requireAuctionAccess: PAYMENT_ONLY(기본) 모드는 입장세션 없이 통과한다', async () => {
  const seller = await newUser();
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { userId: seller.id + 1, username: 'dydy' };
    next();
  });
  app.get('/auctions/:auctionId/ping', requireAuctionAccess(), (_req, res) => res.json({ ok: true }));

  const auctionId = await createAuction(seller.id, { authenticationMode: 'PAYMENT_ONLY' });
  const res = await request(app).get(`/auctions/${auctionId}/ping`);
  assert.equal(res.status, 200);
});
