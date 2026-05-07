CREATE DATABASE IF NOT EXISTS barofarm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE barofarm;

CREATE TABLE IF NOT EXISTS users (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  username             VARCHAR(30)  NOT NULL UNIQUE,
  password_hash        VARCHAR(255) NOT NULL,
  nickname             VARCHAR(60)  NOT NULL,
  name                 VARCHAR(50)  NULL,
  role                 ENUM('seller','buyer') NOT NULL DEFAULT 'buyer',
  phone                VARCHAR(20)  NOT NULL UNIQUE,
  created_at           DATETIME DEFAULT NOW(),
  avatar_url           VARCHAR(500) NULL,
  nickname_changed_at  DATETIME     NULL,
  delivery_name        VARCHAR(60)  NULL,
  delivery_phone       VARCHAR(20)  NULL,
  delivery_address     VARCHAR(255) NULL,
  delivery_detail      VARCHAR(100) NULL,
  delivery_zipcode     VARCHAR(10)  NULL,
  interests            VARCHAR(255) NULL
);

CREATE TABLE IF NOT EXISTS auctions (
  id             VARCHAR(64)  NOT NULL PRIMARY KEY,
  seller_id      INT          NOT NULL,
  live_id        VARCHAR(64)  NULL,
  product_name   VARCHAR(100) NOT NULL,
  start_price    INT          NOT NULL,
  current_price  INT          NOT NULL,
  mode           ENUM('normal','fcfs','blind','giveaway','direct') NOT NULL DEFAULT 'normal',
  top_bidder_id  INT,
  status         ENUM('pending','live','ended') DEFAULT 'pending',
  image_url      VARCHAR(500),
  ends_at        DATETIME,
  created_at     DATETIME DEFAULT NOW(),
  FOREIGN KEY (seller_id)     REFERENCES users(id),
  FOREIGN KEY (top_bidder_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bids (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  auction_id VARCHAR(64)  NOT NULL,
  bidder_id  INT          NOT NULL,
  price      INT          NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (auction_id) REFERENCES auctions(id),
  FOREIGN KEY (bidder_id)  REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chats (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  auction_id VARCHAR(64)  NOT NULL,
  user_id    INT          NOT NULL,
  message    TEXT         NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (auction_id) REFERENCES auctions(id),
  FOREIGN KEY (user_id)    REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  live_id    VARCHAR(64)  NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_live (user_id, live_id),
  INDEX idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS products (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  seller_id     INT          NOT NULL,
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  price         INT          NOT NULL,
  category      VARCHAR(30),
  image_url     VARCHAR(500),
  features      VARCHAR(255),
  attributes    VARCHAR(255),
  status        ENUM('active','sold','hidden') NOT NULL DEFAULT 'active',
  created_at    DATETIME DEFAULT NOW(),
  FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS product_images (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT          NOT NULL,
  url        VARCHAR(500) NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lives (
  id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  seller_id  INT          NOT NULL,
  title      VARCHAR(200) NOT NULL,
  status     ENUM('scheduled','live','ended') NOT NULL DEFAULT 'scheduled',
  created_at DATETIME DEFAULT NOW(),
  ended_at   DATETIME NULL,
  FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chat_rooms (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  created_by INT          NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chat_room_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  room_id    INT          NOT NULL,
  user_id    INT          NOT NULL,
  message    TEXT         NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id  INT NOT NULL,
  following_id INT NOT NULL,
  created_at   DATETIME DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY (follower_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  sender_id   INT  NOT NULL,
  receiver_id INT  NOT NULL,
  message     TEXT NOT NULL,
  created_at  DATETIME DEFAULT NOW(),
  FOREIGN KEY (sender_id)   REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS consignments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  seller_id   INT          NOT NULL,
  product_name VARCHAR(100) NOT NULL,
  description TEXT,
  quantity    INT          NOT NULL DEFAULT 1,
  price       INT          NOT NULL,
  category    VARCHAR(30),
  image_url   VARCHAR(500),
  status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at  DATETIME DEFAULT NOW(),
  FOREIGN KEY (seller_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS delivery_addresses (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  name       VARCHAR(60)  NOT NULL,
  phone      VARCHAR(20)  NOT NULL,
  zipcode    VARCHAR(10)  NOT NULL DEFAULT '',
  address    VARCHAR(255) NOT NULL,
  detail     VARCHAR(100) NULL,
  is_default TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
