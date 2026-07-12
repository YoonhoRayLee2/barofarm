// 어드민 지갑 관리 API (§10, §16.8) — 잔액 직접 수정 금지, 반드시 조정 거래로 원장 + 감사로그 기록.
//
// 일반 조정(/adjustments, MONEY 포함)은 requireAdmin(순수 관리자)만 허용한다.
// 테스트 자산(test-points, test-money)은 ADMIN 또는 DEVELOPER가 다룰 수 있되,
// Feature Flag(TEST_POINT_ENABLED)와 운영 하드 차단(TEST_POINT_PRODUCTION_DISABLED)을 통과해야 한다.
// test-money는 test-points와 동일한 "테스트/QA 전용 자산"으로 취급해 동일한 게이팅을 적용한다
// (실제 운영 자금인 MONEY를 별도 표시 없이 지급하는 것을 방지하기 위한 설계 — /adjustments의
// 일반 MONEY 조정과는 별개 경로).

import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/mysql';
import { requireAuth } from '../middleware/auth';
import { paymentPolicy } from '../config/payment-policy';
import {
  getWallet,
  getTransactions,
  withWalletTransaction,
  applyWalletTx,
  WalletError,
  WalletErrorCode,
  AssetType,
  WalletSummary,
} from '../services/wallet';

declare global {
  namespace Express {
    interface Request {
      isAdmin?: boolean;
      isDeveloper?: boolean;
    }
  }
}

const router = Router();
router.use(requireAuth);

async function loadRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [rows] = await pool.query<any[]>(
      'SELECT is_admin, is_developer FROM users WHERE id = ? LIMIT 1',
      [req.user!.userId],
    );
    const user = rows[0];
    req.isAdmin = Boolean(user?.is_admin);
    req.isDeveloper = Boolean(user?.is_developer);
    next();
  } catch (err) {
    console.error('[admin-wallet] loadRoles', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
router.use(loadRoles);

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAdmin) {
    res.status(403).json({ error: 'ADMIN_ADJUSTMENT_NOT_ALLOWED', message: '관리자 권한이 필요합니다' });
    return;
  }
  next();
}

function requireAdminOrDeveloper(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAdmin && !req.isDeveloper) {
    res.status(403).json({ error: 'ADMIN_ADJUSTMENT_NOT_ALLOWED', message: 'ADMIN 또는 DEVELOPER 권한이 필요합니다' });
    return;
  }
  next();
}

class AdminWalletRouteError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function handleError(err: unknown, res: Response): void {
  if (err instanceof AdminWalletRouteError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof WalletError) {
    res.status(409).json({ error: err.code, message: err.message });
    return;
  }
  console.error('[admin-wallet]', err);
  res.status(500).json({ error: 'internal_error' });
}

function balanceFromSummary(wallet: WalletSummary, assetType: AssetType): number {
  switch (assetType) {
    case 'MONEY':
      return wallet.moneyBalance;
    case 'EARNED_POINT':
      return wallet.earnedPointBalance;
    case 'EVENT_POINT':
      return wallet.eventPointBalance;
    case 'TEST_POINT':
      return wallet.testPointBalance;
    case 'COMPENSATION_POINT':
      return wallet.compensationPointBalance;
    default:
      return 0;
  }
}

/** TEST_POINT_ENABLED / 운영 하드 차단 / ADMIN·DEVELOPER 권한을 순서대로 검사한다. */
function assertTestAssetAllowed(req: Request, targetUserId: number): void {
  if (!paymentPolicy.featureFlags.TEST_POINT_ENABLED) {
    throw new AdminWalletRouteError('TEST_POINT_NOT_AVAILABLE', 'TEST_POINT 기능이 비활성화되어 있습니다', 403);
  }
  const { PRODUCTION_DISABLED, allowedUserIds } = paymentPolicy.testPoint;
  if (PRODUCTION_DISABLED && !allowedUserIds.has(targetUserId)) {
    throw new AdminWalletRouteError(
      'TEST_POINT_PRODUCTION_DISABLED',
      '운영 환경에서는 테스트 자산 지급/회수가 차단됩니다',
      403,
    );
  }
  if (!req.isAdmin && !req.isDeveloper) {
    throw new AdminWalletRouteError('ADMIN_ADJUSTMENT_NOT_ALLOWED', 'ADMIN 또는 DEVELOPER 권한이 필요합니다', 403);
  }
}

