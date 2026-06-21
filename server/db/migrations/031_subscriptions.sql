CREATE TABLE IF NOT EXISTS subscriptions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  subscriber_id INT NOT NULL,
  seller_id     INT NOT NULL,
  status        ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sub (subscriber_id, seller_id),
  FOREIGN KEY (subscriber_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);
ALTER TABLE products
  ADD COLUMN is_seasonal_bundle TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN subscriber_price   INT NULL,
  ADD COLUMN season_label       VARCHAR(40) NULL;
