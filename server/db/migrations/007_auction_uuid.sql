-- auctions.id: INT AUTO_INCREMENT → VARCHAR(64)
-- bids.auction_id, chats.auction_id: INT → VARCHAR(64)
-- auctions에 mode 컬럼 추가

SET FOREIGN_KEY_CHECKS = 0;

-- auctions.id 타입 변경
-- AUTO_INCREMENT를 먼저 제거해야 DROP PRIMARY KEY 가능
ALTER TABLE auctions MODIFY id INT NOT NULL;
ALTER TABLE auctions DROP PRIMARY KEY;
ALTER TABLE auctions MODIFY id VARCHAR(64) NOT NULL;
ALTER TABLE auctions ADD PRIMARY KEY (id);

-- mode 컬럼 추가 (없으면)
ALTER TABLE auctions ADD COLUMN mode ENUM('normal','fcfs','blind') NOT NULL DEFAULT 'normal' AFTER current_price;

-- bids, chats auction_id 변경
ALTER TABLE bids  MODIFY auction_id VARCHAR(64) NOT NULL;
ALTER TABLE chats MODIFY auction_id VARCHAR(64) NOT NULL;

SET FOREIGN_KEY_CHECKS = 1;
