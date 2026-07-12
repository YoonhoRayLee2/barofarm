// 결제비밀번호(6자리 숫자 PIN) 서비스 — 로그인 비밀번호와 완전히 분리된 별도 해시/필드로 관리한다.
// 원문은 어떤 경우에도 저장·로그·응답에 남기지 않는다. 실패 시 감사 로그는 오류코드만 기록한다.

import pool from '../db/mysql';
import { hashPassword, verifyPassword } from './auth';
import { paymentPolicy } from '../config/payment-policy';

export enum PaymentCredentialErrorCode {
  NOT_SET = 'PAYMENT_PASSWORD_NOT_SET',
  ALREADY_SET = 'PAYMENT_PASSWORD_ALREADY_SET',
  INVALID = 'INVALID_PAYMENT_PASSWORD',
  LOCKED = 'PAYMENT_PASSWORD_LOCKED',
  WEAK = 'PAYMENT_PASSWORD_TOO_SIMPLE',
  INVALID_FORMAT = 'INVALID_PAYMENT_PASSWORD_FORMAT',
}

export class PaymentCredentialError extends Error {
  code: PaymentCredentialErrorCode;
  /** LOCKED일 때 잠금 해제 예정시각 */
  lockedUntil?: Date;

  constructor(code: PaymentCredentialErrorCode, message: string, lockedUntil?: Date) {
    super(message);
    this.code = code;
    this.lockedUntil = lockedUntil;
  }
}

interface CredentialRow {
  id: number;
  user_id: number;
  password_hash: string;
  password_version: number;
  failed_attempt_count: number;
  locked_until: Date | null;
}

export interface CredentialStatus {
  isSet: boolean;
  passwordVersion: number | null;
  lockedUntil: string | null;
  isLocked: boolean;
}

async function getRow(userId: number): Promise<CredentialRow | null> {
  const [rows] = await pool.query<any[]>(
    'SELECT id, user_id, password_hash, password_version, failed_attempt_count, locked_until FROM user_payment_credentials WHERE user_id = ?',
    [userId],
  );
  return rows[0] ?? null;
}

function isLockActive(row: CredentialRow, now: Date): boolean {
  return row.locked_until != null && new Date(row.locked_until).getTime() > now.getTime();
}

/** 단순번호(연속/반복/전화번호 일치) 여부 — config로 검사 자체를 끌 수 있다. */
function isSimplePattern(password: string, phone: string | null | undefined): boolean {
  if (!paymentPolicy.password.rejectSimplePatterns) return false;

  const digits = password.split('').map(Number);

  // 전부 동일 숫자 (000000, 111111 ...)
  if (new Set(digits).size === 1) return true;

  // 연속 증가/감소 (123456, 654321 ...) — 순환(890123 등)도 포함
  let ascending = true;
  let descending = true;
  for (let i = 1; i < digits.length; i++) {
    if (digits[i] !== (digits[i - 1] + 1) % 10) ascending = false;
    if (digits[i] !== (digits[i - 1] + 9) % 10) descending = false;
  }
  if (ascending || descending) return true;

  // 전화번호 뒷자리와 일치 (생년월일은 스키마상 저장 컬럼이 없어 검사 불가 — users.phone만 대조)
  if (phone) {
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length >= password.length && phoneDigits.endsWith(password)) return true;
  }

  return false;
}

function assertValidFormat(password: string): void {
  const len = paymentPolicy.password.digitLength;
  const re = new RegExp(`^\\d{${len}}$`);
  if (!re.test(password)) {
    throw new PaymentCredentialError(
      PaymentCredentialErrorCode.INVALID_FORMAT,
      `결제비밀번호는 숫자 ${len}자리여야 합니다`,
    );
  }
}

async function getUserPhone(userId: number): Promise<string | null> {
  const [rows] = await pool.query<any[]>('SELECT phone FROM users WHERE id = ?', [userId]);
  return rows[0]?.phone ?? null;
}

/** 결제비밀번호 설정/조회 상태 — 원문/해시는 절대 포함하지 않는다. */
export async function getCredentialStatus(userId: number): Promise<CredentialStatus> {
  const row = await getRow(userId);
  if (!row) {
    return { isSet: false, passwordVersion: null, lockedUntil: null, isLocked: false };
  }
  const now = new Date();
  return {
    isSet: true,
    passwordVersion: row.password_version,
    lockedUntil: row.locked_until ? new Date(row.locked_until).toISOString() : null,
    isLocked: isLockActive(row, now),
  };
}

/** 최초 설정 — 이미 설정돼 있으면 ALREADY_SET 오류 (변경은 changeCredential 사용). */
export async function createCredential(userId: number, password: string): Promise<void> {
  assertValidFormat(password);
  const existing = await getRow(userId);
  if (existing) {
    throw new PaymentCredentialError(PaymentCredentialErrorCode.ALREADY_SET, '이미 결제비밀번호가 설정되어 있습니다');
  }
  const phone = await getUserPhone(userId);
  if (isSimplePattern(password, phone)) {
    throw new PaymentCredentialError(PaymentCredentialErrorCode.WEAK, '너무 단순한 비밀번호는 사용할 수 없습니다');
  }
  const passwordHash = await hashPassword(password);
  await pool.query(
    'INSERT INTO user_payment_credentials (user_id, password_hash, password_version) VALUES (?, ?, 1)',
    [userId, passwordHash],
  );
}