type AdjustmentType =
  | 'ADMIN_POINT_GRANT'
  | 'ADMIN_POINT_REVOKE'
  | 'ADMIN_MONEY_GRANT'
  | 'ADMIN_MONEY_REVOKE'
  | 'BALANCE_CORRECTION';

interface PerformAdjustmentParams {
  administratorId: number;
  targetUserId: number;
  adjustmentType: AdjustmentType;
  assetType: AssetType;
  /** 원장에 적용할 부호 있는 값(양수=증가, 음수=감소) */
  amount: number;
  reason: string;
  internalMemo?: string | null;
  /** wallet_transactions.reference_type — 특정 지급건 회수(sourceTransactionId)면 'ADMIN_GRANT_REVERSAL',
   *  그 외에는 기본값 'ADMIN_ADJUSTMENT'. resolveRevokeAmount의 "이미 회수된 금액" 조회가 이 값을 기준으로 한다. */
  referenceType?: string;
  referenceId?: string | null;
  expiresAt?: Date | null;
  idempotencyKey: string;
  requestIp: string | null;
}

interface AdjustmentResult {
  transactionId: number;
  adjustmentId: number | null;
  userId: number;
  administratorId: number;
  assetType: AssetType;
  adjustmentType: AdjustmentType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  processedAt: string;
  idempotent: boolean;
}

