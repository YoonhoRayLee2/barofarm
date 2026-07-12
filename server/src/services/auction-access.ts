// 경매 입장 인증(auction_access_sessions) 서비스 — auctions.authentication_mode가
// AUCTION_ENTRY 이상일 때, 판매자가 지정한 스코프(특정경매/판매자/그룹/전체) 단위로 입장 인증을 관리한다.

import pool from '../db/mysql';
import { paymentPolicy } from '../config/payment-policy';
import { resolveAuthRequirements, exceedsHighValueThreshold, AuctionAuthenticationMode } from './payment-auth-session';

export enum AuctionAccessErrorCode {
  ACCESS_REQUIRED = 'AUCTION_ACCESS_REQUIRED',
  SESSION_EXPIRED = 'AUCTION_ACCESS_SESSION_EXPIRED',
}

export class AuctionAccessError extends Error {
  code: AuctionAccessErrorCode;
  constructor(code: AuctionAccessErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type AccessScopeType = 'AUCTION' | 'SELLER' | 'GROUP' | 'GLOBAL';

export interface AuctionAccessInfo {
  id: string;
  status: string;
  sellerId: number;
  authenticationMode: AuctionAuthenticationMode;
  highValueReauthAmount: number | null;
  auctionGroupId: string | null;
}

/** 경매 조회 — auctions 테이블에서 인증 관련 컬럼만 최소 조회한다. */
export async function getAuctionAccessInfo(auctionId: string): Promise<AuctionAccessInfo | null> {
  const [rows] = await pool.query<any[]>(
    `SELECT id, status, seller_id, authentication_mode, high_value_reauth_amount, auction_group_id
       FROM auctions WHERE id = ?`,
    [auctionId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    sellerId: row.seller_id,
    authenticationMode: row.authentication_mode,
    highValueReauthAmount: row.high_value_reauth_amount,
    auctionGroupId: row.auction_group_id,
  };
}

/** 경매 참여가능 여부(§5.1) — 로그인은 라우트의 requireAuth가 담당, 여기선 계정상태/경매상태/판매자본인만 검사. */
export async function assertCanParticipate(userId: number, auction: AuctionAccessInfo): Promise<void> {
  if (auction.status === 'ended') {
    throw new AuctionAccessError(AuctionAccessErrorCode.ACCESS_REQUIRED, '이미 종료된 경매입니다');
  }
  if (String(auction.sellerId) === String(userId)) {
    throw new AuctionAccessError(AuctionAccessErrorCode.ACCESS_REQUIRED, '판매자 본인은 입장할 수 없습니다');
  }
  const [rows] = await pool.query<any[]>('SELECT status FROM users WHERE id = ?', [userId]);
  const user = rows[0];
  if (!user || user.status === 'suspended') {
    throw new AuctionAccessError(AuctionAccessErrorCode.ACCESS_REQUIRED, '정지된 계정은 입장할 수 없습니다');
  }
}

/** 기본 스코프 결정(§5.2) — 그룹에 속하면 GROUP, 아니면 AUCTION 단위. SELLER/GLOBAL은 향후 판매자 설정용으로 스키마만 준비. */
export function resolveDefaultScope(auction: AuctionAccessInfo): AccessScopeType {
  return auction.auctionGroupId ? 'GROUP' : 'AUCTION';
}

/** 스코프에 해당하는 유효(ACTIVE, 미만료) 입장세션 존재 여부 확인 */
export async function findActiveAccessSession(
  userId: number,
  auction: AuctionAccessInfo,
): Promise<{ id: number; expiresAt: Date; scopeType: AccessScopeType } | null> {
  const [rows] = await pool.query<any[]>(
    `SELECT id, expires_at, scope_type FROM auction_access_sessions
     WHERE user_id = ? AND status = 'ACTIVE' AND expires_at > NOW()
       AND (
         (scope_type = 'AUCTION' AND auction_id = ?) OR
         (scope_type = 'GROUP' AND auction_group_id IS NOT NULL AND auction_group_id = ?) OR
         (scope_type = 'SELLER' AND seller_id = ?) OR
         (scope_type = 'GLOBAL')
       )
     ORDER BY authenticated_at DESC LIMIT 1`,
    [userId, auction.id, auction.auctionGroupId, auction.sellerId],
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, expiresAt: new Date(row.expires_at), scopeType: row.scope_type };
}

/** 입장세션 발급 — 동일 스코프의 기존 ACTIVE 세션은 폐기 후 재발급(세션 고정 방지). */
export async function issueAccessSession(params: {
  userId: number;
  auction: AuctionAccessInfo;
  paymentAuthSessionId?: number | null;
}): Promise<{ id: number; scopeType: AccessScopeType; expiresAt: Date }> {
  const { userId, auction, paymentAuthSessionId = null } = params;
  const scopeType = resolveDefaultScope(auction);
  const policy = paymentPolicy.authSession.auctionEntry;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + policy.inactivityExpiryMinutes * 60_000);

  if (scopeType === 'AUCTION') {
    await pool.query(
      `UPDATE auction_access_sessions SET status='REVOKED', revoked_at=NOW(), revoke_reason='REPLACED'
       WHERE user_id=? AND status='ACTIVE' AND scope_type='AUCTION' AND auction_id=?`,
      [userId, auction.id],
    );
  } else {
    await pool.query(
      `UPDATE auction_access_sessions SET status='REVOKED', revoked_at=NOW(), revoke_reason='REPLACED'
       WHERE user_id=? AND status='ACTIVE' AND scope_type='GROUP' AND auction_group_id=?`,
      [userId, auction.auctionGroupId],
    );
  }

  const [result] = await pool.query<any>(
    `INSERT INTO auction_access_sessions
       (user_id, auction_id, auction_group_id, scope_type, seller_id, payment_auth_session_id,
        authenticated_at, last_used_at, expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
    [
      userId,
      scopeType === 'AUCTION' ? auction.id : null,
      scopeType === 'GROUP' ? auction.auctionGroupId : null,
      scopeType,
      null,
      paymentAuthSessionId,
      now,
      now,
      expiresAt,
    ],
  );

  return { id: result.insertId, scopeType, expiresAt };
}

/** 사용자 직접 해제 — 현재 스코프에 해당하는 ACTIVE 입장세션을 폐기한다. */
export async function revokeAccessSession(userId: number, auction: AuctionAccessInfo, reason: string): Promise<void> {
  const active = await findActiveAccessSession(userId, auction);
  if (!active) return;
  await pool.query(
    "UPDATE auction_access_sessions SET status='REVOKED', revoked_at=NOW(), revoke_reason=? WHERE id=?",
    [reason, active.id],
  );
}

/** 어드민 강제 종료(Phase 7, §19 인증 관리) — 세션ID 단건 폐기. payment-auth-session.ts의 revokeSessionById와 동일 패턴. */
export async function revokeAccessSessionById(sessionId: number, reason: string): Promise<void> {
  await pool.query(
    "UPDATE auction_access_sessions SET status='REVOKED', revoked_at=NOW(), revoke_reason=? WHERE id=? AND status='ACTIVE'",
    [reason, sessionId],
  );
}

/** 어드민 강제 종료(Phase 7, §19) — 결제비밀번호 초기화 등으로 해당 사용자의 모든 ACTIVE 입장세션을 스코프 무관하게 폐기한다. */
export async function revokeAllAccessSessionsForUser(userId: number, reason: string): Promise<void> {
  await pool.query(
    "UPDATE auction_access_sessions SET status='REVOKED', revoked_at=NOW(), revoke_reason=? WHERE user_id=? AND status='ACTIVE'",
    [reason, userId],
  );
}

/** 경매 입장 시 필요한 인증 요구사항(§4.4 모드 매핑) */
export function getEntryAuthRequirement(auction: AuctionAccessInfo) {
  return resolveAuthRequirements(auction.authenticationMode);
}

/** 고액 입찰 재인증 필요 여부(§5.4) — 경매별 high_value_reauth_amount가 있으면 config 기본값보다 우선한다. */
export function requiresHighValueBidReauth(auction: AuctionAccessInfo, bidAmount: number): boolean {
  return exceedsHighValueThreshold('BID', bidAmount, auction.highValueReauthAmount);
}
