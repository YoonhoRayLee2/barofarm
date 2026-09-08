-- 056: auction_access_sessions 스코프 확장 — 특정경매/동일판매자/경매그룹/전체(§5.2) 표현
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/056_auction_access_sessions_scope.sql;
-- 이미 컬럼이 존재하는 환경에서 재실행하면 "Duplicate column name" 오류가 발생하므로,
-- 처음 실행하는 환경에서만 1회 적용할 것.
--
-- scope_type='AUCTION'  → auction_id 로 특정 경매만 매칭
-- scope_type='GROUP'    → auction_group_id 로 동일 경매그룹 매칭
-- scope_type='SELLER'   → seller_id 로 동일 판매자의 모든 경매 매칭
-- scope_type='GLOBAL'   → 사용자 전체 경매 매칭 (auction_id/seller_id 불필요)
-- GROUP/SELLER/GLOBAL 스코프는 특정 auction_id에 종속되지 않으므로 NOT NULL 제약을 해제한다.

ALTER TABLE auction_access_sessions
  MODIFY COLUMN auction_id VARCHAR(64) NULL,
  ADD COLUMN scope_type ENUM('AUCTION','SELLER','GROUP','GLOBAL') NOT NULL DEFAULT 'AUCTION' AFTER auction_group_id,
  ADD COLUMN seller_id INT NULL AFTER scope_type,
  ADD KEY idx_auction_access_sessions_scope (user_id, scope_type, seller_id),
  ADD KEY idx_auction_access_sessions_group (user_id, auction_group_id),
  ADD FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE;
