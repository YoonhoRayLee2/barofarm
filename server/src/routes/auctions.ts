import { Router, Request, Response } from 'express';
import pool from '../db/mysql';
import { getRecommendations, hasBidOrPurchaseHistory } from '../utils/productRecommender';
import { createNotification } from '../services/notifications';
import { requireAuth, optionalAuth } from '../middleware/auth';
import {
  getAuctionAccessInfo,
  assertCanParticipate,
  getEntryAuthRequirement,
  findActiveAccessSession,
  issueAccessSession,
  revokeAccessSession,
  AuctionAccessError,
} from '../services/auction-access';
import { hasPaymentPassword, verifyCredential, PaymentCredentialError } from '../services/payment-credential';
import { issueSession as issuePaymentAuthSession } from '../services/payment-auth-session';

const router = Router();

type DeliveryStatus = 'payment_complete' | 'shipped' | 'purchase_confirmed' | 'settlement_complete';
type ShippingFeeStatus = 'none' | 'pending' | 'paid';

interface AuctionRow {
  id: string;
  product_name: string;
  start_price: number;
  current_price: number;
  mode: string;
  delivery_status: DeliveryStatus;
  status: string;
  image_url: string | null;
  ends_at: string;
  seller_id: string;
  seller_name: string | null;
  seller_farm_zipcode: string | null;
  seller_allow_hanaro: number;
  top_bidder_id: string | null;
  buyer_name: string | null;
  delivery_name: string | null;
  delivery_phone: string | null;
  delivery_address: string | null;
  delivery_detail: string | null;
  delivery_zipcode: string | null;
  delivery_option: string;
  hanaro_mart_name: string | null;
  hanaro_mart_addr: string | null;
  tracking_company: string | null;
  tracking_number: string | null;
  buyer_tier: string;
  buyer_discount_rate: number;
  buyer_discount_amt: number;
  seller_fee_rate: number;
  seller_fee_amt: number;
  shipping_fee: number;
  shipping_fee_status: ShippingFeeStatus;
  unit_count?: number;
  unit_label?: string;
}

const AUCTION_QUERY = `
  SELECT
    a.id, a.product_name, a.start_price, a.current_price, a.mode,
    a.delivery_status, a.status, a.image_url, a.ends_at,
    a.seller_id, s.nickname AS seller_name, s.farm_zipcode AS seller_farm_zipcode,
    0 AS seller_allow_hanaro,
    a.top_bidder_id, b.nickname AS buyer_name,
    b.delivery_name, b.delivery_phone, b.delivery_address, b.delivery_detail, b.delivery_zipcode,
    b.delivery_option, b.hanaro_mart_name, b.hanaro_mart_addr,
    a.tracking_company, a.tracking_number,
    a.buyer_tier, a.buyer_discount_rate, a.buyer_discount_amt, a.seller_fee_rate, a.seller_fee_amt,
    a.shipping_fee, a.shipping_fee_status,
    a.unit_count, a.unit_label
  FROM auctions a
  LEFT JOIN users s ON s.id = a.seller_id
  LEFT JOIN users b ON b.id = a.top_bidder_id
  WHERE a.id = ?
`;

function formatAuction(row: AuctionRow, isParty = true) {
  return {
    auctionId:       row.id,
    productName:     row.product_name,
    startPrice:      Number(row.start_price),
    finalPrice:      Number(row.current_price),
    mode:            row.mode,
    deliveryStatus:  row.delivery_status,
    status:          row.status,
    imageUrl:        row.image_url ?? null,
    endsAt:          row.ends_at,
    sellerId:        row.seller_id,
    sellerName:          row.seller_name ?? null,
    sellerFarmZipcode:   row.seller_farm_zipcode ?? null,
    buyerId:             row.top_bidder_id ?? null,
    buyerName:       row.buyer_name ?? null,
    trackingCompany: row.tracking_company ?? null,
    trackingNumber:  row.tracking_number ?? null,
    buyerDelivery:   (row.top_bidder_id && isParty) ? (() => {
      const sellerAllowsHanaro = row.seller_allow_hanaro !== 0;
      const rawOption = row.delivery_option ?? 'standard';
      const effectiveOption = (rawOption === 'hanaro' && !sellerAllowsHanaro) ? 'standard' : rawOption;
      return {
        name:           row.delivery_name ?? null,
        phone:          row.delivery_phone ?? null,
        address:        row.delivery_address ?? null,
        detail:         row.delivery_detail ?? null,
        zipcode:        row.delivery_zipcode ?? null,
        option:         effectiveOption,
        hanaroMartName: effectiveOption === 'hanaro' ? (row.hanaro_mart_name ?? null) : null,
        hanaroMartAddr: effectiveOption === 'hanaro' ? (row.hanaro_mart_addr ?? null) : null,
        sellerAllowsHanaro,
      };
    })() : null,
    buyerTier:          row.buyer_tier,
    buyerDiscountRate:  Number(row.buyer_discount_rate),
    buyerDiscountAmt:   Number(row.buyer_discount_amt),
    sellerFeeRate:      Number(row.seller_fee_rate),
    sellerFeeAmt:       Number(row.seller_fee_amt),
    shippingFee:        Number(row.shipping_fee ?? 0),
    shippingFeeStatus:  row.shipping_fee_status ?? 'none',
    unitCount:          Number(row.unit_count ?? 1),
    unitLabel:          row.unit_label ?? '',
  };
}

