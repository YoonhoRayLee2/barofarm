-- 043: 라이브 사전등록 메모
--
-- 배경: 판매자가 라이브 생성(예고 포함) 시 사전등록 메모를 작성할 수 있도록
-- lives 테이블에 memo 컬럼을 추가한다. (최대 2000자 — API 레벨에서 검증)
--
-- 자동 적용 안 됨. 운영 DB 수동 실행:
-- SOURCE db/migrations/043_live_memo.sql;
ALTER TABLE lives ADD COLUMN memo TEXT NULL;
