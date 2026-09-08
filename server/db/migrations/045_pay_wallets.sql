-- 045: 사용자 지갑 — 머니(캐시성 잔액) + 포인트(적립/이벤트/테스트) 잔액 보관
-- 낙관적 잠금(version)으로 동시 갱신 충돌 방지. 실제 차감/적립 로직은 Phase 3~4에서 연결.
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/045_pay_wallets.sql;

CREATE TABLE IF NOT EXISTS pay_wallets (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  user_id                INT NOT NULL,
  money_balance          INT NOT NULL DEFAULT 0,
  earned_point_balance   INT NOT NULL DEFAULT 0,
  event_point_balance    INT NOT NULL DEFAULT 0,
  test_point_balance     INT NOT NULL DEFAULT 0,
  auto_charge_enabled    TINYINT(1) NOT NULL DEFAULT 0,
  auto_charge_threshold  INT NOT NULL DEFAULT 0,
  auto_charge_amount     INT NOT NULL DEFAULT 0,
  version                INT NOT NULL DEFAULT 0,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pay_wallets_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
