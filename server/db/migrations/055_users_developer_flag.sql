-- 055: users 확장 — 개발자 도구 노출 플래그(is_admin과 별개, DEVELOPER_TOOLS_ENABLED 플래그와 조합해 사용)
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/055_users_developer_flag.sql;
-- 이미 컬럼이 존재하는 환경에서 재실행하면 "Duplicate column name" 오류가 발생하므로,
-- 처음 실행하는 환경에서만 1회 적용할 것.

ALTER TABLE users
  ADD COLUMN is_developer TINYINT(1) NOT NULL DEFAULT 0;