/** 조정 거래(원장 + admin_wallet_adjustments)를 원자적으로 기록한다. 잔액 컬럼 직접 UPDATE는 하지 않는다. */
async function performAdjustment(params: PerformAdjustmentParams): Promise<AdjustmentResult> {
  return withWalletTransaction(async (conn) => {
    const txResult = await applyWalletTx(conn, {
      userId: params.targetUserId,
      assetType: params.assetType,
      transactionType: params.adjustmentType,
      amount: params.amount,
      referenceType: params.referenceType ?? 'ADMIN_ADJUSTMENT',
      referenceId: params.referenceId ?? null,
      description: params.reason,
      expiresAt: params.expiresAt ?? null,
      createdBy: 'ADMIN',
      idempotencyKey: params.idempotencyKey,
    });

    if (txResult.idempotent) {
      const [existing] = await conn.query<any[]>(
        'SELECT * FROM admin_wallet_adjustments WHERE idempotency_key = ?',
        [params.idempotencyKey],
      );
      const adj = existing[0];
      return {
        transactionId: txResult.transactionId,
        adjustmentId: adj?.id ?? null,
        userId: params.targetUserId,
        administratorId: adj?.administrator_id ?? params.administratorId,
        assetType: params.assetType,
        adjustmentType: params.adjustmentType,
        amount: txResult.amount,
        balanceBefore: txResult.balanceBefore,
        balanceAfter: txResult.balanceAfter,
        reason: adj?.reason ?? params.reason,
        processedAt: adj ? new Date(adj.created_at).toISOString() : new Date().toISOString(),
        idempotent: true,
      };
    }

    const [insertResult] = await conn.query<any>(
      `INSERT INTO admin_wallet_adjustments
         (administrator_id, user_id, wallet_transaction_id, adjustment_type, asset_type, amount,
          reason, internal_memo, reference_id, idempotency_key, request_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.administratorId,
        params.targetUserId,
        txResult.transactionId,
        params.adjustmentType,
        params.assetType,
        params.amount,
        params.reason,
        params.internalMemo ?? null,
        params.referenceId ?? null,
        params.idempotencyKey,
        params.requestIp,
      ],
    );

    return {
      transactionId: txResult.transactionId,
      adjustmentId: insertResult.insertId,
      userId: params.targetUserId,
      administratorId: params.administratorId,
      assetType: params.assetType,
      adjustmentType: params.adjustmentType,
      amount: params.amount,
      balanceBefore: txResult.balanceBefore,
      balanceAfter: txResult.balanceAfter,
      reason: params.reason,
      processedAt: new Date().toISOString(),
      idempotent: false,
    };
  });
}

interface RevokeBody {
  amount?: number;
  revokeAll?: boolean;
  sourceTransactionId?: number;
  reason?: string;
  internalMemo?: string;
  referenceId?: string;
  idempotencyKey?: string;
}

/**
 * 회수 가능액 계산. sourceTransactionId가 있으면 그 지급건 기준(지급액 - 기존 회수액)으로 상한을 잡고,
 * 없으면 현재 버킷 잔액 전체를 상한으로 잡는다("사용되지 않은 포인트만" — 버킷 잔액 자체가 이미
 * 사용분을 뺀 미사용 잔액이므로, 잔액을 넘는 회수는 항상 거부한다).
 */
async function resolveRevokeAmount(
  targetUserId: number,
  assetType: AssetType,
  body: RevokeBody,
): Promise<number> {
  const wallet = await getWallet(targetUserId);
  const currentBalance = balanceFromSummary(wallet, assetType);

  if (body.sourceTransactionId) {
    const [rows] = await pool.query<any[]>(
      `SELECT wt.* FROM wallet_transactions wt
         JOIN pay_wallets w ON w.id = wt.wallet_id
        WHERE wt.id = ? AND w.user_id = ? AND wt.asset_type = ?`,
      [body.sourceTransactionId, targetUserId, assetType],
    );
    const grant = rows[0];
    const isGrantType = grant && typeof grant.transaction_type === 'string' && grant.transaction_type.endsWith('_GRANT');
    if (!grant || grant.amount <= 0 || !isGrantType) {
      throw new AdminWalletRouteError('ADMIN_ADJUSTMENT_NOT_ALLOWED', '회수 대상 지급 거래를 찾을 수 없습니다', 400);
    }
    const [revokedRows] = await pool.query<any[]>(
      `SELECT COALESCE(SUM(-amount), 0) AS revoked FROM wallet_transactions
        WHERE reference_type = 'ADMIN_GRANT_REVERSAL' AND reference_id = ?`,
      [String(body.sourceTransactionId)],
    );
    const alreadyRevoked = Number(revokedRows[0]?.revoked ?? 0);
    const grantRemaining = Number(grant.amount) - alreadyRevoked;
    const requested = body.revokeAll ? grantRemaining : Number(body.amount);
    if (!Number.isFinite(requested) || requested <= 0) {
      throw new AdminWalletRouteError('INVALID_REQUEST', 'amount 또는 revokeAll이 필요합니다');
    }
    if (requested > grantRemaining) {
      throw new AdminWalletRouteError(
        'ADMIN_ADJUSTMENT_NOT_ALLOWED',
        `해당 지급건에서 회수 가능한 금액(${grantRemaining})을 초과했습니다`,
      );
    }
    if (requested > currentBalance) {
      throw new WalletError(WalletErrorCode.INSUFFICIENT_BALANCE, '이미 사용되어 잔액이 부족합니다');
    }
    return requested;
  }

  const requested = body.revokeAll ? currentBalance : Number(body.amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new AdminWalletRouteError('INVALID_REQUEST', 'amount 또는 revokeAll이 필요합니다');
  }
  if (requested > currentBalance) {
    throw new WalletError(WalletErrorCode.INSUFFICIENT_BALANCE, `회수 가능액(${currentBalance})을 초과했습니다`);
  }
  return requested;
}

function parseUserId(req: Request, res: Response): number | null {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'userId is invalid' });
    return null;
  }
  return userId;
}

// ─── 조회 ────────────────────────────────────────────────────────────────

// GET /api/admin/users/:userId/wallet
router.get('/users/:userId/wallet', requireAdmin, async (req: Request, res: Response) => {
  const userId = parseUserId(req, res);
  if (userId === null) return;
  try {
    res.json(await getWallet(userId));
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/admin/users/:userId/wallet/transactions
router.get('/users/:userId/wallet/transactions', requireAdmin, async (req: Request, res: Response) => {
  const userId = parseUserId(req, res);
  if (userId === null) return;
  const { limit, offset, assetType, from, to } = req.query as Record<string, string | undefined>;
  try {
    const result = await getTransactions(userId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      assetType: assetType as AssetType | undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    res.json(result);
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/admin/wallet-adjustments
router.get('/wallet-adjustments', requireAdmin, async (req: Request, res: Response) => {
  const { userId, administratorId, assetType, adjustmentType, limit, offset } = req.query as Record<
    string,
    string | undefined
  >;
  const conditions: string[] = [];
  const params: any[] = [];
  if (userId) {
    conditions.push('a.user_id = ?');
    params.push(Number(userId));
  }
  if (administratorId) {
    conditions.push('a.administrator_id = ?');
    params.push(Number(administratorId));
  }
  if (assetType) {
    conditions.push('a.asset_type = ?');
    params.push(assetType);
  }
  if (adjustmentType) {
    conditions.push('a.adjustment_type = ?');
    params.push(adjustmentType);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const off = Math.max(Number(offset) || 0, 0);

  try {
    const [rows] = await pool.query<any[]>(
      `SELECT a.*, u.username AS user_username, admin_u.username AS administrator_username
         FROM admin_wallet_adjustments a
         JOIN users u ON u.id = a.user_id
         JOIN users admin_u ON admin_u.id = a.administrator_id
         ${where}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ? OFFSET ?`,
      [...params, lim, off],
    );
    const [countRows] = await pool.query<any[]>(
      `SELECT COUNT(*) AS total FROM admin_wallet_adjustments a ${where}`,
      params,
    );
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        administratorId: r.administrator_id,
        administratorUsername: r.administrator_username,
        userId: r.user_id,
        userUsername: r.user_username,
        walletTransactionId: r.wallet_transaction_id,
        adjustmentType: r.adjustment_type,
        assetType: r.asset_type,
        amount: r.amount,
        reason: r.reason,
        internalMemo: r.internal_memo,
        referenceId: r.reference_id,
        requestIp: r.request_ip,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      total: countRows[0]?.total ?? 0,
      limit: lim,
      offset: off,
    });
  } catch (err) {
    handleError(err, res);
  }
});

// ─── 공통 body 파싱 ──────────────────────────────────────────────────────

interface GrantBody {
  amount?: number;
  reason?: string;
  internalMemo?: string;
  expiresAt?: string;
  referenceId?: string;
  idempotencyKey?: string;
}

function parseGrantBody(req: Request, res: Response): Required<Pick<GrantBody, 'amount' | 'reason' | 'idempotencyKey'>> & GrantBody | null {
  const { amount, reason, internalMemo, expiresAt, referenceId, idempotencyKey } = req.body as GrantBody;
  if (!Number.isFinite(amount) || (amount as number) <= 0) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'amount는 양수여야 합니다' });
    return null;
  }
  if (!reason) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'reason은 필수입니다' });
    return null;
  }
  if (!idempotencyKey) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'idempotencyKey는 필수입니다' });
    return null;
  }
  return { amount: amount as number, reason, internalMemo, expiresAt, referenceId, idempotencyKey };
}

// ─── 테스트포인트 (§10) ──────────────────────────────────────────────────

// POST /api/admin/users/:userId/wallet/test-points/grant
router.post('/users/:userId/wallet/test-points/grant', requireAdminOrDeveloper, async (req: Request, res: Response) => {
  const userId = parseUserId(req, res);
  if (userId === null) return;
  const body = parseGrantBody(req, res);
  if (!body) return;

  try {
    assertTestAssetAllowed(req, userId);
    const result = await performAdjustment({
      administratorId: req.user!.userId,
      targetUserId: userId,
      adjustmentType: 'ADMIN_POINT_GRANT',
      assetType: 'TEST_POINT',
      amount: body.amount,
      reason: body.reason,
      internalMemo: body.internalMemo,
      referenceId: body.referenceId,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      idempotencyKey: body.idempotencyKey,
      requestIp: req.ip ?? null,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    handleError(err, res);
  }
});

// POST /api/admin/users/:userId/wallet/test-points/revoke
router.post('/users/:userId/wallet/test-points/revoke', requireAdminOrDeveloper, async (req: Request, res: Response) => {
  const userId = parseUserId(req, res);
  if (userId === null) return;
  const { reason, internalMemo, referenceId, idempotencyKey, ...revokeBody } = req.body as RevokeBody & {
    reason?: string;
    internalMemo?: string;
    referenceId?: string;
    idempotencyKey?: string;
  };

  try {
    assertTestAssetAllowed(req, userId);
    if (!reason) throw new AdminWalletRouteError('INVALID_REQUEST', 'reason은 필수입니다');
    if (!idempotencyKey) throw new AdminWalletRouteError('INVALID_REQUEST', 'idempotencyKey는 필수입니다');

    const revokeAmount = await resolveRevokeAmount(userId, 'TEST_POINT', revokeBody);
    const result = await performAdjustment({
      administratorId: req.user!.userId,
      targetUserId: userId,
      adjustmentType: 'ADMIN_POINT_REVOKE',
      assetType: 'TEST_POINT',
      amount: -revokeAmount,
      reason,
      internalMemo,
      referenceType: revokeBody.sourceTransactionId ? 'ADMIN_GRANT_REVERSAL' : undefined,
      referenceId: revokeBody.sourceTransactionId ? String(revokeBody.sourceTransactionId) : referenceId,
      idempotencyKey,
      requestIp: req.ip ?? null,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    handleError(err, res);
  }
});

// ─── 테스트머니 — test-points와 동일하게 TEST_POINT_ENABLED/운영차단/ADMIN·DEVELOPER 게이팅 적용 ──

// POST /api/admin/users/:userId/wallet/test-money/grant
router.post('/users/:userId/wallet/test-money/grant', requireAdminOrDeveloper, async (req: Request, res: Response) => {
  const userId = parseUserId(req, res);
  if (userId === null) return;
  const body = parseGrantBody(req, res);
  if (!body) return;

  try {
    assertTestAssetAllowed(req, userId);
    const result = await performAdjustment({
      administratorId: req.user!.userId,
      targetUserId: userId,
      adjustmentType: 'ADMIN_MONEY_GRANT',
      assetType: 'MONEY',
      amount: body.amount,
      reason: body.reason,
      internalMemo: body.internalMemo,
      referenceId: body.referenceId,
      idempotencyKey: body.idempotencyKey,
      requestIp: req.ip ?? null,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    handleError(err, res);
  }
});

// POST /api/admin/users/:userId/wallet/test-money/revoke
router.post('/users/:userId/wallet/test-money/revoke', requireAdminOrDeveloper, async (req: Request, res: Response) => {
  const userId = parseUserId(req, res);
  if (userId === null) return;
  const { reason, internalMemo, referenceId, idempotencyKey, ...revokeBody } = req.body as RevokeBody & {
    reason?: string;
    internalMemo?: string;
    referenceId?: string;
    idempotencyKey?: string;
  };

  try {
    assertTestAssetAllowed(req, userId);
    if (!reason) throw new AdminWalletRouteError('INVALID_REQUEST', 'reason은 필수입니다');
    if (!idempotencyKey) throw new AdminWalletRouteError('INVALID_REQUEST', 'idempotencyKey는 필수입니다');

    const revokeAmount = await resolveRevokeAmount(userId, 'MONEY', revokeBody);
    const result = await performAdjustment({
      administratorId: req.user!.userId,
      targetUserId: userId,
      adjustmentType: 'ADMIN_MONEY_REVOKE',
      assetType: 'MONEY',
      amount: -revokeAmount,
      reason,
      internalMemo,
      referenceType: revokeBody.sourceTransactionId ? 'ADMIN_GRANT_REVERSAL' : undefined,
      referenceId: revokeBody.sourceTransactionId ? String(revokeBody.sourceTransactionId) : referenceId,
      idempotencyKey,
      requestIp: req.ip ?? null,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    handleError(err, res);
  }
});

// ─── 일반 조정 (BALANCE_CORRECTION 등, requireAdmin만) ──────────────────────

const VALID_ASSET_TYPES: AssetType[] = ['MONEY', 'EARNED_POINT', 'EVENT_POINT', 'TEST_POINT', 'COMPENSATION_POINT'];
const VALID_ADJUSTMENT_TYPES: AdjustmentType[] = [
  'ADMIN_POINT_GRANT',
  'ADMIN_POINT_REVOKE',
  'ADMIN_MONEY_GRANT',
  'ADMIN_MONEY_REVOKE',
  'BALANCE_CORRECTION',
];

// POST /api/admin/users/:userId/wallet/adjustments
// body: { assetType, adjustmentType, amount, reason, internalMemo?, expiresAt?, referenceId?, idempotencyKey,
//         revokeAll?, sourceTransactionId? } — *_REVOKE 타입일 때만 revokeAll/sourceTransactionId 사용
router.post('/users/:userId/wallet/adjustments', requireAdmin, async (req: Request, res: Response) => {
  const userId = parseUserId(req, res);
  if (userId === null) return;
  const {
    assetType,
    adjustmentType,
    amount,
    reason,
    internalMemo,
    expiresAt,
    referenceId,
    idempotencyKey,
    revokeAll,
    sourceTransactionId,
  } = req.body as {
    assetType?: AssetType;
    adjustmentType?: AdjustmentType;
    amount?: number;
    reason?: string;
    internalMemo?: string;
    expiresAt?: string;
    referenceId?: string;
    idempotencyKey?: string;
    revokeAll?: boolean;
    sourceTransactionId?: number;
  };

  try {
    if (!assetType || !VALID_ASSET_TYPES.includes(assetType)) {
      throw new AdminWalletRouteError('INVALID_REQUEST', 'assetType이 유효하지 않습니다');
    }
    if (!adjustmentType || !VALID_ADJUSTMENT_TYPES.includes(adjustmentType)) {
      throw new AdminWalletRouteError('INVALID_REQUEST', 'adjustmentType이 유효하지 않습니다');
    }
    if (!reason) throw new AdminWalletRouteError('INVALID_REQUEST', 'reason은 필수입니다');
    if (!idempotencyKey) throw new AdminWalletRouteError('INVALID_REQUEST', 'idempotencyKey는 필수입니다');

    const isPointAdjust = adjustmentType === 'ADMIN_POINT_GRANT' || adjustmentType === 'ADMIN_POINT_REVOKE';
    const isMoneyAdjust = adjustmentType === 'ADMIN_MONEY_GRANT' || adjustmentType === 'ADMIN_MONEY_REVOKE';
    if (isPointAdjust && assetType === 'MONEY') {
      throw new AdminWalletRouteError('INVALID_REQUEST', 'ADMIN_POINT_* 조정은 MONEY에 사용할 수 없습니다');
    }
    if (isMoneyAdjust && assetType !== 'MONEY') {
      throw new AdminWalletRouteError('INVALID_REQUEST', 'ADMIN_MONEY_* 조정은 MONEY에만 사용할 수 있습니다');
    }
    if (assetType === 'TEST_POINT') {
      assertTestAssetAllowed(req, userId);
    }

    let signedAmount: number;
    if (adjustmentType === 'BALANCE_CORRECTION') {
      if (!Number.isFinite(amount) || amount === 0) {
        throw new AdminWalletRouteError('INVALID_REQUEST', 'amount는 0이 아닌 숫자여야 합니다');
      }
      signedAmount = amount as number;
    } else if (adjustmentType.endsWith('_REVOKE')) {
      const revokeAmount = await resolveRevokeAmount(userId, assetType, {
        amount,
        revokeAll,
        sourceTransactionId,
      });
      signedAmount = -revokeAmount;
    } else {
      if (!Number.isFinite(amount) || (amount as number) <= 0) {
        throw new AdminWalletRouteError('INVALID_REQUEST', 'amount는 양수여야 합니다');
      }
      signedAmount = amount as number;
    }

    const result = await performAdjustment({
      administratorId: req.user!.userId,
      targetUserId: userId,
      adjustmentType,
      assetType,
      amount: signedAmount,
      reason,
      internalMemo,
      referenceType:
        adjustmentType.endsWith('_REVOKE') && sourceTransactionId ? 'ADMIN_GRANT_REVERSAL' : undefined,
      referenceId: sourceTransactionId ? String(sourceTransactionId) : referenceId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      idempotencyKey,
      requestIp: req.ip ?? null,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
