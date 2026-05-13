ALTER TABLE users
  ADD COLUMN delivery_option  VARCHAR(20)  NOT NULL DEFAULT 'standard',
  ADD COLUMN hanaro_mart_name VARCHAR(100) NULL,
  ADD COLUMN hanaro_mart_addr VARCHAR(255) NULL;
