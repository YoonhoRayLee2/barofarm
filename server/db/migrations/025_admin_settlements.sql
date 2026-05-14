ALTER TABLE users
  ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS settlements (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  seller_id     INT NOT NULL,
  seller_name   VARCHAR(100) NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  gross_amount  INT NOT NULL DEFAULT 0,
  fee_amount    INT NOT NULL DEFAULT 0,
  net_amount    INT NOT NULL DEFAULT 0,
  auction_count INT NOT NULL DEFAULT 0,
  status        ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  paid_at       DATETIME NULL,
  note          VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_seller (seller_id),
  KEY idx_status (status)
);
