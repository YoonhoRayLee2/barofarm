CREATE TABLE IF NOT EXISTS delivery_addresses (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  name       VARCHAR(60)  NOT NULL,
  phone      VARCHAR(20)  NOT NULL,
  zipcode    VARCHAR(10)  NOT NULL DEFAULT '',
  address    VARCHAR(255) NOT NULL,
  detail     VARCHAR(100) NULL,
  is_default TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
