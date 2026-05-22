ALTER TABLE auctions
  ADD COLUMN shipping_fee_status ENUM('none','pending','paid') NOT NULL DEFAULT 'none';

ALTER TABLE auctions
  MODIFY COLUMN delivery_status ENUM(
    'payment_complete',
    'shipped',
    'purchase_confirmed',
    'settlement_complete'
  ) NOT NULL DEFAULT 'payment_complete';