/** 현재 비밀번호 검증 후 변경. 성공/실패 무관하게 호출부에서 감사 로그(오류코드만)를 남길 것. */
export async function changeCredential(userId: number, currentPassword: string, newPassword: string): Promise<void> {
  assertValidFormat(newPassword);
  await verifyCredential(userId, currentPassword); // 실패 시 여기서 throw (잠금/카운트 처리 포함)

  const phone = await getUserPhone(userId);
  if (isSimplePattern(newPassword, phone)) {
    throw new PaymentCredentialError(PaymentCredentialErrorCode.WEAK, '너무 단순한 비밀번호는 사용할 수 없습니다');
  }
  const passwordHash = await hashPassword(newPassword);
  await pool.query(
    `UPDATE user_payment_credentials
       SET password_hash = ?, password_version = password_version + 1,
           failed_attempt_count = 0, locked_until = NULL, last_changed_at = NOW()
     WHERE user_id = ?`,
    [passwordHash, userId],
  );
}

/** 계정 로그인 비밀번호 재확인 후 결제비밀번호 초기화(삭제) — 다시 설정(createCredential) 필요 상태로 되돌린다. */
export async function resetCredential(userId: number, loginPassword: string): Promise<void> {
  const [rows] = await pool.query<any[]>('SELECT password_hash FROM users WHERE id = ?', [userId]);
  const user = rows[0];
  if (!user) {
    throw new PaymentCredentialError(PaymentCredentialErrorCode.INVALID, '사용자를 찾을 수 없습니다');
  }
  const ok = await verifyPassword(loginPassword, user.password_hash);
  if (!ok) {
    throw new PaymentCredentialError(PaymentCredentialErrorCode.INVALID, '계정 비밀번호가 일치하지 않습니다');
  }
  await pool.query('DELETE FROM user_payment_credentials WHERE user_id = ?', [userId]);
}

/**
 * 결제비밀번호 검증 (로그인/잠금정책 포함).
 * 성공: 실패카운트 리셋. 실패: 카운트 증가, 임계 도달 시 잠금.
 * 원문은 어디에도 로그로 남기지 않는다 — 실패 시 콘솔에는 오류코드만 남긴다.
 */
export async function verifyCredential(userId: number, password: string): Promise<{ passwordVersion: number }> {
  const row = await getRow(userId);
  if (!row) {
    throw new PaymentCredentialError(PaymentCredentialErrorCode.NOT_SET, '결제비밀번호가 설정되어 있지 않습니다');
  }

  const now = new Date();
  if (isLockActive(row, now)) {
    console.warn(`[payment-credential] verify blocked user=${userId} code=${PaymentCredentialErrorCode.LOCKED}`);
    throw new PaymentCredentialError(
      PaymentCredentialErrorCode.LOCKED,
      '결제비밀번호가 잠겨 있습니다. 잠시 후 다시 시도해주세요',
      new Date(row.locked_until as Date),
    );
  }

  const ok = await verifyPassword(password, row.password_hash);

  if (ok) {
    await pool.query(
      'UPDATE user_payment_credentials SET failed_attempt_count = 0, locked_until = NULL WHERE user_id = ?',
      [userId],
    );
    return { passwordVersion: row.password_version };
  }

  const nextCount = row.failed_attempt_count + 1;
  const { maxFailedAttempts, lockoutMinutes } = paymentPolicy.lockout;

  if (nextCount >= maxFailedAttempts) {
    await pool.query(
      'UPDATE user_payment_credentials SET failed_attempt_count = ?, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE user_id = ?',
      [nextCount, lockoutMinutes, userId],
    );
    console.warn(`[payment-credential] verify failed→locked user=${userId} code=${PaymentCredentialErrorCode.LOCKED}`);
    throw new PaymentCredentialError(
      PaymentCredentialErrorCode.LOCKED,
      '결제비밀번호를 여러 번 잘못 입력하여 잠겼습니다',
    );
  }

  await pool.query('UPDATE user_payment_credentials SET failed_attempt_count = ? WHERE user_id = ?', [nextCount, userId]);
  console.warn(`[payment-credential] verify failed user=${userId} code=${PaymentCredentialErrorCode.INVALID} attempts=${nextCount}/${maxFailedAttempts}`);
  throw new PaymentCredentialError(PaymentCredentialErrorCode.INVALID, '결제비밀번호가 일치하지 않습니다');
}

export async function hasPaymentPassword(userId: number): Promise<boolean> {
  const row = await getRow(userId);
  return row != null;
}
