"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRoom = deleteRoom;
exports.endAuction = endAuction;
const livekit_server_sdk_1 = require("livekit-server-sdk");
const mysql_1 = __importDefault(require("../db/mysql"));
const tier_1 = require("./tier");
let _client = null;
function getClient() {
    if (_client)
        return _client;
    const { LIVEKIT_URL, LIVEKIT_KEY, LIVEKIT_SECRET } = process.env;
    if (!LIVEKIT_URL || !LIVEKIT_KEY || !LIVEKIT_SECRET) {
        throw new Error('LiveKit 환경 변수 미설정');
    }
    _client = new livekit_server_sdk_1.RoomServiceClient(LIVEKIT_URL, LIVEKIT_KEY, LIVEKIT_SECRET);
    return _client;
}
async function deleteRoom(roomName) {
    try {
        await getClient().deleteRoom(roomName);
    }
    catch (err) {
        // 룸이 이미 없거나 LiveKit 연결 실패 시 경고만 — 경매 종료 흐름은 차단하지 않음
        console.warn(`[livekit] deleteRoom(${roomName}) failed:`, err.message);
    }
}
async function endAuction(state) {
    try {
        // 유찰(top_bidder_id IS NULL)은 낙찰가 무효 — 시작가가 그대로 저장되지 않도록 0 으로 기록.
        const isVoid = !state.topBidder;
        const finalPrice = isVoid ? 0 : state.currentPrice;
        let buyerTier = 'sprout';
        let discountAmt = 0;
        let feeAmt = 0;
        let buyerDiscountRate = 0;
        let sellerFeeRate = 0.049;
        if (!isVoid && state.topBidder) {
            const [bTier, sTier] = await Promise.all([
                (0, tier_1.getBuyerTier)(Number(state.topBidder)),
                (0, tier_1.getSellerTier)(Number(state.sellerId)),
            ]);
            const discount = (0, tier_1.calcBuyerDiscount)(finalPrice, bTier);
            const fee = (0, tier_1.calcSellerFee)(finalPrice, sTier);
            buyerTier = bTier;
            discountAmt = discount.discountAmt;
            buyerDiscountRate = discount.buyerDiscountRate;
            feeAmt = fee.feeAmt;
            sellerFeeRate = fee.sellerFeeRate;
        }
        await mysql_1.default.query(`INSERT INTO auctions
         (id, seller_id, live_id, product_name, start_price, current_price, mode, image_url, status, delivery_status, top_bidder_id, ends_at,
          buyer_tier, buyer_discount_rate, buyer_discount_amt, seller_fee_rate, seller_fee_amt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ended', 'payment_complete', ?, NOW(), ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         current_price      = VALUES(current_price),
         top_bidder_id      = VALUES(top_bidder_id),
         status             = 'ended',
         delivery_status    = 'payment_complete',
         image_url          = VALUES(image_url),
         ends_at            = NOW(),
         buyer_tier         = VALUES(buyer_tier),
         buyer_discount_rate = VALUES(buyer_discount_rate),
         buyer_discount_amt  = VALUES(buyer_discount_amt),
         seller_fee_rate    = VALUES(seller_fee_rate),
         seller_fee_amt     = VALUES(seller_fee_amt)`, [
            state.id,
            Number(state.sellerId),
            state.liveId,
            state.productName,
            state.startPrice,
            finalPrice,
            state.mode,
            state.imageUrl ?? null,
            state.topBidder ?? null,
            buyerTier, buyerDiscountRate, discountAmt, sellerFeeRate, feeAmt,
        ]);
        // 낙찰자가 있으면 bids 테이블에도 기록
        if (state.topBidder) {
            await mysql_1.default.query('INSERT IGNORE INTO bids (auction_id, bidder_id, price) VALUES (?, ?, ?)', [state.id, Number(state.topBidder), state.currentPrice]);
        }
    }
    catch (e) {
        console.error('[auction] end DB save failed:', e.message);
    }
    await deleteRoom(state.id);
}
