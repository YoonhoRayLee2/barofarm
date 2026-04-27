-- Barofarm Seed Data
-- Idempotent seed: 중복 실행해도 안전
USE barofarm;

-- 1) seller 유저 1명: phone='01000000000' 이미 있으면 삽입 안 함
INSERT INTO users (name, phone, role)
SELECT '바로팜농장', '01000000000', 'seller'
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE phone = '01000000000'
);

-- 2) 샘플 경매 1개: status='live'인 경매가 이미 있으면 삽입 안 함
INSERT INTO auctions (seller_id, product_name, start_price, current_price, status)
SELECT u.id, '제주 감귤 10kg', 15000, 15000, 'live'
FROM users u
WHERE u.phone = '01000000000'
  AND NOT EXISTS (
    SELECT 1 FROM auctions WHERE status = 'live'
  )
LIMIT 1;
