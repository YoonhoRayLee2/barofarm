UPDATE auctions
SET shipping_fee_status = 'paid'
WHERE shipping_fee_status = 'pending';
