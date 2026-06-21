CREATE TABLE IF NOT EXISTS notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  type       VARCHAR(40) NOT NULL,
  title      VARCHAR(120) NOT NULL,
  body       VARCHAR(255) NULL,
  link       VARCHAR(255) NULL,
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_unread (user_id, is_read, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
