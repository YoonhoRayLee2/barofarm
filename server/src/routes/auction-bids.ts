// REST 인증형 경매 입찰 API (Phase 5, 스펙 §22) — 기존 socket/auction.ts(라이브 경매, 메모리 상태)와는
// 완전히 별도의 흐름이다. auctions.bidding_channel = 'REST' 인 경매만 대상으로 하며,
// bidding_channel = 'SOCKET'(기본값, 기존 라이브 경매)은 이 라우터가 절대 건드리지 않는다.
//
// 인증 2단계(§5.2/§5.4):
//   1) 입장 인증(auction_access_sessions, requireAuctionAccess) — 경매당/그룹당 1회, 이후 자유 입찰.
//   2) 고액 입찰 재인증(payment_auth_sessions, purpose=HIGH_VALUE_BID) — 금액이 기준 초과할 때만 추가로 요구.
// 전체 입찰에 requirePaymentAuth 미들웨어를 무조건 부착하면 저액 입찰까지 매번 결제비밀번호 재확인을
// 요구하게 되어 "입장 시 1회 인증 후 자유 입찰" 설계와 어긋나므로, 고액 여부를 먼저 계산한 뒤 조건부로만
// 인증세션을 검사한다(middleware/payment-auth.ts의 requirePaymentAuth는 무조건 세션을 요구하는 구조라 재사용 불가).

import { Router, Request, Response } from 'express';
import pool from '../db/mysql';
import { requireAuth } from '../middleware/auth';
import { requireAuctionAccess } from '../middleware/payment-auth';
import {
  getAuctionAccessInfo,
  assertCanParticipate,
  requiresHighValueBidReauth,
  AuctionAccessError,
} from '../services/auction-access';
import {
  getSessionTokenFromRequest,
  validateSessionToken,
  PaymentAuthSessionErrorCode,
} from '../services/payment-auth-session';
import { paymentPolicy } from '../config/payment-policy';

const router = Router();

export enum AuctionBidErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  AUCTION_NOT_FOUND = 'AUCTION_NOT_FOUND',
  AUCTION_WRONG_CHANNEL = 'AUCTION_WRONG_CHANNEL',
  AUCTION_NOT_LIVE = 'AUCTION_NOT_LIVE',
  BID_TOO_LOW = 'BID_TOO_LOW',
  DUPLICATE_BID_KEY = 'DUPLICATE_BID_KEY',
  FORBIDDEN = 'FORBIDDEN',
}

export class AuctionBidError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface BidRow {
  id: number;
  auction_id: string;
  bidder_id: number;
  price: number;
  idempotency_key: string | null;
  status: string | null;
  created_at: Date;
}

