-- 049: 결제/고액입찰 인증세션 — 목적(purpose)별 비활동/절대 만료는 payment-policy.ts 참조
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/049_payment_auth_sessions.sql;

CREATE TABLE IF NOT EXISTS payment_auth_sessions (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  user_id                 INT NOT NULL,
  session_token_hash      VARCHAR(255) NOT NULL,
  authentication_purpose  ENUM('PAYMENT','AUCTION_ENTRY','HIGH_VALUE_BID','HIGH_VALUE_PAYMENT') NOT NULL,
  scope_type              VARCHAR(40) NULL,   -- AUCTION/ORDER/GLOBAL 등
  scope_id                VARCHAR(64) NULL,
  device_id               VARCHAR(100) NULL,
  authenticated_at        DATETIME NOT NULL,
  last_used_at            DATETIME NOT NULL,
  expires_at              DATETIME NOT NULL,
  absolute_expires_at     DATETIME NOT NULL,
  status                  ENUM('ACTIVE','EXPIRED','REVOKED','LOCKED') NOT NULL DEFAULT 'ACTIVE',
  revoked_at              DATETIME NULL,
  revoke_reason           VARCHAR(255) NULL,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payment_auth_sessions_user (user_id, status),
  KEY idx_payment_auth_sessions_expires (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
