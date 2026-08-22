-- 045: settlements 상태에 cancelled 추가
--
-- 배경: 정산 취소 시 기존에는 status를 'pending'으로 되돌렸으나, '지급 취소됨' 상태를
-- 별도로 구분할 필요가 있어 ENUM에 'cancelled'를 추가한다.
--
-- 주의:
--   * 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행:  SOURCE db/migrations/045_settlements_cancelled.sql;
--   * 로컬 환경에서도 동일하게 수동 실행 필요.
--   * 기존 값('pending','paid')은 신규 ENUM의 부분집합이므로 MODIFY는 무해함.

ALTER TABLE settlements MODIFY status ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending';
