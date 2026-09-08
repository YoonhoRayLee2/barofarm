-- 051: 주문 — 낙찰 후 결제 흐름의 시작점. 실제 생성/오케스트레이션은 Phase 3~4에서 연결.
--
-- 주의: 서버 시작 시 자동 적용되지 않음. 운영 DB에서 수동 실행: SOURCE db/migrations/051_orders.sql;

CREATE TABLE IF NOT EXISTS orders (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  user_id                  INT NOT NULL,
  auction_id               VARCHAR(64) NOT NULL,
  order_number             VARCHAR(40) NOT NULL,
  original_amount          INT NOT NULL DEFAULT 0,
  auction_fee_amount       INT NOT NULL DEFAULT 0,
  discount_amount          INT NOT NULL DEFAULT 0,
  shipping_amount          INT NOT NULL DEFAULT 0,
  point_used_amount        INT NOT NULL DEFAULT 0,
  money_used_amount        INT NOT NULL DEFAULT 0,
  external_payment_amount  INT NOT NULL DEFAULT 0,
  payment_amount           INT NOT NULL DEFAULT 0,
  status                   ENUM('CREATED','PAYMENT_PENDING','PAID','PREPARING','SHIPPED','COMPLETED','CANCELED','PAYMENT_EXPIRED') NOT NULL DEFAULT 'CREATED',
  payment_due_at           DATETIME NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_orders_order_number (order_number),
  KEY idx_orders_user (user_id, created_at),
  KEY idx_orders_auction (auction_id),
  FOREIGN KEY (user_id)    REFERENCES users(id),
  FOREIGN KEY (auction_id) REFERENCES auctions(id)
);
