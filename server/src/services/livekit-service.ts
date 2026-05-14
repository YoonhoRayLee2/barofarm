import { RoomServiceClient } from 'livekit-server-sdk';
import db from '../db/mysql';
import { AuctionState } from '../store/memory';
import { getBuyerTier, getSellerTier, calcBuyerDiscount, calcSellerFee } from './tier';

let _client: RoomServiceClient | null = null;

function getClient(): RoomServiceClient {
  if (_client) return _client;
  const { LIVEKIT_URL, LIVEKIT_KEY, LIVEKIT_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_KEY || !LIVEKIT_SECRET) {
    throw new Error('LiveKit 환경 변수 미설정');
  }
  _client = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_KEY, LIVEKIT_SECRET);
  return _client;
}

export async function deleteRoom(roomName: string): Promise<void> {
  try {
    await getClient().deleteRoom(roomName);
  } catch (err) {
    // 룸이 이미 없거나 LiveKit 연결 실패 시 경고만 — 경매 종료 흐름은 차단하지 않음
    console.warn(`[livekit] deleteRoom(${roomName}) failed:`, (err as Error).message);
  }
}

export async function endAuction(state: AuctionState): Promise<void> {
  try {
    // 유찰(top_bidder_id IS NULL)은 낙찰가 무효 — 시작가가 그대로 저장되지 않도록 0 으로 기록.
    const isVoid = !state.topBidder;
    const finalPrice = isVoid ? 0 : state.currentPrice;

    let buyerTier: string = 'sprout';
    let discountAmt = 0;
    let feeAmt = 0;
    let buyerDiscountRate = 0;
    let sellerFeeRate = 0.049;
    if (!isVoid && state.topBidder) {
      const [bTier, sTier] = await Promise.all([
        getBuyerTier(Number(state.topBidder)),
        getSellerTier(Number(state.sellerId)),
      ]);
      const discount = calcBuyerDiscount(finalPrice, bTier);
      const fee      = calcSellerFee(finalPrice, sTier);
      buyerTier         = bTier;
      discountAmt       = discount.discountAmt;
      buyerDiscountRate = discount.buyerDiscountRate;
      feeAmt            = fee.feeAmt;
      sellerFeeRate     = fee.sellerFeeRate;
    }

    await db.query(
      `INSERT INTO auctions
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
         seller_fee_amt     = VALUES(seller_fee_amt)`,
      [
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
      ],
    );
    // 낙찰자가 있으면 bids 테이블에도 기록
    if (state.topBidder) {
      await db.query(
        'INSERT IGNORE INTO bids (auction_id, bidder_id, price) VALUES (?, ?, ?)',
        [state.id, Number(state.topBidder), state.currentPrice],
      );
    }
  } catch (e) {
    console.error('[auction] end DB save failed:', (e as Error).message);
  }
  await deleteRoom(state.id);
}
