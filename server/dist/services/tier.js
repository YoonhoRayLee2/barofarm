"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SELLER_TIER_ORDER = exports.BUYER_TIER_ORDER = exports.SELLER_TIER_CONFIG = exports.BUYER_TIER_CONFIG = void 0;
exports.getBuyerTier = getBuyerTier;
exports.getSellerTier = getSellerTier;
exports.calcBuyerDiscount = calcBuyerDiscount;
exports.calcSellerFee = calcSellerFee;
const mysql_1 = __importDefault(require("../db/mysql"));
// ── 구매자 등급 ──────────────────────────────────────────────
exports.BUYER_TIER_CONFIG = {
    sprout: { label: '새싹', emoji: '🌱', minSpend: 0, buyerDiscountRate: 0.000 },
    farmer: { label: '농부', emoji: '🌿', minSpend: 100000, buyerDiscountRate: 0.005 },
    elite: { label: '명예농부', emoji: '🌾', minSpend: 500000, buyerDiscountRate: 0.010 },
    master: { label: '마스터', emoji: '🏆', minSpend: 2000000, buyerDiscountRate: 0.015 },
};
// ── 판매자 등급 ──────────────────────────────────────────────
exports.SELLER_TIER_CONFIG = {
    sprout: { label: '새싹', emoji: '🌱', minSpend: 0, sellerFeeRate: 0.049 },
    farmer: { label: '농부', emoji: '🌿', minSpend: 500000, sellerFeeRate: 0.039 },
    elite: { label: '명예농부', emoji: '🌾', minSpend: 2000000, sellerFeeRate: 0.030 },
    master: { label: '마스터', emoji: '🏆', minSpend: 5000000, sellerFeeRate: 0.020 },
};
const BUYER_TIER_ORDER = ['sprout', 'farmer', 'elite', 'master'];
exports.BUYER_TIER_ORDER = BUYER_TIER_ORDER;
const SELLER_TIER_ORDER = ['sprout', 'farmer', 'elite', 'master'];
exports.SELLER_TIER_ORDER = SELLER_TIER_ORDER;
// 구매자 등급 조회 (최근 3개월 구매 합산)
async function getBuyerTier(buyerId) {
    const [rows] = await mysql_1.default.execute(`SELECT COALESCE(SUM(current_price), 0) AS total_spend
     FROM auctions
     WHERE top_bidder_id = ? AND status = 'ended'
       AND ends_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)`, [buyerId]);
    const spend = Number(rows[0]?.total_spend ?? 0);
    if (spend >= 2000000)
        return 'master';
    if (spend >= 500000)
        return 'elite';
    if (spend >= 100000)
        return 'farmer';
    return 'sprout';
}
// 판매자 등급 조회 (최근 3개월 판매 합산)
async function getSellerTier(sellerId) {
    const [rows] = await mysql_1.default.execute(`SELECT COALESCE(SUM(current_price), 0) AS total_sales
     FROM auctions
     WHERE seller_id = ? AND status = 'ended'
       AND ends_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)`, [sellerId]);
    const sales = Number(rows[0]?.total_sales ?? 0);
    if (sales >= 5000000)
        return 'master';
    if (sales >= 2000000)
        return 'elite';
    if (sales >= 500000)
        return 'farmer';
    return 'sprout';
}
// 구매자 할인 계산
function calcBuyerDiscount(price, buyerTier) {
    const cfg = exports.BUYER_TIER_CONFIG[buyerTier];
    const discountAmt = Math.round(price * cfg.buyerDiscountRate);
    return { discountAmt, buyerDiscountRate: cfg.buyerDiscountRate };
}
// 판매자 수수료 계산
function calcSellerFee(price, sellerTier) {
    const cfg = exports.SELLER_TIER_CONFIG[sellerTier];
    const feeAmt = Math.round(price * cfg.sellerFeeRate);
    return { feeAmt, sellerFeeRate: cfg.sellerFeeRate };
}
