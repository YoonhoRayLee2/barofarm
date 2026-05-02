/**
 * AUTH-12 마이그레이션 스크립트
 *
 * 실행 순서:
 *   1. mysql client → server/db/migrations/002_users_auth.sql 실행
 *   2. npm run migrate:auth  (이 스크립트 실행)
 *   3. mysql client → server/db/migrations/003_users_auth_notnull.sql 실행
 *
 * 기존 users row를 순회하여 username/password_hash/nickname/phone 임시값을 채운다.
 *   - username  = name || `user_${id}`
 *   - password_hash = bcrypt('changeme')
 *   - nickname  = 랜덤 닉네임 (generateNickname)
 *   - phone     = 기존값 유지, NULL이면 '000-0000-{zero-padded id}' 임시값
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { generateNickname } from '../src/services/nickname';

const TEMP_PASSWORD = 'changeme';
const SALT_ROUNDS = 12;

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST ?? 'localhost',
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASS ?? '',
    database: process.env.DB_NAME ?? 'barofarm',
    waitForConnections: true,
    connectionLimit: 5,
  });

  console.log('[migrate:auth] 기존 users row backfill 시작...');

  const [rows] = await pool.execute(
    'SELECT id, name, phone, username, password_hash, nickname FROM users',
  ) as [unknown[], unknown];

  const users = rows as Array<{
    id: number;
    name: string | null;
    phone: string | null;
    username: string | null;
    password_hash: string | null;
    nickname: string | null;
  }>;

  console.log(`[migrate:auth] 대상 row 수: ${users.length}`);

  const usedNicknames = new Set<string>();
  const defaultHash = await bcrypt.hash(TEMP_PASSWORD, SALT_ROUNDS);

  for (const user of users) {
    const newUsername = user.username ?? (user.name ? user.name.replace(/\s+/g, '_').slice(0, 30) : `user_${user.id}`);
    const newHash = user.password_hash ?? defaultHash;

    let newNickname = user.nickname;
    if (!newNickname) {
      let candidate = generateNickname();
      let tries = 0;
      while (usedNicknames.has(candidate) && tries < 20) {
        candidate = generateNickname();
        tries++;
      }
      newNickname = candidate;
      usedNicknames.add(candidate);
    }

    const newPhone = user.phone ?? `000-0000-${String(user.id).padStart(4, '0')}`;

    await pool.execute(
      `UPDATE users
       SET username = ?, password_hash = ?, nickname = ?, phone = ?
       WHERE id = ?`,
      [newUsername, newHash, newNickname, newPhone, user.id],
    );

    console.log(`  [${user.id}] username=${newUsername}, nickname=${newNickname}, phone=${newPhone}`);
  }

  console.log('[migrate:auth] backfill 완료. 다음: 003_users_auth_notnull.sql 실행');
  await pool.end();
}

main().catch(err => {
  console.error('[migrate:auth] 오류:', err);
  process.exit(1);
});
