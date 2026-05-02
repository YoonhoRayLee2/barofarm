CREATE TABLE IF NOT EXISTS products (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  seller_id     INT NOT NULL,
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  price         INT NOT NULL,
  category      VARCHAR(30),
  image_url     VARCHAR(500),
  features      VARCHAR(255),
  attributes    VARCHAR(255),
  status        ENUM('active','sold','hidden') NOT NULL DEFAULT 'active',
  created_at    DATETIME DEFAULT NOW(),
  FOREIGN KEY (seller_id) REFERENCES users(id)
);
