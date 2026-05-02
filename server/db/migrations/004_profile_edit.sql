-- 004: profile edit columns
ALTER TABLE users
  ADD COLUMN avatar_url           VARCHAR(500) NULL,
  ADD COLUMN nickname_changed_at  DATETIME     NULL,
  ADD COLUMN delivery_name        VARCHAR(60)  NULL,
  ADD COLUMN delivery_phone       VARCHAR(20)  NULL,
  ADD COLUMN delivery_address     VARCHAR(255) NULL,
  ADD COLUMN delivery_detail      VARCHAR(100) NULL,
  ADD COLUMN delivery_zipcode     VARCHAR(10)  NULL;