function formatBid(row: BidRow) {
  return {
    id: row.id,
    auctionId: row.auction_id,
    bidderId: row.bidder_id,
    amount: Number(row.price),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function getDeviceId(req: Request): string | null {
  const header = req.headers['x-device-id'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const body = (req.body as { deviceId?: string })?.deviceId;
  return body ? String(body).trim() : null;
}

/** 고액 입찰 재인증(§5.4) — HIGH_VALUE_BID 목적의 신선한 결제인증세션(쿠키)이 없으면 거절. */
async function assertHighValueBidAuth(req: Request, userId: number): Promise<void> {
  const token = getSessionTokenFromRequest(req);
  if (!token) {
    throw new AuctionBidError(PaymentAuthSessionErrorCode.EXPIRED, 401, '고액 입찰을 위해 재인증이 필요합니다');
  }
  const result = await validateSessionToken(token, { deviceId: getDeviceId(req) });
  if (!result.valid || result.session.userId !== userId) {
    throw new AuctionBidError(PaymentAuthSessionErrorCode.EXPIRED, 401, '고액 입찰 인증세션이 유효하지 않습니다');
  }
  if (result.session.purpose !== 'HIGH_VALUE_BID') {
    throw new AuctionBidError(PaymentAuthSessionErrorCode.HIGH_VALUE_REAUTH_REQUIRED, 403, '고액 입찰은 재인증이 필요합니다');
  }
}

/**
 * 입찰 처리(§5.3, §17, §18) — 단일 DB 트랜잭션 안에서:
 *  1) auctions 행을 FOR UPDATE로 잠그고 채널/진행상태/서버시간 종료판정/최소입찰단위를 검증
 *  2) 조건부 UPDATE(WHERE current_price < ?)로 현재가를 원자적으로 갱신 (동시입찰/종료직전입찰 방지)
 *  3) 이전 최고입찰(WINNING)을 OUTBID로 내리고, 신규 입찰을 WINNING으로 삽입
 * idempotencyKey는 UNIQUE 제약이 최종 방어선이며, 그 전에 조회로 먼저 재요청을 감지해 반환한다(호출부 책임).
 */
async function placeBid(params: {
  auctionId: string;
  userId: number;
  amount: number;
  idempotencyKey: string;
}): Promise<BidRow> {
  const { auctionId, userId, amount, idempotencyKey } = params;
  const conn = await pool.getConnection();
  let insertId: number | null = null;
  let committed = false;
  try {
    await conn.beginTransaction();

    // ends_at 만료 여부는 DB 서버의 NOW()로 SQL 쪽에서 직접 계산한다 — DATETIME 값을 JS Date로 끌어와
    // Node 프로세스의 로컬 타임존으로 재해석하면(mysql2 드라이버가 naive DATETIME을 로컬존 기준으로 파싱)
    // 앱 서버와 DB 서버의 시스템 타임존이 다를 때 종료판정이 틀어질 수 있다 — 반드시 DB 서버시간 기준으로만 판정한다.
    const [rows] = await conn.query<any[]>(
      `SELECT id, seller_id, status, bidding_channel, current_price, minimum_bid_increment,
              (ends_at IS NOT NULL AND ends_at <= NOW()) AS is_expired
         FROM auctions WHERE id = ? FOR UPDATE`,
      [auctionId],
    );
    const auction = rows[0];
    if (!auction) {
      throw new AuctionBidError(AuctionBidErrorCode.AUCTION_NOT_FOUND, 404, 'auction not found');
    }
    if (auction.bidding_channel !== 'REST') {
      throw new AuctionBidError(
        AuctionBidErrorCode.AUCTION_WRONG_CHANNEL,
        400,
        'REST 입찰 대상 경매가 아닙니다(기존 라이브 경매는 socket bid 이벤트를 사용하세요)',
      );
    }
    if (String(auction.seller_id) === String(userId)) {
      throw new AuctionBidError(AuctionBidErrorCode.FORBIDDEN, 403, '판매자 본인은 입찰할 수 없습니다');
    }
    // 서버시간 기준 종료판정(§18) — status 컬럼이 아직 'live'라도 ends_at을 지났으면(DB 서버 NOW() 기준) 거절한다.
    if (auction.status !== 'live' || Number(auction.is_expired) === 1) {
      throw new AuctionBidError(AuctionBidErrorCode.AUCTION_NOT_LIVE, 409, '진행 중인 경매가 아닙니다');
    }

    const currentPrice = Number(auction.current_price);
    const minIncrement = auction.minimum_bid_increment != null
      ? Number(auction.minimum_bid_increment)
      : paymentPolicy.bid.defaultMinimumIncrement;
    const minValidAmount = currentPrice + minIncrement;
    if (amount < minValidAmount) {
      throw new AuctionBidError(
        AuctionBidErrorCode.BID_TOO_LOW,
        400,
        `최소 입찰가는 ${minValidAmount.toLocaleString()}원입니다`,
      );
    }

    // 원자적 현재가 갱신 — FOR UPDATE 락(위)에 더해 WHERE 조건으로 이중 방어(§18).
    const [updateResult] = await conn.query<any>(
      `UPDATE auctions
         SET current_price = ?, top_bidder_id = ?
       WHERE id = ? AND bidding_channel = 'REST' AND status = 'live' AND ends_at > NOW() AND current_price < ?`,
      [amount, userId, auctionId, amount],
    );
    if (updateResult.affectedRows === 0) {
      throw new AuctionBidError(
        AuctionBidErrorCode.BID_TOO_LOW,
        409,
        '입찰 처리 중 현재가가 변경되었거나 경매가 종료되었습니다. 다시 시도해주세요',
      );
    }

    await conn.query(`UPDATE bids SET status = 'OUTBID' WHERE auction_id = ? AND status = 'WINNING'`, [auctionId]);

    try {
      const [insertResult] = await conn.query<any>(
        `INSERT INTO bids (auction_id, bidder_id, price, idempotency_key, status) VALUES (?, ?, ?, ?, 'WINNING')`,
        [auctionId, userId, amount, idempotencyKey],
      );
      insertId = insertResult.insertId;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        // 동시 재시도 경합 — 동일 idempotencyKey가 그 사이 다른 트랜잭션에 먼저 삽입된 경우
        throw new AuctionBidError(AuctionBidErrorCode.DUPLICATE_BID_KEY, 409, '이미 처리된 입찰 요청입니다');
      }
      throw err;
    }

    await conn.commit();
    committed = true;
  } catch (err) {
    if (!committed) {
      await conn.rollback().catch(() => {});
    }
    throw err;
  } finally {
    conn.release();
  }

  const [finalRows] = await pool.query<any[]>('SELECT * FROM bids WHERE id = ?', [insertId]);
  return finalRows[0];
}

function handleBidError(err: unknown, res: Response): void {
  if (err instanceof AuctionBidError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof AuctionAccessError) {
    res.status(403).json({ error: err.code, message: err.message });
    return;
  }
  console.error('[auction-bids]', err);
  res.status(500).json({ error: 'internal_error' });
}

// POST /api/auctions/:auctionId/bids — body: { amount, idempotencyKey }
router.post('/:auctionId/bids', requireAuth, requireAuctionAccess(), async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const auctionId = String(req.params.auctionId);
  const { amount, idempotencyKey } = req.body as { amount?: number; idempotencyKey?: string };

  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    res.status(400).json({ error: AuctionBidErrorCode.INVALID_REQUEST, message: 'idempotencyKey is required' });
    return;
  }
  const bidAmount = Math.trunc(Number(amount));
  if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
    res.status(400).json({ error: AuctionBidErrorCode.INVALID_REQUEST, message: 'amount must be a positive number' });
    return;
  }

  try {
    // 멱등(§17) — 동일 키로 이미 생성된 입찰이 있으면 재처리 없이 그대로 반환한다.
    const [dupRows] = await pool.query<any[]>('SELECT * FROM bids WHERE idempotency_key = ?', [idempotencyKey]);
    const dup: BidRow | undefined = dupRows[0];
    if (dup) {
      if (String(dup.auction_id) === auctionId && Number(dup.bidder_id) === userId) {
        res.status(200).json({ ok: true, replay: true, bid: formatBid(dup) });
        return;
      }
      res.status(409).json({ error: AuctionBidErrorCode.DUPLICATE_BID_KEY, message: '이미 다른 입찰에 사용된 idempotencyKey입니다' });
      return;
    }

    const auction = await getAuctionAccessInfo(auctionId);
    if (!auction) {
      res.status(404).json({ error: AuctionBidErrorCode.AUCTION_NOT_FOUND, message: 'auction not found' });
      return;
    }
    // 로그인/참여자격(계정정지·판매자본인·이미종료) 검증(§5.1) — /enter와 동일 서비스 재사용
    await assertCanParticipate(userId, auction);

    if (requiresHighValueBidReauth(auction, bidAmount)) {
      await assertHighValueBidAuth(req, userId);
    }

    const bid = await placeBid({ auctionId, userId, amount: bidAmount, idempotencyKey });
    res.status(201).json({ ok: true, replay: false, bid: formatBid(bid) });
  } catch (err) {
    handleBidError(err, res);
  }
});

// GET /api/auctions/:auctionId/bids — 입장 인증된 참여자만 전체 입찰 내역 조회
router.get('/:auctionId/bids', requireAuth, requireAuctionAccess(), async (req: Request, res: Response) => {
  const auctionId = String(req.params.auctionId);
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM bids WHERE auction_id = ? AND idempotency_key IS NOT NULL ORDER BY price DESC, id ASC`,
      [auctionId],
    );
    res.json({ items: (rows as BidRow[]).map(formatBid) });
  } catch (err) {
    console.error('[auction-bids] GET /:auctionId/bids', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/auctions/:auctionId/my-bids — 본인 입찰 내역(입장세션 만료 후에도 조회 가능해야 하므로 requireAuctionAccess 미부착)
router.get('/:auctionId/my-bids', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const auctionId = String(req.params.auctionId);
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM bids WHERE auction_id = ? AND bidder_id = ? AND idempotency_key IS NOT NULL ORDER BY id DESC`,
      [auctionId, userId],
    );
    res.json({ items: (rows as BidRow[]).map(formatBid) });
  } catch (err) {
    console.error('[auction-bids] GET /:auctionId/my-bids', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
