ALTER TABLE auctions
  ADD COLUMN delivery_status
    ENUM('payment_complete','shipped','purchase_confirmed','settlement_complete')
    NOT NULL DEFAULT 'payment_complete';
