/**
 * products 마이그레이션 스크립트
 * 실행: cd server && npm run migrate:products
 *
 * 005_products.sql  — products 테이블 생성
 * 006_product_images.sql — product_images 테이블 생성
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

const MIGRATIONS = [
  '005_products.sql',
  '006_product_images.sql',
];

async function main() {
  const pool = mysql.createPool({
    host:     process.env.DB_HOST     ?? 'localhost',
    user:     process.env.DB_USER     ?? 'root',
    password: process.env.DB_PASS     ?? '',
    database: process.env.DB_NAME     ?? 'barofarm',
    multipleStatements: true,
    waitForConnections: true,
    connectionLimit: 3,
  });

  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

  for (const file of MIGRATIONS) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`[migrate:products] 실행 중: ${file}`);
    await pool.query(sql);
    console.log(`[migrate:products] 완료: ${file}`);
  }

  console.log('[migrate:products] 모든 마이그레이션 완료');
  await pool.end();
}

main().catch(err => {
  console.error('[migrate:products] 오류:', err);
  process.exit(1);
});
