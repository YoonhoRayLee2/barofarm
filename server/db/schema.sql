CREATE DATABASE IF NOT EXISTS barofarm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE barofarm;

CREATE TABLE IF NOT EXISTS users (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  username             VARCHAR(30)  NOT NULL UNIQUE,
  password_hash        VARCHAR(255) NOT NULL,
  nickname             VARCHAR(60)  NOT NULL,
  name                 VARCHAR(50)  NULL COMMENT 'deprecated: 하위 호환 유지, 신규 코드는 username/nickname 사용',
  role                 ENUM('seller','buyer') NOT NULL DEFAULT 'buyer',
  phone                VARCHAR(20)  NOT NULL UNIQUE,
  created_at           DATETIME DEFAULT NOW(),
  avatar_url           VARCHAR(500) NULL,
  nickname_changed_at  DATETIME     NULL,
  delivery_name        VARCHAR(60)  NULL,
  delivery_phone       VARCHAR(20)  NULL,
  delivery_address     VARCHAR(255) NULL,
  delivery_detail      VARCHAR(100) NULL,
  delivery_zipcode     VARCHAR(10)  NULL
);

CREATE TABLE IF NOT EXISTS auctions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  seller_id      INT NOT NULL,
  product_name   VARCHAR(100) NOT NULL,
  start_price    INT NOT NULL,
  current_price  INT NOT NULL,
  top_bidder_id  INT,
  status         ENUM('pending','live','ended') DEFAULT 'pending',
  image_url      VARCHAR(500),
  ends_at        DATETIME,
  created_at     DATETIME DEFAULT NOW(),
  FOREIGN KEY (seller_id)     REFERENCES users(id),
  FOREIGN KEY (top_bidder_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bids (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  auction_id INT NOT NULL,
  bidder_id  INT NOT NULL,
  price      INT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (auction_id) REFERENCES auctions(id),
  FOREIGN KEY (bidder_id)  REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chats (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  auction_id INT NOT NULL,
  user_id    INT NOT NULL,
  message    TEXT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (auction_id) REFERENCES auctions(id),
  FOREIGN KEY (user_id)    REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  live_id    VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_live (user_id, live_id),
  INDEX idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

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
