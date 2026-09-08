import './helpers/env';
// 이 파일은 테스트포인트 지급/회수 자체를 검증하므로 Feature Flag를 명시적으로 켠다.
// (node --test는 테스트 파일마다 별도 프로세스이므로 다른 테스트 파일의 정책에 영향을 주지 않는다.)
import './helpers/enable-test-points';

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pool from '../src/db/mysql';
import { createUser, adminToken, cleanupTestData } from './helpers/factories';
import { buildApp } from './helpers/app';
import adminWalletRouter from '../src/routes/admin-wallet';
import { getWallet } from '../src/services/wallet';

const app = buildApp({ '/api/admin': adminWalletRouter });

const createdUserIds: number[] = [];
async function newUser(opts: Parameters<typeof createUser>[0] = {}) {
  const u = await createUser(opts);
  createdUserIds.push(u.id);
  return u;
}

after(async () => {
  await cleanupTestData(createdUserIds);
  await pool.end();
});

test('테스트포인트 지급/회수 — 관리자가 지급하면 잔액이 늘고, 회수하면 준다', async () => {
  const admin = await newUser({ isAdmin: true });
  const target = await newUser();
  const token = adminToken(admin.id);

  const grantRes = await request(app)
    .post(`/api/admin/users/${target.id}/wallet/test-points/grant`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 5_000, reason: '테스트', idempotencyKey: `grant_${target.id}_1` });
  assert.equal(grantRes.status, 201);
  assert.equal((await getWallet(target.id)).testPointBalance, 5_000);

  const revokeRes = await request(app)
    .post(`/api/admin/users/${target.id}/wallet/test-points/revoke`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 2_000, reason: '회수', idempotencyKey: `revoke_${target.id}_1` });
  assert.equal(revokeRes.status, 201);
  assert.equal((await getWallet(target.id)).testPointBalance, 3_000);
});

test('멱등 중복 지급 방지 — 동일 idempotencyKey 재요청은 잔액을 다시 늘리지 않는다', async () => {
  const admin = await newUser({ isAdmin: true });
  const target = await newUser();
  const token = adminToken(admin.id);
  const idempotencyKey = `grant_${target.id}_dup`;

  const first = await request(app)
    .post(`/api/admin/users/${target.id}/wallet/test-points/grant`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 1_000, reason: '테스트', idempotencyKey });
  assert.equal(first.status, 201);
  assert.equal(first.body.idempotent, false);

  const second = await request(app)
    .post(`/api/admin/users/${target.id}/wallet/test-points/grant`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 1_000, reason: '테스트', idempotencyKey });
  assert.equal(second.status, 201);
  assert.equal(second.body.idempotent, true);

  assert.equal((await getWallet(target.id)).testPointBalance, 1_000);
});

test('잔액 초과 회수는 차단된다', async () => {
  const admin = await newUser({ isAdmin: true });
  const target = await newUser();
  const token = adminToken(admin.id);

  await request(app)
    .post(`/api/admin/users/${target.id}/wallet/test-points/grant`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 1_000, reason: '테스트', idempotencyKey: `grant_${target.id}_2` });

  const res = await request(app)
    .post(`/api/admin/users/${target.id}/wallet/test-points/revoke`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 5_000, reason: '초과회수', idempotencyKey: `revoke_${target.id}_over` });

  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'INSUFFICIENT_WALLET_BALANCE');
  assert.equal((await getWallet(target.id)).testPointBalance, 1_000);
});

test('일반 유저(관리자/개발자 아님)는 403으로 차단된다', async () => {
  const plainUser = await newUser({ isAdmin: false, isDeveloper: false });
  const target = await newUser();
  const token = adminToken(plainUser.id); // admin JWT 형식이어도 DB의 is_admin/is_developer가 false면 차단되어야 한다

  const res = await request(app)
    .post(`/api/admin/users/${target.id}/wallet/test-points/grant`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 1_000, reason: '테스트', idempotencyKey: `grant_${target.id}_forbidden` });

  assert.equal(res.status, 403);
});

test('개발자(is_developer=true, is_admin=false)는 테스트포인트 지급이 허용된다', async () => {
  const developer = await newUser({ isAdmin: false, isDeveloper: true });
  const target = await newUser();
  const token = adminToken(developer.id);

  const res = await request(app)
    .post(`/api/admin/users/${target.id}/wallet/test-points/grant`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 1_000, reason: '개발자 지급', idempotencyKey: `grant_${target.id}_dev` });

  assert.equal(res.status, 201);
});
