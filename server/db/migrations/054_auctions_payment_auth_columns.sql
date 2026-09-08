-- 054: auctions 확장 — 인증모드/재인증기준/그룹/입찰단위/즉시구매가 (기존 컬럼 변경 없음, ADD COLUMN만)
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/054_auctions_payment_auth_columns.sql;
-- 이미 컬럼이 존재하는 환경에서 재실행하면 "Duplicate column name" 오류가 발생하므로,
-- 처음 실행하는 환경에서만 1회 적용할 것.

ALTER TABLE auctions
  ADD COLUMN authentication_mode ENUM('PAYMENT_ONLY','AUCTION_ENTRY','ENTRY_AND_PAYMENT','ALWAYS') NOT NULL DEFAULT 'PAYMENT_ONLY',
  ADD COLUMN high_value_reauth_amount INT NULL,
  ADD COLUMN auction_group_id VARCHAR(64) NULL,
  ADD COLUMN minimum_bid_increment INT NULL,
  ADD COLUMN buy_now_price INT NULL;
