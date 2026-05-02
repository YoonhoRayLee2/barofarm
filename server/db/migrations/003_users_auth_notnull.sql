-- Migration: 003_users_auth_notnull
-- 목적: backfill(npm run migrate:auth) 완료 후 NOT NULL 제약 적용
-- 실행 순서: 반드시 002 + npm run migrate:auth 완료 후 실행

USE barofarm;

ALTER TABLE users
  MODIFY COLUMN username VARCHAR(30) NOT NULL;

ALTER TABLE users
  MODIFY COLUMN password_hash VARCHAR(255) NOT NULL;

ALTER TABLE users
  MODIFY COLUMN nickname VARCHAR(60) NOT NULL;

ALTER TABLE users
  MODIFY COLUMN phone VARCHAR(20) NOT NULL;
