import './helpers/env';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pool from '../src/db/mysql';
import { createUser, userToken, cleanupTestData } from './helpers/factories';
import { buildApp } from './helpers/app';
import paymentCredentialsRouter from '../src/routes/payment-credentials';
import paymentAuthRouter from '../src/routes/payment-auth';
import { validateSessionToken } from '../src/services/payment-auth-session';

const app = buildApp({
  '/api/payment-credentials': paymentCredentialsRouter,
  '/api/payment-auth': paymentAuthRouter,
});

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

test('최초 설정 성공', async () => {
  const user = await newUser();
  const token = userToken(user.id);
  const res = await request(app)
    .post('/api/payment-credentials')
    .set('Authorization', `Bearer ${token}`)
    .send({ password: '135790' });
  assert.equal(res.status, 201);

  const status = await request(app)
    .get('/api/payment-credentials/status')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(status.body.isSet, true);
});

test('올바른 비밀번호 검증 성공', async () => {
  const user = await newUser();
  const token = userToken(user.id);
  await request(app).post('/api/payment-credentials').set('Authorization', `Bearer ${token}`).send({ password: '135790' });

  const res = await request(app)
    .post('/api/payment-credentials/verify')
    .set('Authorization', `Bearer ${token}`)
    .send({ password: '135790' });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('연속 실패 시 잠금(maxFailedAttempts) 및 잠금 중 거부', async () => {
  const user = await newUser();
  const token = userToken(user.id);
  await request(app).post('/api/payment-credentials').set('Authorization', `Bearer ${token}`).send({ password: '135790' });

  let lastRes;
  for (let i = 0; i < 5; i++) {
    lastRes = await request(app)
      .post('/api/payment-credentials/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: '000000' });
  }
  // 5번째 실패에서 잠금(기본 maxFailedAttempts=5) 처리되어야 한다.
  assert.equal(lastRes!.status, 400);
  assert.equal(lastRes!.body.error, 'PAYMENT_PASSWORD_LOCKED');

  // 잠금 중에는 올바른 비밀번호를 입력해도 거부되어야 한다.
  const stillLocked = await request(app)
    .post('/api/payment-credentials/verify')
    .set('Authorization', `Bearer ${token}`)
    .send({ password: '135790' });
  assert.equal(stillLocked.status, 400);
  assert.equal(stillLocked.body.error, 'PAYMENT_PASSWORD_LOCKED');
});

test('비밀번호 변경 시 해당 사용자의 결제 인증세션이 모두 폐기된다', async () => {
  const user = await newUser();
  const token = userToken(user.id);
  await request(app).post('/api/payment-credentials').set('Authorization', `Bearer ${token}`).send({ password: '135790' });

  const sessionRes = await request(app)
    .post('/api/payment-auth/sessions')
    .set('Authorization', `Bearer ${token}`)
    .send({ password: '135790', purpose: 'PAYMENT' });
  assert.equal(sessionRes.status, 201);
  const cookieHeader = sessionRes.headers['set-cookie']![0] as string;
  const rawToken = cookieHeader.split(';')[0].split('=')[1];

  const before = await validateSessionToken(rawToken);
  assert.equal(before.valid, true);

  const changeRes = await request(app)
    .put('/api/payment-credentials')
    .set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: '135790', newPassword: '246810' });
  assert.equal(changeRes.status, 200);

  const after1 = await validateSessionToken(rawToken);
  assert.equal(after1.valid, false);
});
