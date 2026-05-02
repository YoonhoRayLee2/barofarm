CREATE TABLE IF NOT EXISTS lives (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  seller_id     INT          NOT NULL,
  seller_name   VARCHAR(100),
  title         VARCHAR(200) NOT NULL,
  thumbnail_url VARCHAR(500),
  category      VARCHAR(50),
  status        ENUM('upcoming','live','ended') NOT NULL DEFAULT 'upcoming',
  scheduled_at  BIGINT,
  created_at    BIGINT       NOT NULL,
  FOREIGN KEY (seller_id) REFERENCES users(id)
);