// POST /api/auctions/batch-ship — 합배송 처리 (판매자: 구매자별 payment_complete 주문 일괄 배송비 자동 결제완료 처리)
router.post('/batch-ship', requireAuth, async (req: Request, res: Response) => {
  const sellerId = req.user!.userId;

  const { buyerId, auctionIds } = req.body as {
    buyerId?: number;
    auctionIds?: string[];
  };
  if (!buyerId || !Array.isArray(auctionIds) || auctionIds.length === 0) {
    res.status(400).json({ error: 'buyerId, auctionIds required' });
    return;
  }
  try {
    const placeholders = auctionIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, seller_id, top_bidder_id, delivery_status, shipping_fee_status FROM auctions WHERE id IN (${placeholders})`,
      auctionIds,
    ) as [unknown[], unknown];
    const list = rows as Array<{ id: string; seller_id: string; top_bidder_id: string | null; delivery_status: string; shipping_fee_status: string }>;

    for (const a of list) {
      if (String(a.seller_id) !== String(sellerId)) {
        res.status(403).json({ error: `auction ${a.id} does not belong to seller` });
        return;
      }
      if (String(a.top_bidder_id) !== String(buyerId)) {
        res.status(400).json({ error: `auction ${a.id} buyer mismatch` });
        return;
      }
      if (a.delivery_status !== 'payment_complete' || a.shipping_fee_status !== 'none') {
        res.status(400).json({ error: `auction ${a.id} is not eligible for batch-ship (must be payment_complete with no shipping fee)` });
        return;
      }
    }

    const [userRows] = await pool.execute(
      'SELECT seller_shipping_fee FROM users WHERE id = ?',
      [sellerId],
    ) as [unknown[], unknown];
    const shippingFee: number = (userRows as Array<{ seller_shipping_fee: number }>)[0]?.seller_shipping_fee ?? 3000;

    await pool.execute(
      `UPDATE auctions SET shipping_fee_status='paid', shipping_fee=? WHERE id IN (${placeholders})`,
      [shippingFee, ...auctionIds],
    );

    res.json({ ok: true, shippingFee, count: auctionIds.length });
  } catch (err) {
    console.error('[auctions] POST /batch-ship error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// PATCH /api/auctions/:id/pay-shipping-fee — 구매자 배송비 결제
router.patch('/:id/pay-shipping-fee', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;
  try {
    const [rows] = await pool.execute(AUCTION_QUERY, [id]) as [unknown[], unknown];
    const row = (rows as AuctionRow[])[0];
    if (!row) {
      res.status(404).json({ error: 'auction not found' });
      return;
    }
    if (String(row.top_bidder_id) !== String(userId)) {
      res.status(403).json({ error: '구매자만 배송비를 결제할 수 있습니다' });
      return;
    }
    if (row.shipping_fee_status !== 'pending') {
      res.status(400).json({ error: `shipping_fee_status is not pending (current: ${row.shipping_fee_status})` });
      return;
    }
    await pool.execute(
      'UPDATE auctions SET shipping_fee_status = ? WHERE id = ?',
      ['paid', id],
    );
    const [updated] = await pool.execute(AUCTION_QUERY, [id]) as [unknown[], unknown];
    res.json(formatAuction((updated as AuctionRow[])[0]));
  } catch (err) {
    console.error('[auctions] PATCH /:id/pay-shipping-fee error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/auctions/combinable-shipping?sellerId=&buyerId=
// 구매자가 해당 판매자에게 합배송 가능한지 조회 (미발송 주문 존재 여부)
router.get('/combinable-shipping', async (req: Request, res: Response) => {
  const { sellerId, buyerId } = req.query as { sellerId?: string; buyerId?: string };
  if (!sellerId || !buyerId) {
    res.status(400).json({ error: 'sellerId and buyerId are required' });
    return;
  }
  try {
    const [[combRows], [avgRows]] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) AS cnt FROM auctions
         WHERE seller_id = ? AND top_bidder_id = ? AND delivery_status = 'payment_complete'`,
        [sellerId, buyerId],
      ) as Promise<[unknown[], unknown]>,
      pool.execute(
        `SELECT AVG(DATEDIFF(shipped_at, created_at)) AS avg_days, COUNT(*) AS shipped_count
         FROM auctions
         WHERE seller_id = ? AND shipped_at IS NOT NULL`,
        [sellerId],
      ) as Promise<[unknown[], unknown]>,
    ]);
    const count = Number((combRows as Array<{ cnt: number }>)[0]?.cnt ?? 0);
    const avgRow = (avgRows as Array<{ avg_days: number | null; shipped_count: number }>)[0];
    const avgShippingDays =
      avgRow?.shipped_count > 0 && avgRow.avg_days != null
        ? Math.max(0, Math.round(avgRow.avg_days))
        : null;
    res.json({ combinable: count > 0, pendingCount: count, avgShippingDays });
  } catch (err) {
    console.error('[auctions] GET /combinable-shipping error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/auctions/:id/recommendations
router.get('/:id/recommendations', optionalAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    // 로그인 사용자가 구매+입찰 이력이 전무하면 추천을 숨긴다(비로그인은 기존 동작 유지).
    if (req.user && !(await hasBidOrPurchaseHistory(req.user.userId))) {
      res.json({ recommendations: [], noHistory: true });
      return;
    }
    const [rows] = await pool.execute(AUCTION_QUERY, [id]) as [unknown[], unknown];
    const row = (rows as AuctionRow[])[0];
    if (!row) {
      res.status(404).json({ error: 'auction not found' });
      return;
    }
    const recommendations = getRecommendations(row.product_name);
    res.json({ recommendations });
  } catch (err) {
    console.error('[auctions] GET /:id/recommendations error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/auctions/:id — 배송지 PII(buyerDelivery)는 거래 당사자(구매자/판매자)에게만 포함
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute(AUCTION_QUERY, [id]) as [unknown[], unknown];
    const row = (rows as AuctionRow[])[0];
    if (!row) {
      res.status(404).json({ error: 'auction not found' });
      return;
    }
    const isParty = req.user != null &&
      (String(req.user.userId) === String(row.seller_id) || String(req.user.userId) === String(row.top_bidder_id));
    res.json(formatAuction(row, isParty));
  } catch (err) {
    console.error('[auctions] GET /:id error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// PATCH /api/auctions/:id/delivery-status
router.patch('/:id/delivery-status', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;
  const { status, trackingCompany, trackingNumber } = req.body as {
    status?: string;
    trackingCompany?: string;
    trackingNumber?: string;
  };

  if (!status) {
    res.status(400).json({ error: 'status is required' });
    return;
  }

  try {
    const [rows] = await pool.execute(AUCTION_QUERY, [id]) as [unknown[], unknown];
    const row = (rows as AuctionRow[])[0];
    if (!row) {
      res.status(404).json({ error: 'auction not found' });
      return;
    }

    const current = row.delivery_status;
    const next = status as DeliveryStatus;

    // 전환 규칙 검증
    const allowed =
      (current === 'payment_complete'   && next === 'shipped'              && String(userId) === String(row.seller_id))     ||
      (current === 'shipped'            && next === 'purchase_confirmed'   && String(userId) === String(row.top_bidder_id)) ||
      (current === 'purchase_confirmed' && next === 'settlement_complete'  && String(userId) === String(row.seller_id));

    if (!allowed) {
      res.status(400).json({ error: '상태 전환이 불가합니다' });
      return;
    }

    // payment_complete → shipped 전환 시 배송비 결제 및 운송장 필수 검증
    if (next === 'shipped') {
      if (row.shipping_fee > 0 && row.shipping_fee_status !== 'paid') {
        res.status(400).json({ error: '배송비 결제가 완료되지 않았습니다' });
        return;
      }
      if (!trackingCompany || !trackingCompany.trim()) {
        res.status(400).json({ error: '택배사를 선택해주세요' });
        return;
      }
      if (!trackingNumber || !trackingNumber.trim()) {
        res.status(400).json({ error: '운송장 번호를 입력해주세요' });
        return;
      }
      await pool.execute(
        'UPDATE auctions SET delivery_status = ?, shipped_at = NOW(), tracking_company = ?, tracking_number = ? WHERE id = ?',
        [next, trackingCompany.trim(), trackingNumber.trim(), id],
      );
      if (row.top_bidder_id) {
        try {
          await createNotification(Number(row.top_bidder_id), {
            type: 'shipping',
            title: '상품이 발송되었어요',
            body: `${row.product_name} 상품이 발송되었습니다.`,
            link: `/app/order-detail/${id}`,
          });
        } catch (notifErr) {
          console.error('[auctions] shipping notification failed:', notifErr);
        }
      }
    } else {
      await pool.execute(
        'UPDATE auctions SET delivery_status = ? WHERE id = ?',
        [next, id],
      );
    }

    // 업데이트 후 최신 row 재조회
    const [updated] = await pool.execute(AUCTION_QUERY, [id]) as [unknown[], unknown];
    res.json(formatAuction((updated as AuctionRow[])[0]));
  } catch (err) {
    console.error('[auctions] PATCH /:id/delivery-status error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// ─── 경매 입장 인증 (§5) ──────────────────────────────────────────────────────

function getDeviceId(req: Request): string | null {
  const header = req.headers['x-device-id'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const body = (req.body as { deviceId?: string })?.deviceId;
  return body ? String(body).trim() : null;
}

// POST /api/auctions/:id/enter — 입장인증 세션 발급(흐름: 참여가능 확인 → 비번설정 확인 → 기존세션 확인 → 없으면 비번검증 → 발급)
router.post('/:id/enter', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = String(req.params.id);

  try {
    const auction = await getAuctionAccessInfo(id);
    if (!auction) {
      res.status(404).json({ error: 'auction not found' });
      return;
    }

    await assertCanParticipate(userId, auction);

    const requirement = getEntryAuthRequirement(auction);
    if (!requirement.requireEntryAuth) {
      res.json({ ok: true, requiresEntryAuth: false });
      return;
    }

    if (!(await hasPaymentPassword(userId))) {
      res.status(400).json({ error: 'PAYMENT_PASSWORD_NOT_SET', message: '결제비밀번호를 먼저 설정해주세요' });
      return;
    }

    // ALWAYS 모드가 아니면 기존 유효 입장세션 재사용
    if (!requirement.forceReauthEveryTime) {
      const existing = await findActiveAccessSession(userId, auction);
      if (existing) {
        res.json({ ok: true, requiresEntryAuth: true, existing: true, expiresAt: existing.expiresAt.toISOString() });
        return;
      }
    }

    const { password } = req.body as { password?: string };
    if (!password) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: '경매 입장을 위해 결제비밀번호 확인이 필요합니다' });
      return;
    }

    await verifyCredential(userId, password);

    const deviceId = getDeviceId(req);
    const paymentAuthSession = await issuePaymentAuthSession({
      userId,
      purpose: 'AUCTION_ENTRY',
      deviceId,
      scopeType: auction.auctionGroupId ? 'GROUP' : 'AUCTION',
      scopeId: auction.auctionGroupId ?? auction.id,
    });

    const accessSession = await issueAccessSession({
      userId,
      auction,
      paymentAuthSessionId: paymentAuthSession.sessionId,
    });

    res.status(201).json({
      ok: true,
      requiresEntryAuth: true,
      existing: false,
      scopeType: accessSession.scopeType,
      expiresAt: accessSession.expiresAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof AuctionAccessError) {
      res.status(403).json({ error: err.code, message: err.message });
      return;
    }
    if (err instanceof PaymentCredentialError) {
      res.status(400).json({ error: err.code, message: err.message });
      return;
    }
    console.error('[auctions] POST /:id/enter error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/auctions/:id/access-status — 입장 인증 필요 여부 + 현재 세션 유효성 확인
router.get('/:id/access-status', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = String(req.params.id);

  try {
    const auction = await getAuctionAccessInfo(id);
    if (!auction) {
      res.status(404).json({ error: 'auction not found' });
      return;
    }

    const requirement = getEntryAuthRequirement(auction);
    if (!requirement.requireEntryAuth) {
      res.json({ requiresEntryAuth: false, hasAccess: true });
      return;
    }

    const session = await findActiveAccessSession(userId, auction);
    res.json({
      requiresEntryAuth: true,
      hasAccess: session != null,
      scopeType: session?.scopeType ?? null,
      expiresAt: session?.expiresAt.toISOString() ?? null,
      highValueReauthAmount: auction.highValueReauthAmount,
    });
  } catch (err) {
    console.error('[auctions] GET /:id/access-status error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/auctions/:id/access-session — 사용자 직접 입장세션 해제
router.delete('/:id/access-session', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const id = String(req.params.id);

  try {
    const auction = await getAuctionAccessInfo(id);
    if (!auction) {
      res.status(404).json({ error: 'auction not found' });
      return;
    }
    await revokeAccessSession(userId, auction, 'USER_REVOKED');
    res.json({ ok: true });
  } catch (err) {
    console.error('[auctions] DELETE /:id/access-session error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
