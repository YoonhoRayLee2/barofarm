// 결제/고액입찰 인증세션(payment_auth_sessions) 서비스.
// 세션 토큰은 해시(sha256)로만 저장하고, 원문 토큰은 HttpOnly+Secure 쿠키로만 전달한다(localStorage 금지).
// 인증 성공(재발급) 시 항상 새 토큰/세션ID를 생성해 세션 고정 공격을 방지한다.

import crypto from 'crypto';
import { Request, Response } from 'express';
import pool from '../db/mysql';
import { paymentPolicy, AuthSessionPolicy } from '../config/payment-policy';
import { getCookieValue } from '../utils/cookies';

export type AuthenticationPurpose = 'PAYMENT' | 'AUCTION_ENTRY' | 'HIGH_VALUE_BID' | 'HIGH_VALUE_PAYMENT';
export type AuctionAuthenticationMode = 'PAYMENT_ONLY' | 'AUCTION_ENTRY' | 'ENTRY_AND_PAYMENT' | 'ALWAYS';

export enum PaymentAuthSessionErrorCode {
  EXPIRED = 'PAYMENT_AUTH_SESSION_EXPIRED',
  REVOKED = 'PAYMENT_AUTH_SESSION_REVOKED',
  HIGH_VALUE_REAUTH_REQUIRED = 'HIGH_VALUE_REAUTH_REQUIRED',
}

export const PAYMENT_AUTH_COOKIE = 'baro_pay_auth';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function policyForPurpose(purpose: AuthenticationPurpose): AuthSessionPolicy {
  switch (purpose) {
    case 'PAYMENT':
    case 'HIGH_VALUE_PAYMENT':
      return paymentPolicy.authSession.payment;
    case 'AUCTION_ENTRY':
    case 'HIGH_VALUE_BID':
      return paymentPolicy.authSession.auctionEntry;
    default:
      return paymentPolicy.authSession.default;
  }
}

export interface IssueSessionParams {
  userId: number;
  purpose: AuthenticationPurpose;
  deviceId?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
}

export interface IssuedSession {
  sessionId: number;
  token: string;
  purpose: AuthenticationPurpose;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}

