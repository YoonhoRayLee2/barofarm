import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/mysql';
import { getRecommendations } from '../utils/productRecommender';
import { createNotification } from '../services/notifications';

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

function formatAuction(row: AuctionRow) {
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
    buyerDelivery:   row.top_bidder_id ? (() => {
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
router.post('/batch-ship', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: '인증이 필요합니다' });
    return;
  }
  let sellerId: number;
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
    sellerId = decoded.userId;
  } catch {
    res.status(401).json({ error: '인증이 필요합니다' });
    return;
  }

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
router.patch('/:id/pay-shipping-fee', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
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
router.get('/:id/recommendations', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
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

// GET /api/auctions/:id
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute(AUCTION_QUERY, [id]) as [unknown[], unknown];
    const row = (rows as AuctionRow[])[0];
    if (!row) {
      res.status(404).json({ error: 'auction not found' });
      return;
    }
    res.json(formatAuction(row));
  } catch (err) {
    console.error('[auctions] GET /:id error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// PATCH /api/auctions/:id/delivery-status
router.patch('/:id/delivery-status', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, userId, trackingCompany, trackingNumber } = req.body as {
    status?: string;
    userId?: string;
    trackingCompany?: string;
    trackingNumber?: string;
  };

  if (!status || !userId) {
    res.status(400).json({ error: 'status and userId are required' });
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

export default router;
