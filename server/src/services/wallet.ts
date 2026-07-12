// 지갑 코어 서비스 — 모든 잔액 변경은 이 파일의 applyWalletTx()를 통한 원장(wallet_transactions)
// append로만 이루어진다. pay_wallets의 잔액 컬럼을 직접 UPDATE하는 코드는 이 파일 밖에 두지 않는다.
//
// 동시성: 낙관적 락(pay_wallets.version) + 데드락/락대기 재시도(withWalletTransaction).
// 같은 지갑에 대한 동시 요청은 version 불일치로 감지되어 트랜잭션 전체를 재시도한다.

import { PoolConnection } from 'mysql2/promise';
import pool from '../db/mysql';
import { paymentPolicy } from '../config/payment-policy';

export type AssetType = 'MONEY' | 'EARNED_POINT' | 'EVENT_POINT' | 'TEST_POINT' | 'COMPENSATION_POINT';
export type PointAssetType = Exclude<AssetType, 'MONEY'>;

export type PaymentMethodType = 'MONEY' | 'CARD' | 'ACCOUNT' | 'MOBILE' | 'VIRTUAL_ACCOUNT';

/** assetType → pay_wallets 잔액 컬럼 매핑. 컬럼 없는 자산유형 추가 시 마이그레이션으로 컬럼을 먼저 추가할 것(057 참고). */
const BUCKET_COLUMN: Record<AssetType, string> = {
  MONEY: 'money_balance',
  EARNED_POINT: 'earned_point_balance',
  EVENT_POINT: 'event_point_balance',
  TEST_POINT: 'test_point_balance',
  COMPENSATION_POINT: 'compensation_point_balance',
};

export enum WalletErrorCode {
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_WALLET_BALANCE',
}

