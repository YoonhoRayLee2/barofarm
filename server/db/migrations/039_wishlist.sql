-- 039: 위시리스트(상품 찜) 테이블 신설
--
-- 배경: 기존 favorites 는 라이브 찜 전용(live_id VARCHAR). 상품 찜 기능을
-- 분리하기 위해 product_id INT 기반의 wishlist 테이블을 신규 추가한다.
--
-- 주의:
--   * 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행:  SOURCE db/migrations/039_wishlist.sql;
--   * 로컬 환경에서도 동일하게 수동 실행 필요.
--   * IF NOT EXISTS 로 멱등 보장.

CREATE TABLE IF NOT EXISTS wishlist (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  product_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_product (user_id, product_id),
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
