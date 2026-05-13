ALTER TABLE users
  ADD COLUMN farm_zipcode VARCHAR(10)  NULL AFTER delivery_zipcode,
  ADD COLUMN farm_address VARCHAR(255) NULL AFTER farm_zipcode;
