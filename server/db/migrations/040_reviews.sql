-- 040: 리뷰/평점 (거래 종속, 판매자 집계)
--
-- 배경: auctions 테이블이 거래 레코드 역할을 한다. product_id 없이 product_name
-- 문자열만 보유하므로 상품 단위 평점이 아닌 판매자 단위 집계를 채택한다.
-- 구매자(top_bidder_id)가 구매확정/정산완료 상태에서만 리뷰 1건 작성 가능.
-- seller_reply 컬럼은 미래 판매자 답변 기능을 위해 예약한다(이번 릴리즈에서 쓰기 API 없음).
--
-- 주의:
--   * 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행:  SOURCE db/migrations/040_reviews.sql;
--   * 로컬 환경에서도 동일하게 수동 실행 필요.
--   * IF NOT EXISTS 로 멱등 보장.

CREATE TABLE IF NOT EXISTS reviews (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  auction_id   VARCHAR(64) NOT NULL,
  reviewer_id  INT NOT NULL,
  seller_id    INT NOT NULL,
  rating       TINYINT NOT NULL,
  comment      VARCHAR(500) NULL,
  seller_reply VARCHAR(500) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_auction_reviewer (auction_id, reviewer_id),
  KEY idx_seller (seller_id),
  FOREIGN KEY (auction_id)  REFERENCES auctions(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (seller_id)   REFERENCES users(id)    ON DELETE CASCADE
);
