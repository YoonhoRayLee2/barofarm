import pool from '../db/mysql';

// ── 구매자 등급 ──────────────────────────────────────────────
export const BUYER_TIER_CONFIG = {
  sprout: { label: '새싹', emoji: '🌱', minSpend: 0,        buyerDiscountRate: 0.000 },
  farmer: { label: '농부', emoji: '🌿', minSpend: 100000,   buyerDiscountRate: 0.005 },
  elite:  { label: '명예농부', emoji: '🌾', minSpend: 500000,  buyerDiscountRate: 0.010 },
  master: { label: '마스터', emoji: '🏆', minSpend: 2000000, buyerDiscountRate: 0.015 },
} as const;

// ── 판매자 등급 ──────────────────────────────────────────────
export const SELLER_TIER_CONFIG = {
  sprout: { label: '새싹', emoji: '🌱', minSpend: 0,        sellerFeeRate: 0.049 },
  farmer: { label: '농부', emoji: '🌿', minSpend: 500000,   sellerFeeRate: 0.039 },
  elite:  { label: '명예농부', emoji: '🌾', minSpend: 2000000, sellerFeeRate: 0.030 },
  master: { label: '마스터', emoji: '🏆', minSpend: 5000000, sellerFeeRate: 0.020 },
} as const;

export type BuyerTierKey  = keyof typeof BUYER_TIER_CONFIG;
export type SellerTierKey = keyof typeof SELLER_TIER_CONFIG;

const BUYER_TIER_ORDER:  BuyerTierKey[]  = ['sprout', 'farmer', 'elite', 'master'];
const SELLER_TIER_ORDER: SellerTierKey[] = ['sprout', 'farmer', 'elite', 'master'];

export { BUYER_TIER_ORDER, SELLER_TIER_ORDER };

// 구매자 등급 조회 (최근 3개월 구매 합산)
export async function getBuyerTier(buyerId: number): Promise<BuyerTierKey> {
  const [rows]: any = await pool.execute(
    `SELECT COALESCE(SUM(current_price), 0) AS total_spend
     FROM auctions
     WHERE top_bidder_id = ? AND status = 'ended'
       AND ends_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)`,
    [buyerId],
  );
  const spend = Number(rows[0]?.total_spend ?? 0);
  if (spend >= 2000000) return 'master';
  if (spend >= 500000)  return 'elite';
  if (spend >= 100000)  return 'farmer';
  return 'sprout';
}

// 판매자 등급 조회 (최근 3개월 판매 합산)
export async function getSellerTier(sellerId: number): Promise<SellerTierKey> {
  const [rows]: any = await pool.execute(
    `SELECT COALESCE(SUM(current_price), 0) AS total_sales
     FROM auctions
     WHERE seller_id = ? AND status = 'ended'
       AND ends_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)`,
    [sellerId],
  );
  const sales = Number(rows[0]?.total_sales ?? 0);
  if (sales >= 5000000) return 'master';
  if (sales >= 2000000) return 'elite';
  if (sales >= 500000)  return 'farmer';
  return 'sprout';
}

// 구매자 할인 계산
export function calcBuyerDiscount(price: number, buyerTier: BuyerTierKey) {
  const cfg = BUYER_TIER_CONFIG[buyerTier];
  const discountAmt = Math.round(price * cfg.buyerDiscountRate);
  return { discountAmt, buyerDiscountRate: cfg.buyerDiscountRate };
}

// 판매자 수수료 계산
export function calcSellerFee(price: number, sellerTier: SellerTierKey) {
  const cfg = SELLER_TIER_CONFIG[sellerTier];
  const feeAmt = Math.round(price * cfg.sellerFeeRate);
  return { feeAmt, sellerFeeRate: cfg.sellerFeeRate };
}
