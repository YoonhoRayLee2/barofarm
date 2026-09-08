-- 057: pay_wallets에 보상포인트(COMPENSATION_POINT) 버킷 추가
-- wallet_transactions.asset_type / admin_wallet_adjustments.asset_type ENUM에는 이미
-- 'COMPENSATION_POINT'가 포함돼 있었으나(046~047), pay_wallets에는 대응 컬럼이 없어
-- 원장 기록과 잔액 조회가 어긋나는 상태였다. config/payment-policy.ts의
-- pointUsePriority에도 COMPENSATION_POINT가 포함되어 있으므로 스키마와 일치시킨다.
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE server/db/migrations/057_pay_wallets_compensation_point.sql;
-- 이미 컬럼이 존재하는 환경에서 재실행하면 "Duplicate column name" 오류가 발생하므로,
-- 처음 실행하는 환경에서만 1회 적용할 것.

ALTER TABLE pay_wallets
  ADD COLUMN compensation_point_balance INT NOT NULL DEFAULT 0 AFTER test_point_balance;
