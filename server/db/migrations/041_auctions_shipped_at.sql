-- 041: 발송 시각 기록 (평균 배송 소요일 집계용)
--
-- 배경: combinable-shipping 응답에 avgShippingDays를 추가하기 위해
-- auctions 테이블에 shipped_at 컬럼을 추가한다.
-- delivery_status = 'shipped' 전환 시 NOW()로 기록.
-- 기존 발송건은 NULL — 표본 부족 시 집계 null(집계 불가) 처리가 정상 동작.
--
-- 자동 적용 안 됨. 운영 DB 수동 실행:
-- SOURCE db/migrations/041_auctions_shipped_at.sql;
ALTER TABLE auctions ADD COLUMN shipped_at DATETIME NULL AFTER delivery_status;
