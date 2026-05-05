ALTER TABLE auctions MODIFY COLUMN mode ENUM('normal', 'fcfs', 'blind', 'giveaway') NOT NULL DEFAULT 'normal';
