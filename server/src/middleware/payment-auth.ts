// 결제 인증세션 / 경매 입장세션 가드 미들웨어.
// 이번 Phase에서는 정의·export만 하고, 실제 입찰/결제 라우트 부착은 Phase 5에서 수행한다
// (단, /api/payment-auth, /api/auctions/:id/enter 흐름 자체는 이 Phase에서 완전히 동작한다).

import { Request, Response, NextFunction } from 'express';
import {
  getSessionTokenFromRequest,
  validateSessionToken,
  exceedsHighValueThreshold,
  PaymentAuthSessionErrorCode,
  AuthenticationPurpose,
} from '../services/payment-auth-session';
import {
  getAuctionAccessInfo,
  findActiveAccessSession,
  getEntryAuthRequirement,
  AuctionAccessErrorCode,
} from '../services/auction-access';

/** amountResolver가 { amount, thresholdOverride }를 반환하면 경매별 재인증 기준금액을 우선 적용할 수 있다. */
type AmountResolverResult = number | { amount: number; thresholdOverride?: number | null };
type AmountResolver = (req: Request) => AmountResolverResult | Promise<AmountResolverResult>;

const HIGH_VALUE_VARIANT: Record<AuthenticationPurpose, AuthenticationPurpose> = {
  PAYMENT: 'HIGH_VALUE_PAYMENT',
  AUCTION_ENTRY: 'HIGH_VALUE_BID',
  HIGH_VALUE_PAYMENT: 'HIGH_VALUE_PAYMENT',
  HIGH_VALUE_BID: 'HIGH_VALUE_BID',
};

const THRESHOLD_KIND: Record<AuthenticationPurpose, 'PAYMENT' | 'BID'> = {
  PAYMENT: 'PAYMENT',
  HIGH_VALUE_PAYMENT: 'PAYMENT',
  AUCTION_ENTRY: 'BID',
  HIGH_VALUE_BID: 'BID',
};

function getDeviceId(req: Request): string | null {
  const header = req.headers['x-device-id'];
  return typeof header === 'string' && header.trim() ? header.trim() : null;
}

/**
 * 결제 인증세션 가드. purpose(또는 그 고액 버전)의 유효한 ACTIVE 세션이 없으면 401.
 * amountResolver가 주어지고 금액이 고액 기준을 넘는데 세션이 고액 목적이 아니면 403(HIGH_VALUE_REAUTH_REQUIRED).
 */
export function requirePaymentAuth(purpose: AuthenticationPurpose, amountResolver?: AmountResolver) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const token = getSessionTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ error: PaymentAuthSessionErrorCode.EXPIRED, message: '결제 인증이 필요합니다' });
      return;
    }

    try {
      const result = await validateSessionToken(token, { deviceId: getDeviceId(req) });
      if (!result.valid) {
        const code = result.reason === 'REVOKED' || result.reason === 'DEVICE_MISMATCH'
          ? PaymentAuthSessionErrorCode.REVOKED
          : PaymentAuthSessionErrorCode.EXPIRED;
        res.status(401).json({ error: code, message: '결제 인증세션이 유효하지 않습니다' });
        return;
      }
      if (result.session.userId !== userId) {
        res.status(401).json({ error: PaymentAuthSessionErrorCode.REVOKED, message: '결제 인증세션이 유효하지 않습니다' });
        return;
      }

      const highValuePurpose = HIGH_VALUE_VARIANT[purpose];
      const sessionSatisfiesPurpose = result.session.purpose === purpose || result.session.purpose === highValuePurpose;
      if (!sessionSatisfiesPurpose) {
        res.status(401).json({ error: PaymentAuthSessionErrorCode.EXPIRED, message: '요청 목적에 맞는 결제 인증세션이 아닙니다' });
        return;
      }

      if (amountResolver) {
        const resolved = await amountResolver(req);
        const amount = typeof resolved === 'number' ? resolved : resolved.amount;
        const override = typeof resolved === 'number' ? undefined : resolved.thresholdOverride;
        const alreadyHighValue = result.session.purpose === highValuePurpose;
        if (!alreadyHighValue && exceedsHighValueThreshold(THRESHOLD_KIND[purpose], amount, override)) {
          res.status(403).json({
            error: PaymentAuthSessionErrorCode.HIGH_VALUE_REAUTH_REQUIRED,
            message: '고액 거래는 재인증이 필요합니다',
          });
          return;
        }
      }

      (req as any).paymentAuthSession = result.session;
      next();
    } catch (err) {
      console.error('[middleware] requirePaymentAuth', err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}

/** 경매 입장세션 가드 — req.params.auctionId 또는 req.params.id를 대상 경매로 사용한다. */
export function requireAuctionAccess() {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
    const auctionId = req.params.auctionId ? String(req.params.auctionId) : req.params.id ? String(req.params.id) : null;
    if (!auctionId) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'auctionId is required' });
      return;
    }

    try {
      const auction = await getAuctionAccessInfo(auctionId);
      if (!auction) {
        res.status(404).json({ error: 'auction not found' });
        return;
      }

      const requirement = getEntryAuthRequirement(auction);
      if (!requirement.requireEntryAuth) {
        next();
        return;
      }

      const session = await findActiveAccessSession(userId, auction);
      if (!session) {
        res.status(403).json({ error: AuctionAccessErrorCode.ACCESS_REQUIRED, message: '경매 입장 인증이 필요합니다' });
        return;
      }

      (req as any).auctionAccessSession = session;
      next();
    } catch (err) {
      console.error('[middleware] requireAuctionAccess', err);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}
