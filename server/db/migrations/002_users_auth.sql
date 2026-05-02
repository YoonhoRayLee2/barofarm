-- Migration: 002_users_auth
-- 목적: JWT 기반 인증 시스템 지원을 위한 users 테이블 컬럼 추가
-- 실행 순서:
--   1. mysql client에서 이 파일 실행 (ALTER 컬럼 추가, NULL 허용)
--   2. npm run migrate:auth  (기존 row에 username/password_hash/nickname/phone 임시값 backfill)
--   3. mysql client에서 003_users_auth_notnull.sql 실행 (NOT NULL 제약 적용)

USE barofarm;

-- username 컬럼 추가 (id 다음, NULL 허용으로 먼저 추가하여 기존 row 호환)
ALTER TABLE users
  ADD COLUMN username VARCHAR(30) NULL UNIQUE AFTER id;

-- password_hash 컬럼 추가
ALTER TABLE users
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER username;

-- nickname 컬럼 추가
ALTER TABLE users
  ADD COLUMN nickname VARCHAR(60) NULL AFTER password_hash;

-- phone 컬럼이 기존에 nullable VARCHAR(20) 이므로 UNIQUE 인덱스만 추가
-- (NOT NULL 전환은 backfill 후 003 에서 수행)
ALTER TABLE users
  ADD UNIQUE INDEX idx_users_phone (phone);

-- name 컬럼 deprecated 주석 (컬럼 유지, 마이그레이션 호환용)
-- name 컬럼은 하위 호환을 위해 유지. 신규 코드는 username/nickname 사용.
