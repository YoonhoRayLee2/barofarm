CREATE TABLE IF NOT EXISTS consignments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  buyer_id        INT NOT NULL,
  consignment_type ENUM('full','live_only') NOT NULL,
  category        VARCHAR(50) NOT NULL,
  quantity        INT NOT NULL,
  expected_price  INT NOT NULL,
  description     TEXT NOT NULL,
  min_price_type  ENUM('none','some') NOT NULL DEFAULT 'none',
  commission_rate DECIMAL(5,2) NOT NULL,
  commission_negotiable TINYINT(1) NOT NULL DEFAULT 0,
  status          ENUM('pending','matched','closed') NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS consignment_images (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  consignment_id   INT NOT NULL,
  image_url        VARCHAR(500) NOT NULL,
  is_primary       TINYINT(1) NOT NULL DEFAULT 0,
  display_order    INT NOT NULL DEFAULT 0,
  FOREIGN KEY (consignment_id) REFERENCES consignments(id) ON DELETE CASCADE
);
