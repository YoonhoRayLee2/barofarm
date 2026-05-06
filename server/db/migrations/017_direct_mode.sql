ALTER TABLE auctions
  MODIFY COLUMN mode ENUM('normal','fcfs','blind','giveaway','direct') NOT NULL DEFAULT 'normal';
