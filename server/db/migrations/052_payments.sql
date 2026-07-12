-- 052: 결제 — Provider(PG) 승인 단위. payment_key/idempotency_key UNIQUE로 중복 승인 방지.
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/052_payments.sql;

CREATE TABLE IF NOT EXISTS payments (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  order_id          INT NOT NULL,
  payment_key       VARCHAR(100) NOT NULL,
  provider          VARCHAR(40) NOT NULL,   -- internal/mock_card/mock_account/mock_mobile/mock_virtual_account/toss 등
  method            VARCHAR(40) NOT NULL,   -- MONEY/CARD/ACCOUNT/MOBILE/VIRTUAL_ACCOUNT
  requested_amount  INT NOT NULL DEFAULT 0,
  approved_amount   INT NOT NULL DEFAULT 0,
  canceled_amount   INT NOT NULL DEFAULT 0,
  status            ENUM('READY','AUTHENTICATION_REQUIRED','AUTHENTICATING','AUTHORIZED','PAID','FAILED','CANCELED','PARTIALLY_CANCELED','REFUNDED','EXPIRED') NOT NULL DEFAULT 'READY',
  idempotency_key   VARCHAR(100) NOT NULL,
  requested_at      DATETIME NULL,
  approved_at       DATETIME NULL,
  canceled_at       DATETIME NULL,
  failure_code      VARCHAR(60) NULL,
  failure_message   VARCHAR(255) NULL,
  metadata          JSON NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_payment_key (payment_key),
  UNIQUE KEY uq_payments_idem (idempotency_key),
  KEY idx_payments_order (order_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
