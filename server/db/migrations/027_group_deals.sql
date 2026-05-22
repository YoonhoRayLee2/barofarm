CREATE TABLE group_deals (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  seller_id            INT NOT NULL,
  title                VARCHAR(200) NOT NULL,
  description          TEXT,
  image_url            VARCHAR(500),
  category             ENUM('과일','채소','수산','축산','곡물','기타') NOT NULL,
  price_per_unit       INT NOT NULL,
  unit_label           VARCHAR(30) NOT NULL DEFAULT '개',
  min_participants     INT NOT NULL DEFAULT 2,
  max_participants     INT NULL,
  current_participants INT NOT NULL DEFAULT 0,
  status               ENUM('recruiting','confirmed','shipped','completed','cancelled') NOT NULL DEFAULT 'recruiting',
  closes_at            DATETIME NOT NULL,
  created_at           DATETIME NOT NULL DEFAULT NOW(),
  FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE group_deal_participants (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  deal_id   INT NOT NULL,
  buyer_id  INT NOT NULL,
  quantity  INT NOT NULL DEFAULT 1,
  joined_at DATETIME NOT NULL DEFAULT NOW(),
  UNIQUE KEY uq_deal_buyer (deal_id, buyer_id),
  FOREIGN KEY (deal_id) REFERENCES group_deals(id),
  FOREIGN KEY (buyer_id) REFERENCES users(id)
);
