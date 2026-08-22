-- 046: 관리자 감사 로그 (admin_audit_logs)
--
-- 배경: 관리자 mutating API 호출(정산/사용자/경매/상품/환불/로그인 등)의 이력을
-- 추적하기 위한 감사 로그 테이블. 감사 실패가 본 액션을 막아서는 안 되므로
-- 기록 실패는 애플리케이션 레벨에서 무시된다(try/catch).
--
-- 주의:
--   * 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행:  SOURCE db/migrations/046_audit_logs.sql;
--   * 로컬 환경에서도 동일하게 수동 실행 필요.
--   * IF NOT EXISTS 로 멱등 보장.

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_user_id INT NOT NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40) NULL,
  target_id VARCHAR(64) NULL,
  detail JSON NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_admin (admin_user_id),
  KEY idx_target (target_type, target_id),
  KEY idx_created (created_at)
);
