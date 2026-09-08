-- 046: 지갑 원장(ledger) — 모든 잔액 변동 이력을 append-only로 기록
-- idempotency_key UNIQUE로 중복 처리 방지(재시도/중복 요청 안전).
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/046_wallet_transactions.sql;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  wallet_id         INT NOT NULL,
  transaction_type  VARCHAR(40) NOT NULL,   -- CHARGE/PAYMENT/REFUND/POINT_EARN/POINT_USE/ADMIN_ADJUST 등
  asset_type        ENUM('MONEY','EARNED_POINT','EVENT_POINT','TEST_POINT','COMPENSATION_POINT') NOT NULL,
  amount            INT NOT NULL,           -- 증감분(부호 포함, 원 단위)
  balance_before    INT NOT NULL,
  balance_after     INT NOT NULL,
  reference_type    VARCHAR(40) NULL,       -- ORDER/PAYMENT/ADMIN_ADJUSTMENT 등
  reference_id      VARCHAR(64) NULL,
  description       VARCHAR(255) NULL,
  expires_at        DATETIME NULL,          -- 이벤트/테스트 포인트 만료 시각
  created_by        VARCHAR(40) NULL,       -- SYSTEM/ADMIN/USER 등 발생 주체
  idempotency_key   VARCHAR(100) NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wallet_tx_idem (idempotency_key),
  KEY idx_wallet_tx_wallet (wallet_id, created_at),
  FOREIGN KEY (wallet_id) REFERENCES pay_wallets(id) ON DELETE CASCADE
);
