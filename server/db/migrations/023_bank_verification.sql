ALTER TABLE users
  ADD COLUMN bank_name        VARCHAR(50)  NULL,
  ADD COLUMN bank_account     VARCHAR(30)  NULL,
  ADD COLUMN bank_holder      VARCHAR(50)  NULL,
  ADD COLUMN bank_verified_at DATETIME     NULL,
  ADD COLUMN is_nh_member     TINYINT(1)   NOT NULL DEFAULT 0;
