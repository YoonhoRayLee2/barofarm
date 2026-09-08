-- 058: REST 인증형 입찰(§22) 지원 — auctions 출처 플래그 + bids 멱등/상태 컬럼
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE server/db/migrations/058_rest_auction_bids.sql;
-- 이미 컬럼이 존재하는 환경에서 재실행하면 "Duplicate column name" 오류가 발생하므로,
-- 처음 실행하는 환경에서만 1회 적용할 것.
--
-- 배경: 기존 소켓 기반 라이브 경매(socket/auction.ts + store/memory.ts Map)는 입찰을 메모리에서
-- 처리하고, 종료 시점(services/livekit-service.ts endAuction)에만 bids 테이블에 최종 낙찰가 1건을
-- INSERT IGNORE로 남긴다 — 이 행들은 idempotency_key/status 없이 NULL로 남는다.
-- 이번 마이그레이션은 신규 REST 입찰 흐름(routes/auction-bids.ts, services/auction-settlement.ts)을 위한
-- 컬럼을 "추가"만 하며, 기존 소켓 입찰 경로가 남기는 행과 완전히 호환된다(신규 컬럼은 전부 NULL 허용/
-- 기본값 처리 — 기존 INSERT 문 변경 불필요).
--
-- auctions.bidding_channel: 해당 경매가 어느 입찰 흐름을 사용하는지 구분하는 출처 플래그.
--   'SOCKET' (기본값) = 기존 라이브 경매(socket/auction.ts, 메모리 상태 authoritative) — 동작 변경 없음.
--   'REST'             = 이번 Phase 5의 REST 인증 입찰/정산 대상. DB auctions.status가 그대로 진행상태의
--                        단일 진실 공급원이 된다(소켓 흐름과 달리 메모리 상태가 없음).
--
-- bids.idempotency_key: 동일 키 재요청(버튼 연타/네트워크 재시도) 시 새 입찰을 만들지 않고 기존 입찰을
--   그대로 반환하기 위한 멱등 키. NULL 허용(기존 소켓 입찰 행은 NULL) + UNIQUE(NULL은 여러 개 허용됨).
-- bids.status: REST 입찰의 생애주기 상태. 기존 소켓 입찰 행은 계속 NULL로 남는다(둘 다 유효한 상태).

ALTER TABLE auctions
  ADD COLUMN bidding_channel ENUM('SOCKET','REST') NOT NULL DEFAULT 'SOCKET';

ALTER TABLE bids
  ADD COLUMN idempotency_key VARCHAR(128) NULL,
  ADD COLUMN status ENUM('CREATED','VALID','OUTBID','WINNING','WON','LOST','CANCELED','INVALID') NULL,
  ADD UNIQUE KEY uq_bids_idempotency_key (idempotency_key);
