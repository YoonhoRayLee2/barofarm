-- 048: 결제비밀번호 자격증명 — 잠금정책(연속실패/잠금시간)은 payment-policy.ts 참조
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/048_user_payment_credentials.sql;

CREATE TABLE IF NOT EXISTS user_payment_credentials (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  user_id               INT NOT NULL,
  password_hash         VARCHAR(255) NOT NULL,
  password_version      INT NOT NULL DEFAULT 1,
  failed_attempt_count  INT NOT NULL DEFAULT 0,
  locked_until          DATETIME NULL,
  last_changed_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_payment_credentials_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
