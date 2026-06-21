CREATE TABLE IF NOT EXISTS delivery_timeline (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  auction_id  VARCHAR(64) NOT NULL,
  stage       ENUM('harvest','packing','departed','arrived') NOT NULL,
  photo_url   VARCHAR(255) NULL,
  farmer_note VARCHAR(200) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timeline_auction (auction_id, created_at),
  CONSTRAINT fk_timeline_auction FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE
);
