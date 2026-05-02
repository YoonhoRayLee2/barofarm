-- Migration: 001_auctions_image_url
-- 기존 auctions 테이블에 image_url 컬럼 추가
ALTER TABLE auctions
  ADD COLUMN image_url VARCHAR(500) NULL AFTER status;
