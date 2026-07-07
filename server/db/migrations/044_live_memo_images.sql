-- 044: 라이브 메모 사진 첨부
--
-- 배경: 판매자가 라이브 메모에 사진(최대 5장)을 첨부할 수 있도록
-- lives 테이블에 memo_images 컬럼을 추가한다.
-- (업로드 URL 배열을 JSON 문자열로 저장 — 별도 테이블 없이 단순 유지)
--
-- 자동 적용 안 됨. 운영 DB 수동 실행:
-- SOURCE db/migrations/044_live_memo_images.sql;
ALTER TABLE lives ADD COLUMN memo_images TEXT NULL;