export class WalletError extends Error {
  code: WalletErrorCode;
  constructor(code: WalletErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** 낙관적 락(version) 충돌 — withWalletTransaction이 이 에러를 잡아 전체 트랜잭션을 재시도한다. */
export class WalletVersionConflictError extends Error {}

interface WalletRow {
  id: number;
  user_id: number;
  money_balance: number;
  earned_point_balance: number;
  event_point_balance: number;
  test_point_balance: number;
  compensation_point_balance: number;
  auto_charge_enabled: number;
  auto_charge_threshold: number;
  auto_charge_amount: number;
  version: number;
  updated_at: Date;
}

type Conn = PoolConnection;

// ─── 트랜잭션 + 재시도 래퍼 ──────────────────────────────────────────────────

const DEADLOCK_ERRNOS = new Set([1213, 1205]); // ER_LOCK_DEADLOCK, ER_LOCK_WAIT_TIMEOUT
const MAX_RETRIES = 8;

function isRetryable(err: any): boolean {
  if (err instanceof WalletVersionConflictError) return true;
  if (err && typeof err.errno === 'number' && DEADLOCK_ERRNOS.has(err.errno)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 지갑 쓰기 전용 트랜잭션 래퍼. work(conn) 안에서 ensureWallet/applyWalletTx 등을 호출한다.
 * 낙관적 락 충돌(WalletVersionConflictError) 또는 데드락/락대기(ER_LOCK_DEADLOCK/ER_LOCK_WAIT_TIMEOUT)
 * 발생 시 work 전체를 처음부터 재시도(지수 백오프)한다 — work는 부수효과가 재시도-안전(idempotent)해야 하며,
 * applyWalletTx의 idempotencyKey 멱등 처리가 이를 보장한다.
 */
export async function withWalletTransaction<T>(work: (conn: Conn) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback().catch(() => {});
      if (isRetryable(err) && attempt < MAX_RETRIES) {
        // FOR UPDATE로 대부분의 동시성은 직렬화되므로 이 경로는 드물게만 탄다.
        // 남는 경우(락 대기 타임아웃 등)를 위해 약간의 지터를 섞은 지수 백오프로 재시도.
        await sleep(15 * (attempt + 1) + Math.floor(Math.random() * 15));
        continue;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}

// ─── 지갑 조회/생성 ──────────────────────────────────────────────────────────

/**
 * 지갑이 없으면 생성하고, 있으면 행 잠금(FOR UPDATE)까지 걸어 반환한다.
 * 반드시 withWalletTransaction의 conn 안에서 호출할 것.
 *
 * 동시성 설계: 같은 지갑에 대한 동시 쓰기는 FOR UPDATE로 직렬화되므로(요청이 순서대로 처리됨)
 * version 컬럼의 낙관적 검사는 사실상 항상 통과한다 — 순수 optimistic-retry만으로는 인기 지갑(핫스팟)에서
 * 동시 요청 수가 늘어날수록 재시도 예산을 넘겨 실패율이 급증하므로(실측: 20-way 동시 충전에서 4건 실패),
 * FOR UPDATE로 직렬화해 재시도 자체가 거의 필요 없게 만들고, version 검사는 이 락 밖에서 지갑을 건드릴
 * 가능성(버그 등)에 대한 방어적 이중 장치로 유지한다. 여러 지갑/리소스를 다른 순서로 잠그는 경로가 생기면
 * 데드락(ER_LOCK_DEADLOCK)이 날 수 있는데, 이는 withWalletTransaction의 재시도가 처리한다.
 */
export async function ensureWallet(conn: Conn, userId: number): Promise<WalletRow> {
  const [rows] = await conn.query<any[]>('SELECT * FROM pay_wallets WHERE user_id = ? FOR UPDATE', [userId]);
  if (rows[0]) return rows[0];

  await conn.query('INSERT IGNORE INTO pay_wallets (user_id) VALUES (?)', [userId]);
  const [rows2] = await conn.query<any[]>('SELECT * FROM pay_wallets WHERE user_id = ? FOR UPDATE', [userId]);
  if (!rows2[0]) {
    throw new Error(`[wallet] ensureWallet failed for userId=${userId}`);
  }
  return rows2[0];
}

export interface WalletSummary {
  userId: number;
  moneyBalance: number;
  earnedPointBalance: number;
  eventPointBalance: number;
  testPointBalance: number;
  compensationPointBalance: number;
  autoChargeEnabled: boolean;
  autoChargeThreshold: number;
  autoChargeAmount: number;
  updatedAt: string;
}

function toSummary(userId: number, row: WalletRow | null): WalletSummary {
  if (!row) {
    return {
      userId,
      moneyBalance: 0,
      earnedPointBalance: 0,
      eventPointBalance: 0,
      testPointBalance: 0,
      compensationPointBalance: 0,
      autoChargeEnabled: false,
      autoChargeThreshold: 0,
      autoChargeAmount: 0,
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    userId,
    moneyBalance: row.money_balance,
    earnedPointBalance: row.earned_point_balance,
    eventPointBalance: row.event_point_balance,
    testPointBalance: row.test_point_balance,
    compensationPointBalance: row.compensation_point_balance,
    autoChargeEnabled: Boolean(row.auto_charge_enabled),
    autoChargeThreshold: row.auto_charge_threshold,
    autoChargeAmount: row.auto_charge_amount,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function balanceOf(row: WalletRow, assetType: AssetType): number {
  return row[BUCKET_COLUMN[assetType] as keyof WalletRow] as number;
}

/** 지갑 잔액 조회(읽기 전용, 지갑 미생성 상태면 전부 0으로 응답 — 실제 row는 최초 쓰기 시점에 생성됨). */
export async function getWallet(userId: number): Promise<WalletSummary> {
  const [rows] = await pool.query<any[]>('SELECT * FROM pay_wallets WHERE user_id = ?', [userId]);
  return toSummary(userId, rows[0] ?? null);
}

export interface TransactionPaging {
  limit?: number;
  offset?: number;
  assetType?: AssetType;
  from?: Date;
  to?: Date;
}

export interface WalletTransactionRecord {
  id: number;
  walletId: number;
  transactionType: string;
  assetType: AssetType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

function mapTxRow(row: any): WalletTransactionRecord {
  return {
    id: row.id,
    walletId: row.wallet_id,
    transactionType: row.transaction_type,
    assetType: row.asset_type,
    amount: row.amount,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    description: row.description,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** 원장 내역 조회(페이징, assetType/기간 필터). */
export async function getTransactions(
  userId: number,
  paging: TransactionPaging = {},
): Promise<{ items: WalletTransactionRecord[]; total: number; limit: number; offset: number }> {
  const limit = Math.min(Math.max(paging.limit ?? 20, 1), 100);
  const offset = Math.max(paging.offset ?? 0, 0);

  const conditions: string[] = ['w.user_id = ?'];
  const params: any[] = [userId];
  if (paging.assetType) {
    conditions.push('t.asset_type = ?');
    params.push(paging.assetType);
  }
  if (paging.from) {
    conditions.push('t.created_at >= ?');
    params.push(paging.from);
  }
  if (paging.to) {
    conditions.push('t.created_at <= ?');
    params.push(paging.to);
  }
  const where = conditions.join(' AND ');

  const [rows] = await pool.query<any[]>(
    `SELECT t.* FROM wallet_transactions t
       JOIN pay_wallets w ON w.id = t.wallet_id
      WHERE ${where}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [countRows] = await pool.query<any[]>(
    `SELECT COUNT(*) AS total FROM wallet_transactions t
       JOIN pay_wallets w ON w.id = t.wallet_id
      WHERE ${where}`,
    params,
  );

  return { items: rows.map(mapTxRow), total: countRows[0]?.total ?? 0, limit, offset };
}

// ─── 원장 append (모든 잔액 변경의 유일한 경로) ─────────────────────────────

export interface ApplyWalletTxParams {
  userId: number;
  assetType: AssetType;
  /** CHARGE/PAYMENT/REFUND/POINT_EARN/POINT_USE/POINT_RESTORE/ADMIN_POINT_GRANT/ADMIN_POINT_REVOKE/ADMIN_MONEY_GRANT/ADMIN_MONEY_REVOKE/BALANCE_CORRECTION 등 */
  transactionType: string;
  /** 증감분(부호 포함). 양수=적립/충전/지급, 음수=차감/사용/회수 */
  amount: number;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
  /** 이벤트/테스트 포인트 등의 만료 시각 */
  expiresAt?: Date | null;
  /** SYSTEM/ADMIN/USER 등 발생 주체 — 기본 SYSTEM */
  createdBy?: string | null;
  idempotencyKey: string;
}

export interface WalletTxResult {
  transactionId: number;
  walletId: number;
  userId: number;
  assetType: AssetType;
  transactionType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  /** true면 동일 idempotencyKey의 기존 거래를 그대로 반환한 것(재적용 없음) */
  idempotent: boolean;
}

/**
 * 지갑 잔액 변경의 유일한 진입점. withWalletTransaction이 제공하는 conn 안에서 호출해야 하며,
 * 실패(락 충돌/데드락) 시 그 트랜잭션 전체가 재시도되므로 이 함수 자체는 재호출-안전하다.
 *
 * 순서: idempotencyKey 중복 확인(있으면 기존 결과 그대로 반환) → 지갑 조회/생성 →
 * 잔액 계산(음수 금지) → 낙관적 락 UPDATE(version 일치 시에만 반영) → wallet_transactions INSERT.
 */
export async function applyWalletTx(conn: Conn, params: ApplyWalletTxParams): Promise<WalletTxResult> {
  const { userId, assetType, transactionType, amount, idempotencyKey } = params;
  if (!idempotencyKey) {
    throw new Error('[wallet] idempotencyKey is required');
  }
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error('[wallet] amount must be a non-zero finite number');
  }

  const [existingRows] = await conn.query<any[]>(
    'SELECT * FROM wallet_transactions WHERE idempotency_key = ?',
    [idempotencyKey],
  );
  if (existingRows[0]) {
    const tx = existingRows[0];
    return {
      transactionId: tx.id,
      walletId: tx.wallet_id,
      userId,
      assetType: tx.asset_type,
      transactionType: tx.transaction_type,
      amount: tx.amount,
      balanceBefore: tx.balance_before,
      balanceAfter: tx.balance_after,
      idempotent: true,
    };
  }

  const wallet = await ensureWallet(conn, userId);
  const column = BUCKET_COLUMN[assetType];
  const balanceBefore = balanceOf(wallet, assetType);
  const balanceAfter = balanceBefore + amount;

  if (balanceAfter < 0) {
    throw new WalletError(
      WalletErrorCode.INSUFFICIENT_BALANCE,
      `잔액이 부족합니다 (assetType=${assetType}, balance=${balanceBefore}, requested=${amount})`,
    );
  }

  const [updateResult] = await conn.query<any>(
    `UPDATE pay_wallets SET ${column} = ?, version = version + 1 WHERE id = ? AND version = ?`,
    [balanceAfter, wallet.id, wallet.version],
  );
  if (updateResult.affectedRows === 0) {
    // 동시에 다른 트랜잭션이 먼저 이 지갑을 갱신함 — 전체 재시도 필요
    throw new WalletVersionConflictError(`[wallet] version conflict for walletId=${wallet.id}`);
  }

  try {
    const [insertResult] = await conn.query<any>(
      `INSERT INTO wallet_transactions
         (wallet_id, transaction_type, asset_type, amount, balance_before, balance_after,
          reference_type, reference_id, description, expires_at, created_by, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        wallet.id,
        transactionType,
        assetType,
        amount,
        balanceBefore,
        balanceAfter,
        params.referenceType ?? null,
        params.referenceId ?? null,
        params.description ?? null,
        params.expiresAt ?? null,
        params.createdBy ?? 'SYSTEM',
        idempotencyKey,
      ],
    );
    return {
      transactionId: insertResult.insertId,
      walletId: wallet.id,
      userId,
      assetType,
      transactionType,
      amount,
      balanceBefore,
      balanceAfter,
      idempotent: false,
    };
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      // 동시 요청 경쟁 — 다른 트랜잭션이 동일 idempotencyKey로 먼저 커밋. 전체 재시도.
      throw new WalletVersionConflictError('[wallet] idempotency key race — retry required');
    }
    throw err;
  }
}

// ─── 포인트 사용 우선순위 ────────────────────────────────────────────────────

export interface PointUsagePlanItem {
  assetType: PointAssetType;
  amount: number;
}

/**
 * config.pointUsePriority 순서로 포인트 차감 계획을 만든다(잔액 조회만, 실제 차감 없음).
 * TEST_POINT는 Feature Flag(TEST_POINT_ENABLED)가 꺼져 있으면 계획에서 제외한다.
 *
 * 주의(스키마 한계): pay_wallets는 자산유형별 "합계 잔액"만 보관하고 지급 건(lot) 단위 만료시각을
 * 추적하는 테이블이 없다. 따라서 "만료임박 순"은 서로 다른 자산유형(EVENT_POINT vs TEST_POINT 등)
 * 간의 config 우선순위로만 반영되고, 동일 자산유형 내 여러 지급 건 사이의 만료임박 순 세부 정렬은
 * Phase 3 범위에서 구현하지 않는다(향후 lot 단위 원장/조회가 필요하면 별도 설계 필요).
 * 실제 차감 실행은 이 계획을 호출부가 applyWalletTx(transactionType='POINT_USE', amount=-금액)로
 * 순서대로 적용하는 방식으로 이루어진다(Phase 4에서 결제 흐름에 연결).
 */
export async function selectPointUsage(userId: number, amount: number): Promise<PointUsagePlanItem[]> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('[wallet] selectPointUsage amount must be a positive number');
  }
  const wallet = await getWallet(userId);
  const balances: Record<PointAssetType, number> = {
    EVENT_POINT: wallet.eventPointBalance,
    TEST_POINT: wallet.testPointBalance,
    EARNED_POINT: wallet.earnedPointBalance,
    COMPENSATION_POINT: wallet.compensationPointBalance,
  };

  const plan: PointUsagePlanItem[] = [];
  let remaining = amount;
  for (const assetType of paymentPolicy.pointUsePriority) {
    if (remaining <= 0) break;
    if (assetType === 'TEST_POINT' && !paymentPolicy.featureFlags.TEST_POINT_ENABLED) continue;
    const available = balances[assetType] ?? 0;
    if (available <= 0) continue;
    const use = Math.min(available, remaining);
    plan.push({ assetType, amount: use });
    remaining -= use;
  }
  return plan;
}

// ─── 적립 ───────────────────────────────────────────────────────────────────

/** 결제수단별 적립률 적용 + 원 단위 절사/반올림 정책(config) 반영. 실제 지급은 하지 않는 순수 계산 함수. */
export function calcEarnPoints(paymentAmount: number, method: PaymentMethodType): number {
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return 0;
  const rate = method === 'MONEY' ? paymentPolicy.earnRate.barofarmPayRate : paymentPolicy.earnRate.externalPaymentRate;
  const raw = paymentAmount * rate;
  switch (paymentPolicy.earnRate.rounding) {
    case 'CEIL':
      return Math.ceil(raw);
    case 'ROUND':
      return Math.round(raw);
    case 'FLOOR':
    default:
      return Math.floor(raw);
  }
}

export interface EarnPointsParams {
  userId: number;
  paymentAmount: number;
  method: PaymentMethodType;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey: string;
}

/**
 * 적립금 지급(POINT_EARN, EARNED_POINT). calcEarnPoints 결과가 0이면 원장 기록 없이 null 반환
 * (applyWalletTx는 amount=0을 거부하므로 호출 전에 걸러준다).
 * 결제 흐름에서의 실제 호출은 Phase 4에서 연결한다.
 */
export async function earnPoints(conn: Conn, params: EarnPointsParams): Promise<WalletTxResult | null> {
  const amount = calcEarnPoints(params.paymentAmount, params.method);
  if (amount <= 0) return null;
  return applyWalletTx(conn, {
    userId: params.userId,
    assetType: 'EARNED_POINT',
    transactionType: 'POINT_EARN',
    amount,
    referenceType: params.referenceType ?? null,
    referenceId: params.referenceId ?? null,
    description: `적립금 지급 (${params.method}, ${(params.method === 'MONEY' ? paymentPolicy.earnRate.barofarmPayRate : paymentPolicy.earnRate.externalPaymentRate) * 100}%)`,
    createdBy: 'SYSTEM',
    idempotencyKey: params.idempotencyKey,
  });
}

// ─── 복원(취소/환불) ────────────────────────────────────────────────────────

export interface RestoreItem {
  assetType: AssetType;
  /** 복원할 금액(항상 양수 — 잔액 증가) */
  amount: number;
  /** 기본값: MONEY→'REFUND', 포인트류→'POINT_RESTORE' */
  transactionType?: string;
}

export interface RestorePointsAndMoneyParams {
  userId: number;
  items: RestoreItem[];
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
  createdBy?: string | null;
  /** 항목별로 `${idempotencyKey}:${index}:${assetType}` 형태로 개별 멱등키를 만들어 사용한다 */
  idempotencyKey: string;
}

/**
 * 주문 취소/환불 시 사용했던 포인트·머니를 복원한다(POINT_RESTORE/REFUND).
 * amount<=0인 항목은 건너뛴다. 호출부(Phase 4)가 withWalletTransaction으로 감싸 호출해야 한다.
 */
export async function restorePointsAndMoney(
  conn: Conn,
  params: RestorePointsAndMoneyParams,
): Promise<WalletTxResult[]> {
  const results: WalletTxResult[] = [];
  for (let i = 0; i < params.items.length; i++) {
    const item = params.items[i];
    if (!Number.isFinite(item.amount) || item.amount <= 0) continue;
    const transactionType = item.transactionType ?? (item.assetType === 'MONEY' ? 'REFUND' : 'POINT_RESTORE');
    const result = await applyWalletTx(conn, {
      userId: params.userId,
      assetType: item.assetType,
      transactionType,
      amount: item.amount,
      referenceType: params.referenceType ?? null,
      referenceId: params.referenceId ?? null,
      description: params.description ?? null,
      createdBy: params.createdBy ?? 'SYSTEM',
      idempotencyKey: `${params.idempotencyKey}:${i}:${item.assetType}`,
    });
    results.push(result);
  }
  return results;
}

// ─── 자동충전(Mock) ─────────────────────────────────────────────────────────

export interface AutoChargeSettings {
  autoChargeEnabled: boolean;
  autoChargeThreshold: number;
  autoChargeAmount: number;
}

/** autoCharge* 설정은 잔액이 아니므로 원장을 거치지 않고 직접 갱신한다(§ pay_wallets 설정 컬럼). */
export async function setAutoChargeSettings(userId: number, settings: AutoChargeSettings): Promise<WalletSummary> {
  await pool.query('INSERT IGNORE INTO pay_wallets (user_id) VALUES (?)', [userId]);
  await pool.query(
    `UPDATE pay_wallets
        SET auto_charge_enabled = ?, auto_charge_threshold = ?, auto_charge_amount = ?
      WHERE user_id = ?`,
    [settings.autoChargeEnabled ? 1 : 0, settings.autoChargeThreshold, settings.autoChargeAmount, userId],
  );
  return getWallet(userId);
}

/** 머니 잔액이 autoChargeThreshold 미만이면 트리거 필요 여부/충전액을 판정하는 순수 함수. */
export function checkAutoChargeNeeded(wallet: WalletSummary): { triggered: boolean; amount?: number } {
  if (!wallet.autoChargeEnabled) return { triggered: false };
  if (wallet.moneyBalance >= wallet.autoChargeThreshold) return { triggered: false };
  if (wallet.autoChargeAmount <= 0) return { triggered: false };
  return { triggered: true, amount: wallet.autoChargeAmount };
}
