-- 038: bids/chats.auction_id 를 INT → VARCHAR(64) 로 교정
--
-- 배경: 경매 ID가 UUID(VARCHAR(64))로 바뀌었으나, 일부 환경(운영 DB)의
-- bids.auction_id / chats.auction_id 가 구버전 INT 로 남아 있어,
-- UUID 문자열로 조회/삭제 시 "Truncated incorrect DOUBLE value" (errno 1292) 발생.
-- schema.sql 정의(VARCHAR(64))에 맞춰 운영 DB를 교정한다.
--
-- 주의:
--   * 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행:  SOURCE db/migrations/038_fix_auction_id_type.sql;
--   * 이미 VARCHAR(64)인 환경(로컬 등)에서 실행해도 안전(타입 동일 MODIFY는 무해, FK는 동적 처리).
--   * INT 시절 남은 기존 행은 UUID auctions 와 매칭되지 않는 고아 데이터이므로 FK 재생성 전에 제거한다.

-- ── 0) 안전장치 ───────────────────────────────────────────────
SET @schema := DATABASE();

-- ── 1) auction_id 에 걸린 외래키를 (이름에 의존하지 않고) 동적으로 DROP ──
-- 자동생성 이름(bids_ibfk_*)이든 이전 실행이 만든 이름(fk_*_auction)이든 모두 처리 → 멱등
SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA=@schema AND TABLE_NAME='bids' AND COLUMN_NAME='auction_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1);
SET @sql := IF(@fk IS NULL, 'SELECT 1', CONCAT('ALTER TABLE bids DROP FOREIGN KEY `', @fk, '`'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA=@schema AND TABLE_NAME='chats' AND COLUMN_NAME='auction_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1);
SET @sql := IF(@fk IS NULL, 'SELECT 1', CONCAT('ALTER TABLE chats DROP FOREIGN KEY `', @fk, '`'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 2) 컬럼 타입 교정 INT → VARCHAR(64) ──────────────────────
ALTER TABLE bids  MODIFY COLUMN auction_id VARCHAR(64) NOT NULL;
ALTER TABLE chats MODIFY COLUMN auction_id VARCHAR(64) NOT NULL;

-- ── 3) auctions 에 매칭되지 않는 고아 행 제거 (FK 재생성 전 필수) ──
DELETE b FROM bids  b LEFT JOIN auctions a ON a.id = b.auction_id WHERE a.id IS NULL;
DELETE c FROM chats c LEFT JOIN auctions a ON a.id = c.auction_id WHERE a.id IS NULL;

-- ── 4) 외래키 재생성 (schema.sql 과 동일하게) ────────────────
ALTER TABLE bids  ADD CONSTRAINT fk_bids_auction  FOREIGN KEY (auction_id) REFERENCES auctions(id);
ALTER TABLE chats ADD CONSTRAINT fk_chats_auction FOREIGN KEY (auction_id) REFERENCES auctions(id);
