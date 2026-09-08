-- 060: 바로팜페이 통합 허브 — payment_methods에서 독립 'barofarm_pay' 결제수단 제거,
-- 계좌이체(account) 타입 추가. 자체 자산(머니/포인트)은 이제 pay_wallets가 전담하므로
-- payment_methods는 외부 등록수단(카드/계좌)만 다룬다.
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/060_payment_methods_account.sql;

DELETE FROM payment_methods WHERE type = 'barofarm_pay';

ALTER TABLE payment_methods
  MODIFY COLUMN type ENUM('card','easy','account') NOT NULL;

ALTER TABLE payment_methods
  ADD COLUMN bank_name      VARCHAR(30) NULL,   -- 은행명
  ADD COLUMN account_last4  VARCHAR(4)  NULL,   -- 계좌번호 끝 4자리
  ADD COLUMN account_holder VARCHAR(40) NULL;   -- 예금주명
