import { RoomServiceClient } from 'livekit-server-sdk';
import db from '../db/mysql';
import { AuctionState } from '../store/memory';
import { getBuyerTier, getSellerTier, calcBuyerDiscount, calcSellerFee } from './tier';
import { createNotification } from './notifications';

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
    // FCFS(선착순)는 구매 시점마다 socket/auction.ts의 persistFcfsPurchase가 개별 주문(별도 UUID row)을
    // 이미 저장한다. 여기서 topBidder(마지막 구매자) 1명을 이 auction id row에 낙찰자로 다시 기록하면
    // 중복 주문(row)이 생기므로, FCFS는 placeholder row(생성 시 status='pending')를 topBidder 없이
    // 'ended'로만 마감한다 — 실제 판매 기록은 개별 row에만 남는다.
    const isFcfsWithSales = state.mode === 'fcfs' && !!state.topBidder;

    // 유찰(top_bidder_id IS NULL)은 낙찰가 무효 — 시작가가 그대로 저장되지 않도록 0 으로 기록.
    const isVoid = !state.topBidder || isFcfsWithSales;
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
      const payableTotal = finalPrice * (state.unitCount || 1);
      const discount = calcBuyerDiscount(payableTotal, bTier);
      const fee      = calcSellerFee(payableTotal, sTier);
      buyerTier         = bTier;
      discountAmt       = discount.discountAmt;
      buyerDiscountRate = discount.buyerDiscountRate;
      feeAmt            = fee.feeAmt;
      sellerFeeRate     = fee.sellerFeeRate;
    }

    await db.query(
      `INSERT INTO auctions
         (id, seller_id, live_id, product_name, start_price, current_price, mode, image_url, status, delivery_status, top_bidder_id, ends_at,
          buyer_tier, buyer_discount_rate, buyer_discount_amt, seller_fee_rate, seller_fee_amt, unit_count, unit_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ended', 'payment_complete', ?, NOW(), ?, ?, ?, ?, ?, ?, ?)
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
         seller_fee_amt     = VALUES(seller_fee_amt),
         unit_count         = VALUES(unit_count),
         unit_label         = VALUES(unit_label)`,
      [
        state.id,
        Number(state.sellerId),
        state.liveId,
        state.productName,
        state.startPrice,
        finalPrice,
        state.mode,
        state.imageUrl ?? null,
        isFcfsWithSales ? null : (state.topBidder ?? null),
        buyerTier, buyerDiscountRate, discountAmt, sellerFeeRate, feeAmt,
        state.unitCount, state.unitLabel,
      ],
    );
    // 낙찰자가 있으면 bids 테이블에도 기록 (FCFS는 개별 주문에서 이미 기록했으므로 제외)
    if (state.topBidder && !isFcfsWithSales) {
      await db.query(
        'INSERT IGNORE INTO bids (auction_id, bidder_id, price) VALUES (?, ?, ?)',
        [state.id, Number(state.topBidder), state.currentPrice],
      );
      try {
        await createNotification(Number(state.topBidder), {
          type: 'auction_won',
          title: '경매에 낙찰되었어요',
          body: `${state.productName} 상품이 ${state.currentPrice.toLocaleString()}원에 낙찰되었습니다.`,
          link: `/app/order-detail/${state.id}`,
        });
      } catch (notifErr) {
        console.error('[auction] won notification failed:', notifErr);
      }
    }
  } catch (e) {
    console.error('[auction] end DB save failed:', (e as Error).message);
    // DB 저장 실패는 상위(endAuctionState)로 전파 — 실패 시 메모리 상태를 보존해 재시도/수동 복구가 가능하도록 한다.
    // LiveKit room 정리는 DB 저장 여부와 무관하게 항상 시도한다.
    await deleteRoom(state.id);
    throw e;
  }
  await deleteRoom(state.id);
}
