CREATE TABLE IF NOT EXISTS chat_rooms (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  description  VARCHAR(200),
  avatar_url   VARCHAR(500),
  created_by   INT NOT NULL,
  created_at   DATETIME DEFAULT NOW(),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chat_room_members (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  room_id      INT NOT NULL,
  user_id      INT NOT NULL,
  joined_at    DATETIME DEFAULT NOW(),
  last_read_at DATETIME DEFAULT NOW(),
  UNIQUE KEY   uniq_room_user (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  room_id    INT NOT NULL,
  user_id    INT NOT NULL,
  message    TEXT NOT NULL,
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
