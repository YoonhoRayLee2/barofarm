// REST 인증형 경매(§22) 정산 — auctions.bidding_channel = 'REST' 인 경매만 대상으로 한다.
//
// 기존 소켓 라이브 경매(store/memory.ts, socket/auction.ts, services/livekit-service.ts endAuction)는
// 메모리 타이머(setInterval, store/memory.ts startTimer)가 종료를 판단하고 그 시점에 DB에 낙찰 결과를
// 1회 기록한다. REST 채널 경매는 메모리 상태가 없고 auctions.status/ends_at이 유일한 진실 공급원이므로,
// 별도의 폴링 스케줄러(startAuctionSettlementScheduler)가 주기적으로 "ends_at을 지난 live 경매"를 찾아
// settleAuction()으로 종료 처리한다. 두 흐름은 bidding_channel 값으로 완전히 분리되어 서로 간섭하지 않는다.
//
// 상태 매핑(§14.3/§14.4): auctions.status는 기존 그대로 pending/live/ended 를 사용한다(신규 값 추가 없음).
// REST 채널에서는 status='live' 가 곧 "진행 중"이며(소켓 채널은 메모리가 authoritative라 DB status가 계속
// 'pending'으로 남아있을 수 있음 — livekit-service.ts endAuction 참고), status='ended' 전이는 이 파일의
// settleAuction()을 통해서만 이루어진다(임의 UPDATE 금지).
// bids.status는 058 마이그레이션에서 추가한 CREATED/VALID/OUTBID/WINNING/WON/LOST/CANCELED/INVALID 중
// 이 파일에서는 WINNING(현재 최고가) → WON(낙찰) / OUTBID·CREATED·VALID(낙찰 실패) → LOST 로만 전이시킨다.

import pool from '../db/mysql';
import { createOrder, transitionOrder, OrderError, OrderErrorCode } from './order';
import { createNotification } from './notifications';
import { getBuyerTier, getSellerTier, calcBuyerDiscount, calcSellerFee } from './tier';

export interface SettlementResult {
  auctionId: string;
  /** 이번 호출에서 실제로 status='live'→'ended' 전이를 수행했는지 여부(이미 처리된 경우 false, 그래도 주문 존재는 보장한다) */
  settled: boolean;
  winnerId: number | null;
  orderId: number | null;
}

/** 낙찰자에게 createOrder(Phase 4)로 주문을 생성한다. 이미 생성돼 있으면(재시도/경쟁) 기존 주문을 그대로 반환한다. */
async function createSettlementOrder(auctionId: string, winnerId: number): Promise<number | null> {
  try {
    const order = await createOrder(winnerId, { auctionId });
    try {
      await createNotification(winnerId, {
        type: 'auction_won',
        title: '경매에 낙찰되었어요',
        body: `낙찰 결제를 완료해주세요. 결제기한: ${order.paymentDueAt ?? ''}`,
        link: `/app/order-detail/${auctionId}`,
      });
    } catch (notifErr) {
      console.error('[auction-settlement] 낙찰 알림 발송 실패:', (notifErr as Error).message);
    }
    return order.id;
  } catch (err) {
    if (err instanceof OrderError && err.code === OrderErrorCode.DUPLICATE_ORDER) {
      const [rows] = await pool.query<any[]>(
        `SELECT id FROM orders WHERE auction_id = ? AND status NOT IN ('CANCELED','PAYMENT_EXPIRED') LIMIT 1`,
        [auctionId],
      );
      return rows[0]?.id ?? null;
    }
    console.error(`[auction-settlement] createOrder 실패 (auction=${auctionId}, winner=${winnerId}):`, (err as Error).message);
    return null;
  }
}

/**
 * 단일 REST 경매 정산 — 멱등(여러 번 호출해도 안전, 재시도/경쟁 스케줄러 대비).
 * bidding_channel != 'REST' 이거나 경매가 없으면 아무 것도 하지 않는다(소켓 경매는 절대 건드리지 않음).
 */
