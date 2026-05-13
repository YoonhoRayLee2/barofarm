ALTER TABLE auctions
  ADD COLUMN buyer_tier         VARCHAR(10)     NOT NULL DEFAULT 'sprout' AFTER ends_at,
  ADD COLUMN buyer_discount_rate DECIMAL(5,4)   NOT NULL DEFAULT 0.0000   AFTER buyer_tier,
  ADD COLUMN buyer_discount_amt  INT            NOT NULL DEFAULT 0         AFTER buyer_discount_rate,
  ADD COLUMN seller_fee_rate    DECIMAL(5,4)    NOT NULL DEFAULT 0.0490   AFTER buyer_discount_amt,
  ADD COLUMN seller_fee_amt     INT             NOT NULL DEFAULT 0         AFTER seller_fee_rate;
