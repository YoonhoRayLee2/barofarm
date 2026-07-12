// 테스트 픽스처 팩토리 — 반드시 helpers/env를 먼저 import한 뒤(같은 파일 내 최상단) 이 모듈을
// import할 것. 각 테스트가 고유 식별자로 데이터를 만들고, cleanupTestData로 스스로 정리한다.

import './env';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../../src/db/mysql';
import { hashPassword } from '../../src/services/auth';
import { signToken } from '../../src/services/jwt';

export function uniqueSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface TestUser {
  id: number;
  username: string;
}

export interface CreateUserOpts {
  role?: 'buyer' | 'seller';
  isAdmin?: boolean;
  isDeveloper?: boolean;
}

/** users 테이블에 고유 username/phone/nickname으로 테스트 유저를 만든다. */
export async function createUser(opts: CreateUserOpts = {}): Promise<TestUser> {
  const suffix = uniqueSuffix();
  const username = `t_${suffix}`.slice(0, 30);
  const phone = `010${suffix.replace(/\D/g, '')}`.slice(0, 20);
  const passwordHash = await hashPassword('Test1234!');
  const [result] = await pool.query<any>(
    `INSERT INTO users (username, password_hash, nickname, role, phone, is_admin, is_developer)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [username, passwordHash, `nick_${suffix}`.slice(0, 60), opts.role ?? 'buyer', phone, opts.isAdmin ? 1 : 0, opts.isDeveloper ? 1 : 0],
  );
  return { id: result.insertId, username };
}

/**
 * requireAuth(middleware/auth.ts)의 LOGIN_WHITELIST 게이트를 통과하는 일반 로그인 토큰.
 * requireAuth는 payload.username만 화이트리스트와 비교하고 DB를 조회하지 않으므로,
 * 실제 테스트 유저의 DB username과 무관하게 화이트리스트에 있는 문자열을 그대로 써도 된다
 * (userId만 실제 유저와 일치시키면 이후 라우트/서비스 로직은 정상 동작한다).
 */
export function userToken(userId: number): string {
  return signToken({ userId, username: 'dydy' });
}

/** /admin/api/login이 발급하는 것과 동일한 형태의 admin JWT (middleware/admin-auth.ts 전용). */
export function adminToken(userId: number, isAdmin = true): string {
  return jwt.sign({ userId, username: `admin_${userId}`, isAdmin }, process.env.JWT_SECRET!, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

export interface CreateAuctionOpts {
  status?: 'pending' | 'live' | 'ended';
  biddingChannel?: 'SOCKET' | 'REST';
  currentPrice?: number;
  startPrice?: number;
  topBidderId?: number | null;
  endsAt?: Date | null;
  minimumBidIncrement?: number | null;
  authenticationMode?: 'PAYMENT_ONLY' | 'AUCTION_ENTRY' | 'ENTRY_AND_PAYMENT' | 'ALWAYS';
  highValueReauthAmount?: number | null;
  sellerFeeAmt?: number;
  buyerDiscountAmt?: number;
  shippingFee?: number;
}

/** auctions 테이블에 테스트용 경매를 만든다(id는 랜덤 UUID). */
export async function createAuction(sellerId: number, opts: CreateAuctionOpts = {}): Promise<string> {
  const id = crypto.randomUUID();
  const startPrice = opts.startPrice ?? 10_000;
  const currentPrice = opts.currentPrice ?? startPrice;
  await pool.query(
    `INSERT INTO auctions
       (id, seller_id, product_name, start_price, current_price, status, top_bidder_id, ends_at,
        bidding_channel, minimum_bid_increment, authentication_mode, high_value_reauth_amount,
        seller_fee_amt, buyer_discount_amt, shipping_fee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      sellerId,
      `테스트 상품 ${id.slice(0, 8)}`,
      startPrice,
      currentPrice,
      opts.status ?? 'live',
      opts.topBidderId ?? null,
      opts.endsAt ?? new Date(Date.now() + 10 * 60_000),
      opts.biddingChannel ?? 'REST',
      opts.minimumBidIncrement ?? null,
      opts.authenticationMode ?? 'PAYMENT_ONLY',
      opts.highValueReauthAmount ?? null,
      opts.sellerFeeAmt ?? 0,
      opts.buyerDiscountAmt ?? 0,
      opts.shippingFee ?? 0,
    ],
  );
  return id;
}

/**
 * 생성한 테스트 유저(및 그 유저가 관여한 경매/주문/결제/지갑 데이터)를 정리한다.
 * FK 제약(대부분 CASCADE 없음)을 고려해 자식 → 부모 순서로 삭제하며,
 * users 삭제 시 pay_wallets/wallet_transactions/user_payment_credentials/payment_auth_sessions/
 * auction_access_sessions는 ON DELETE CASCADE로 자동 정리된다.
 */
export async function cleanupTestData(userIds: number[]): Promise<void> {
  const ids = userIds.filter((id) => Number.isInteger(id));
  if (ids.length === 0) return;

  await pool.query(
    `DELETE pt FROM payment_transactions pt
       JOIN payments p ON p.id = pt.payment_id
       JOIN orders o ON o.id = p.order_id
      WHERE o.user_id IN (?)`,
    [ids],
  );
  await pool.query(
    `DELETE p FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.user_id IN (?)`,
    [ids],
  );
  await pool.query(`DELETE FROM orders WHERE user_id IN (?)`, [ids]);
  await pool.query(
    `DELETE FROM bids WHERE bidder_id IN (?) OR auction_id IN (
       SELECT id FROM (SELECT id FROM auctions WHERE seller_id IN (?) OR top_bidder_id IN (?)) AS a
     )`,
    [ids, ids, ids],
  );
  await pool.query(`DELETE FROM auctions WHERE seller_id IN (?) OR top_bidder_id IN (?)`, [ids, ids]);
  await pool.query(`DELETE FROM admin_wallet_adjustments WHERE user_id IN (?) OR administrator_id IN (?)`, [ids, ids]);
  await pool.query(`DELETE FROM admin_action_audit_log WHERE administrator_id IN (?)`, [ids]);
  await pool.query(`DELETE FROM users WHERE id IN (?)`, [ids]);
}
