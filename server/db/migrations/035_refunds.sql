-- 반품/환불 요청
-- status: requested(신청) → approved(승인)/rejected(거절) → completed(환불완료)
-- 신청 가능 주문 상태: shipped(발송완료), purchase_confirmed(구매확정)
CREATE TABLE IF NOT EXISTS refunds (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  auction_id    VARCHAR(64) NOT NULL,
  buyer_id      INT NOT NULL,
  seller_id     INT NOT NULL,
  reason        VARCHAR(200) NOT NULL,
  status        ENUM('requested','approved','rejected','completed') NOT NULL DEFAULT 'requested',
  refund_amount INT NOT NULL DEFAULT 0,
  reject_reason VARCHAR(200) NULL,
  requested_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at    DATETIME NULL,
  completed_at  DATETIME NULL,
  KEY idx_auction (auction_id),
  KEY idx_seller_status (seller_id, status),
  KEY idx_buyer (buyer_id),
  FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
  FOREIGN KEY (buyer_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);