/** 인증 성공 → 세션 발급. 동일 목적/스코프의 기존 ACTIVE 세션은 REPLACED로 폐기(세션 고정 공격 방지). */
export async function issueSession(params: IssueSessionParams): Promise<IssuedSession> {
  const { userId, purpose, deviceId = null, scopeType = null, scopeId = null } = params;
  const policy = policyForPurpose(purpose);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + policy.inactivityExpiryMinutes * 60_000);
  const absoluteExpiresAt = new Date(now.getTime() + policy.absoluteExpiryMinutes * 60_000);

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  await pool.query(
    `UPDATE payment_auth_sessions
       SET status='REVOKED', revoked_at=NOW(), revoke_reason='REPLACED'
     WHERE user_id = ? AND authentication_purpose = ? AND status = 'ACTIVE'
       AND scope_type <=> ? AND scope_id <=> ?`,
    [userId, purpose, scopeType, scopeId],
  );

  const [result] = await pool.query<any>(
    `INSERT INTO payment_auth_sessions
       (user_id, session_token_hash, authentication_purpose, scope_type, scope_id, device_id,
        authenticated_at, last_used_at, expires_at, absolute_expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
    [userId, tokenHash, purpose, scopeType, scopeId, deviceId, now, now, expiresAt, absoluteExpiresAt],
  );

  return { sessionId: result.insertId, token, purpose, expiresAt, absoluteExpiresAt };
}

export type SessionInvalidReason = 'NOT_FOUND' | 'EXPIRED' | 'REVOKED' | 'DEVICE_MISMATCH';

export interface ActiveSession {
  id: number;
  userId: number;
  purpose: AuthenticationPurpose;
  scopeType: string | null;
  scopeId: string | null;
  deviceId: string | null;
  authenticatedAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}

export type ValidateSessionResult =
  | { valid: true; session: ActiveSession }
  | { valid: false; reason: SessionInvalidReason };

/**
 * 세션 토큰 유효성 검증 + 사용 시각 갱신(비활동 만료 슬라이딩 윈도우, 절대만료는 넘지 않음).
 * deviceId가 세션 발급 시점과 다르면 즉시 REVOKED 처리하고 재인증을 요구한다(§4.3 다른 디바이스 조건).
 */
export async function validateSessionToken(
  token: string,
  opts: { deviceId?: string | null } = {},
): Promise<ValidateSessionResult> {
  const tokenHash = hashToken(token);
  const [rows] = await pool.query<any[]>('SELECT * FROM payment_auth_sessions WHERE session_token_hash = ?', [tokenHash]);
  const row = rows[0];
  if (!row) return { valid: false, reason: 'NOT_FOUND' };

  if (row.status === 'REVOKED' || row.status === 'LOCKED') {
    return { valid: false, reason: 'REVOKED' };
  }

  const now = new Date();
  if (row.status !== 'ACTIVE' || now >= new Date(row.expires_at) || now >= new Date(row.absolute_expires_at)) {
    if (row.status === 'ACTIVE') {
      await pool.query("UPDATE payment_auth_sessions SET status='EXPIRED' WHERE id = ?", [row.id]);
    }
    return { valid: false, reason: 'EXPIRED' };
  }

  if (opts.deviceId && row.device_id && opts.deviceId !== row.device_id) {
    await pool.query(
      "UPDATE payment_auth_sessions SET status='REVOKED', revoked_at=NOW(), revoke_reason='DEVICE_MISMATCH' WHERE id = ?",
      [row.id],
    );
    return { valid: false, reason: 'DEVICE_MISMATCH' };
  }

  const policy = policyForPurpose(row.authentication_purpose);
  const slidingExpiry = now.getTime() + policy.inactivityExpiryMinutes * 60_000;
  const absoluteExpiry = new Date(row.absolute_expires_at).getTime();
  const newExpiresAt = new Date(Math.min(slidingExpiry, absoluteExpiry));

  await pool.query('UPDATE payment_auth_sessions SET last_used_at = NOW(), expires_at = ? WHERE id = ?', [newExpiresAt, row.id]);

  return {
    valid: true,
    session: {
      id: row.id,
      userId: row.user_id,
      purpose: row.authentication_purpose,
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      deviceId: row.device_id,
      authenticatedAt: row.authenticated_at,
      lastUsedAt: now,
      expiresAt: newExpiresAt,
      absoluteExpiresAt: row.absolute_expires_at,
    },
  };
}

export async function revokeSessionById(sessionId: number, reason: string): Promise<void> {
  await pool.query(
    "UPDATE payment_auth_sessions SET status='REVOKED', revoked_at=NOW(), revoke_reason=? WHERE id=? AND status='ACTIVE'",
    [reason, sessionId],
  );
}

export async function revokeSessionByToken(token: string, reason: string): Promise<void> {
  const tokenHash = hashToken(token);
  await pool.query(
    "UPDATE payment_auth_sessions SET status='REVOKED', revoked_at=NOW(), revoke_reason=? WHERE session_token_hash=? AND status='ACTIVE'",
    [reason, tokenHash],
  );
}

/** 로그아웃/비번변경/초기화/사용자 강제해제 등에서 사용 — 해당 사용자의 모든 ACTIVE 세션 폐기. */
export async function revokeAllSessionsForUser(userId: number, reason: string): Promise<void> {
  await pool.query(
    "UPDATE payment_auth_sessions SET status='REVOKED', revoked_at=NOW(), revoke_reason=? WHERE user_id=? AND status='ACTIVE'",
    [reason, userId],
  );
}

// ─── 쿠키 헬퍼 ──────────────────────────────────────────────────────────────
// 원문 토큰은 HttpOnly+Secure+SameSite 쿠키로만 전달한다 (localStorage 저장 금지).

export function setSessionCookie(res: Response, token: string, absoluteExpiresAt: Date): void {
  res.cookie(PAYMENT_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: absoluteExpiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(PAYMENT_AUTH_COOKIE, { path: '/' });
}

export function getSessionTokenFromRequest(req: Request): string | null {
  return getCookieValue(req.headers.cookie, PAYMENT_AUTH_COOKIE);
}

// ─── 인증모드(§4.4) 처리 유틸 ────────────────────────────────────────────────

export interface AuthModeRequirements {
  requireEntryAuth: boolean;
  requirePaymentAuth: boolean;
  /** ALWAYS 모드 — 기존 유효 세션이 있어도 매번 재인증을 요구한다. */
  forceReauthEveryTime: boolean;
}

export function resolveAuthRequirements(mode: AuctionAuthenticationMode): AuthModeRequirements {
  switch (mode) {
    case 'AUCTION_ENTRY':
      return { requireEntryAuth: true, requirePaymentAuth: false, forceReauthEveryTime: false };
    case 'ENTRY_AND_PAYMENT':
      return { requireEntryAuth: true, requirePaymentAuth: true, forceReauthEveryTime: false };
    case 'ALWAYS':
      return { requireEntryAuth: true, requirePaymentAuth: true, forceReauthEveryTime: true };
    case 'PAYMENT_ONLY':
    default:
      return { requireEntryAuth: false, requirePaymentAuth: true, forceReauthEveryTime: false };
  }
}

/** 고액 결제/입찰 재인증 기준 초과 여부 — auctionOverride가 있으면 config 기본값보다 우선한다. */
export function exceedsHighValueThreshold(
  purpose: 'PAYMENT' | 'BID',
  amount: number,
  auctionOverride?: number | null,
): boolean {
  const threshold = auctionOverride ?? (
    purpose === 'BID' ? paymentPolicy.reauthThresholds.highValueBid : paymentPolicy.reauthThresholds.highValuePayment
  );
  return amount >= threshold;
}
