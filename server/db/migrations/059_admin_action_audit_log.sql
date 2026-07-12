-- 059: 어드민 위험작업 감사 로그 (Phase 7, §19) — 결제취소/인증초기화/세션강제종료 등
-- 관리자 조작에 사유·주체·대상을 남기기 위한 공용 감사 테이블.
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE server/db/migrations/059_admin_action_audit_log.sql;

CREATE TABLE IF NOT EXISTS admin_action_audit_log (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  administrator_id  INT NOT NULL,
  action_type       VARCHAR(60) NOT NULL,   -- PAYMENT_CANCEL / PAYMENT_PARTIAL_CANCEL / PAYMENT_CREDENTIAL_ADMIN_RESET /
                                             -- PAYMENT_AUTH_SESSION_ADMIN_REVOKE / AUCTION_ACCESS_SESSION_ADMIN_REVOKE /
                                             -- AUCTION_AUTH_SETTINGS_UPDATE 등
  target_type       VARCHAR(40) NOT NULL,   -- PAYMENT / USER / PAYMENT_AUTH_SESSION / AUCTION_ACCESS_SESSION / AUCTION
  target_id         VARCHAR(64) NOT NULL,
  reason            VARCHAR(500) NULL,      -- 위험작업(취소/초기화/강제종료)은 애플리케이션 레벨에서 필수 검증
  metadata          JSON NULL,
  request_ip        VARCHAR(64) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admin_action_audit_admin (administrator_id, created_at),
  KEY idx_admin_action_audit_target (target_type, target_id),
  FOREIGN KEY (administrator_id) REFERENCES users(id)
);