export async function settleAuction(auctionId: string): Promise<SettlementResult> {
  const conn = await pool.getConnection();
  let winnerId: number | null = null;
  let didTransition = false;
  let eligible = true;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<any[]>(
      `SELECT id, seller_id, status, bidding_channel, current_price, top_bidder_id
         FROM auctions WHERE id = ? FOR UPDATE`,
      [auctionId],
    );
    const auction = rows[0];
    if (!auction || auction.bidding_channel !== 'REST') {
      eligible = false;
    } else {
      winnerId = auction.top_bidder_id != null ? Number(auction.top_bidder_id) : null;

      if (auction.status === 'live') {
        if (winnerId === null) {
          // 유찰 — 낙찰자 없이 종료 처리(주문 생성 없음)
          await conn.query(`UPDATE auctions SET status = 'ended' WHERE id = ? AND status = 'live'`, [auctionId]);
        } else {
          const [buyerTier, sellerTier] = await Promise.all([
            getBuyerTier(winnerId),
            getSellerTier(Number(auction.seller_id)),
          ]);
          const finalPrice = Number(auction.current_price);
          const { discountAmt, buyerDiscountRate } = calcBuyerDiscount(finalPrice, buyerTier);
          const { feeAmt, sellerFeeRate } = calcSellerFee(finalPrice, sellerTier);

          await conn.query(
            `UPDATE auctions
               SET status = 'ended', buyer_tier = ?, buyer_discount_rate = ?, buyer_discount_amt = ?,
                   seller_fee_rate = ?, seller_fee_amt = ?
             WHERE id = ? AND status = 'live'`,
            [buyerTier, buyerDiscountRate, discountAmt, sellerFeeRate, feeAmt, auctionId],
          );
        }
        await conn.query(
          `UPDATE bids SET status = 'LOST' WHERE auction_id = ? AND status IN ('CREATED','VALID','OUTBID')`,
          [auctionId],
        );
        await conn.query(`UPDATE bids SET status = 'WON' WHERE auction_id = ? AND status = 'WINNING'`, [auctionId]);
        didTransition = true;
      }
      // status가 이미 'ended'(재시도/경쟁 tick)면 여기서는 아무 것도 바꾸지 않고, 아래에서 주문 존재만 보장한다.
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }

  if (!eligible) {
    return { auctionId, settled: false, winnerId: null, orderId: null };
  }

  const orderId = winnerId !== null ? await createSettlementOrder(auctionId, winnerId) : null;
  return { auctionId, settled: didTransition, winnerId, orderId };
}

/** ends_at을 지났지만 아직 status='live'인 REST 채널 경매를 찾아 순차 정산한다. */
export async function settleEndedAuctions(): Promise<void> {
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM auctions WHERE bidding_channel = 'REST' AND status = 'live' AND ends_at <= NOW()`,
  );
  for (const row of rows as Array<{ id: string }>) {
    try {
      await settleAuction(row.id);
    } catch (err) {
      console.error(`[auction-settlement] settleAuction 실패 (auction=${row.id}):`, (err as Error).message);
    }
  }
}

/**
 * 결제 기한 초과 처리(§12.2) — REST 경매 낙찰 주문 중 payment_due_at을 지나고도 PAYMENT_PENDING인 건을
 * PAYMENT_EXPIRED로 전이한다. 차순위 낙찰자 재정산/재경매는 정책 훅으로만 남기고(과설계 금지) 이번 Phase의
 * 기본 동작은 만료 처리까지만 수행한다.
 */
export async function expireOverdueAuctionOrders(): Promise<void> {
  // services/order.ts는 payment_due_at을 SQL NOW()가 아니라 JS Date 객체(new Date(Date.now() + ...))로
  // 써넣는다 — mysql2가 이 값을 앱 서버(Node 프로세스)의 로컬 타임존 기준으로 직렬화한다. 따라서 만료
  // 판정도 SQL NOW()(DB 서버 자체 시계, 타임존이 다를 수 있음)가 아니라 이 앱 서버의 Date.now()를 그대로
  // 파라미터로 바인딩해 비교해야 두 값이 같은 변환 규칙으로 왕복되어 일관된다(placeBid의 ends_at 판정과는
  // 반대 이유로 — 그 값은 SQL NOW()로 써넣힐 수 있어 SQL NOW()로 비교하는 것이 맞다).
  const [rows] = await pool.query<any[]>(
    `SELECT o.id FROM orders o
       JOIN auctions a ON a.id = o.auction_id
      WHERE o.status = 'PAYMENT_PENDING' AND o.payment_due_at IS NOT NULL AND o.payment_due_at <= ?
        AND a.bidding_channel = 'REST'`,
    [new Date()],
  );
  for (const row of rows as Array<{ id: number }>) {
    try {
      await transitionOrder(pool, row.id, ['PAYMENT_PENDING'], 'PAYMENT_EXPIRED');
      // 차순위 낙찰자 재정산/재경매 훅 지점 — 현재는 미구현(정책 미확정), 필요 시 여기에 추가한다.
    } catch (err) {
      console.error(`[auction-settlement] 결제기한 만료 처리 실패 (order=${row.id}):`, (err as Error).message);
    }
  }
}

let schedulerHandle: ReturnType<typeof setInterval> | null = null;

/** REST 경매 정산 + 결제기한 만료 처리 폴링 스케줄러. index.ts에서 서버 시작 시 1회 호출한다. */
export function startAuctionSettlementScheduler(intervalMs = 5000): void {
  if (schedulerHandle) return; // 중복 시작 방지
  schedulerHandle = setInterval(() => {
    settleEndedAuctions().catch((err) => console.error('[auction-settlement] settleEndedAuctions tick 실패:', (err as Error).message));
    expireOverdueAuctionOrders().catch((err) => console.error('[auction-settlement] expireOverdueAuctionOrders tick 실패:', (err as Error).message));
  }, intervalMs);
}

export function stopAuctionSettlementScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}
