import './helpers/env';
// 운영 하드 차단(TEST_POINT_PRODUCTION_DISABLED)이 실제로 차단하는지 별도 프로세스(파일)에서 검증한다
// — admin-wallet.test.ts는 지급/회수 자체를 검증해야 하므로 이 플래그를 꺼둔 채로 돌기 때문에 분리했다.
import './helpers/enable-test-points-production-disabled';

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pool from '../src/db/mysql';
import { createUser, adminToken, cleanupTestData } from './helpers/factories';
import { buildApp } from './helpers/app';
import adminWalletRouter from '../src/routes/admin-wallet';

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

test('운영 하드 차단(TEST_POINT_PRODUCTION_DISABLED=true)이면 관리자도 테스트포인트를 지급할 수 없다', async () => {
  const admin = await newUser({ isAdmin: true });
  const target = await newUser();
  const token = adminToken(admin.id);

  const res = await request(app)
    .post(`/api/admin/users/${target.id}/wallet/test-points/grant`)
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 1_000, reason: '테스트', idempotencyKey: `grant_${target.id}_blocked` });

  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'TEST_POINT_PRODUCTION_DISABLED');
});
