import { RoomServiceClient } from 'livekit-server-sdk';
import db from '../db/mysql';
import { AuctionState } from '../store/memory';

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
    await db.query(
      'UPDATE auctions SET current_price = ?, top_bidder_id = ?, status = "ended", image_url = ?, ends_at = NOW() WHERE id = ?',
      [finalPrice, state.topBidder ?? null, state.imageUrl ?? null, state.id],
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
