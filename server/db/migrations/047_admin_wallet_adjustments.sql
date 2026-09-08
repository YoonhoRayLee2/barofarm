-- 047: 관리자 지갑 조정 이력 — 관리자에 의한 포인트/머니 지급·회수·정정 감사로그
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/047_admin_wallet_adjustments.sql;

CREATE TABLE IF NOT EXISTS admin_wallet_adjustments (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  administrator_id       INT NOT NULL,
  user_id                INT NOT NULL,
  wallet_transaction_id  INT NULL,
  adjustment_type        ENUM('ADMIN_POINT_GRANT','ADMIN_POINT_REVOKE','ADMIN_MONEY_GRANT','ADMIN_MONEY_REVOKE','BALANCE_CORRECTION') NOT NULL,
  asset_type             ENUM('MONEY','EARNED_POINT','EVENT_POINT','TEST_POINT','COMPENSATION_POINT') NOT NULL,
  amount                 INT NOT NULL,
  reason                 VARCHAR(255) NOT NULL,
  internal_memo          VARCHAR(500) NULL,
  reference_id           VARCHAR(64) NULL,
  idempotency_key        VARCHAR(100) NOT NULL,
  request_ip             VARCHAR(64) NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_admin_wallet_adj_idem (idempotency_key),
  KEY idx_admin_wallet_adj_user (user_id, created_at),
  KEY idx_admin_wallet_adj_admin (administrator_id, created_at),
  FOREIGN KEY (administrator_id)      REFERENCES users(id),
  FOREIGN KEY (user_id)               REFERENCES users(id),
  FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id)
);
