-- 판매자 기본 배송비 설정
ALTER TABLE users
  ADD COLUMN seller_shipping_fee INT NOT NULL DEFAULT 3000;

-- 경매별 배송비 (합배송 처리 시 기록)
ALTER TABLE auctions
  ADD COLUMN shipping_fee INT NOT NULL DEFAULT 0;

-- delivery_status enum에 두 단계 추가 (payment_complete 유지)
ALTER TABLE auctions
  MODIFY COLUMN delivery_status ENUM(
    'payment_complete',
    'shipping_fee_pending',
    'shipping_fee_paid',
    'shipped',
    'purchase_confirmed',
    'settlement_complete'
  ) NOT NULL DEFAULT 'payment_complete';
