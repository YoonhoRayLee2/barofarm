CREATE DATABASE IF NOT EXISTS barofarm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE barofarm;

CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(50)  NOT NULL,
  role       ENUM('seller','buyer') NOT NULL,
  phone      VARCHAR(20),
  created_at DATETIME DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auctions (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  seller_id      INT NOT NULL,
  product_name   VARCHAR(100) NOT NULL,
  start_price    INT NOT NULL,
  current_price  INT NOT NULL,
  top_bidder_id  INT,
  status         ENUM('pending','live','ended') DEFAULT 'pending',
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
