-- 결제수단 관리
-- type: 'card'(일반결제 key-in), 'easy'(간편결제), 'barofarm_pay'(바로팜페이)
CREATE TABLE IF NOT EXISTS payment_methods (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  type         ENUM('card','easy','barofarm_pay') NOT NULL,
  label        VARCHAR(60)  NOT NULL DEFAULT '',   -- 표시용 별칭 (예: "신한카드", "카카오페이")
  -- 카드(key-in): 카드번호 마스킹/만료월/소유주
  card_brand   VARCHAR(30)  NULL,                  -- 카드사 (신한, 국민 등)
  card_last4   VARCHAR(4)   NULL,                  -- 카드번호 끝 4자리
  card_expiry  VARCHAR(5)   NULL,                  -- MM/YY
  card_holder  VARCHAR(40)  NULL,                  -- 소유주명
  -- 간편결제: 제공사
  easy_provider VARCHAR(30) NULL,                  -- 카카오페이/네이버페이/토스 등
  is_default   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
