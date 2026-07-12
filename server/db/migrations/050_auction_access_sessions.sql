-- 050: 경매 입장 인증세션 — auctions.authentication_mode 가 AUCTION_ENTRY 이상일 때 사용
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/050_auction_access_sessions.sql;

CREATE TABLE IF NOT EXISTS auction_access_sessions (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  user_id                  INT NOT NULL,
  auction_id               VARCHAR(64) NOT NULL,
  auction_group_id         VARCHAR(64) NULL,
  payment_auth_session_id  INT NULL,
  authenticated_at         DATETIME NOT NULL,
  last_used_at             DATETIME NOT NULL,
  expires_at               DATETIME NOT NULL,
  status                   ENUM('ACTIVE','EXPIRED','REVOKED','LOCKED') NOT NULL DEFAULT 'ACTIVE',
  revoked_at               DATETIME NULL,
  revoke_reason            VARCHAR(255) NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auction_access_sessions_user_auction (user_id, auction_id),
  KEY idx_auction_access_sessions_expires (expires_at),
  FOREIGN KEY (user_id)                 REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (auction_id)               REFERENCES auctions(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_auth_session_id)  REFERENCES payment_auth_sessions(id)
);
