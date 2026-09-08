-- 053: 결제 트랜잭션 원장 — payments 단위 내 개별 승인/취소/환불/포인트 처리 이력
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/053_payment_transactions.sql;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  payment_id               INT NOT NULL,
  transaction_type         ENUM('CHARGE','PAYMENT','CANCEL','REFUND','POINT_EARN','POINT_USE','POINT_RESTORE','POINT_REVOKE') NOT NULL,
  amount                   INT NOT NULL,
  status                   VARCHAR(40) NOT NULL,
  provider_transaction_id  VARCHAR(100) NULL,
  idempotency_key          VARCHAR(100) NOT NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_tx_idem (idempotency_key),
  KEY idx_payment_tx_payment (payment_id, created_at),
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);
