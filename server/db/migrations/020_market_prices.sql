CREATE TABLE IF NOT EXISTS market_prices (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  item_code     VARCHAR(20) NOT NULL,
  item_name     VARCHAR(50) NOT NULL,
  kind_name     VARCHAR(50) NOT NULL DEFAULT '',
  unit          VARCHAR(20) NOT NULL DEFAULT '',
  price         INT NOT NULL DEFAULT 0,
  price_date    DATE NOT NULL,
  category      VARCHAR(20) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_item_date (item_code, kind_name, price_date)
);
