import { Router, Request, Response } from 'express';
import pool from '../db/mysql';

const router = Router();

type DeliveryStatus = 'payment_complete' | 'shipped' | 'purchase_confirmed' | 'settlement_complete';

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
}

const AUCTION_QUERY = `
  SELECT
    a.id, a.product_name, a.start_price, a.current_price, a.mode,
    a.delivery_status, a.status, a.image_url, a.ends_at,
    a.seller_id, s.nickname AS seller_name, s.farm_zipcode AS seller_farm_zipcode,
    a.top_bidder_id, b.nickname AS buyer_name,
    b.delivery_name, b.delivery_phone, b.delivery_address, b.delivery_detail, b.delivery_zipcode,
    b.delivery_option, b.hanaro_mart_name, b.hanaro_mart_addr,
    a.tracking_company, a.tracking_number,
    a.buyer_tier, a.buyer_discount_rate, a.buyer_discount_amt, a.seller_fee_rate, a.seller_fee_amt
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
    buyerDelivery:   row.top_bidder_id ? {
      name:           row.delivery_name ?? null,
      phone:          row.delivery_phone ?? null,
      address:        row.delivery_address ?? null,
      detail:         row.delivery_detail ?? null,
      zipcode:        row.delivery_zipcode ?? null,
      option:         row.delivery_option ?? 'standard',
      hanaroMartName: row.hanaro_mart_name ?? null,
      hanaroMartAddr: row.hanaro_mart_addr ?? null,
    } : null,
    buyerTier:          row.buyer_tier,
    buyerDiscountRate:  Number(row.buyer_discount_rate),
    buyerDiscountAmt:   Number(row.buyer_discount_amt),
    sellerFeeRate:      Number(row.seller_fee_rate),
    sellerFeeAmt:       Number(row.seller_fee_amt),
  };
}

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
      (current === 'payment_complete'   && next === 'shipped'             && String(userId) === String(row.seller_id))   ||
      (current === 'shipped'            && next === 'purchase_confirmed'   && String(userId) === String(row.top_bidder_id)) ||
      (current === 'purchase_confirmed' && next === 'settlement_complete'  && String(userId) === String(row.seller_id));

    if (!allowed) {
      res.status(400).json({ error: `invalid transition: ${current} → ${next}` });
      return;
    }

    // 발송 처리 시 택배사·운송장 번호 필수
    if (next === 'shipped') {
      if (!trackingCompany || !trackingCompany.trim()) {
        res.status(400).json({ error: '택배사를 선택해주세요' });
        return;
      }
      if (!trackingNumber || !trackingNumber.trim()) {
        res.status(400).json({ error: '운송장 번호를 입력해주세요' });
        return;
      }
      await pool.execute(
        'UPDATE auctions SET delivery_status = ?, tracking_company = ?, tracking_number = ? WHERE id = ?',
        [next, trackingCompany.trim(), trackingNumber.trim(), id],
      );
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
