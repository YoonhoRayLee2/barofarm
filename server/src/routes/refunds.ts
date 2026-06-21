import { Router, Request, Response } from 'express';
import pool from '../db/mysql';
import { createNotification } from '../services/notifications';

const router = Router();

// 신청 가능한 주문(배송) 상태
const REFUNDABLE_STATUSES = ['shipped', 'purchase_confirmed'];

function serialize(r: any) {
  return {
    id: r.id,
    auctionId: r.auction_id,
    buyerId: r.buyer_id,
    sellerId: r.seller_id,
    reason: r.reason,
    status: r.status,
    refundAmount: Number(r.refund_amount),
    rejectReason: r.reject_reason ?? null,
    requestedAt: r.requested_at,
    decidedAt: r.decided_at ?? null,
    completedAt: r.completed_at ?? null,
    productName: r.product_name ?? null,
    imageUrl: r.image_url ?? null,
  };
}

// GET /api/refunds/by-auction/:auctionId — 해당 주문의 최신 환불 건 (없으면 null)
router.get('/by-auction/:auctionId', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM refunds WHERE auction_id = ? ORDER BY id DESC LIMIT 1',
      [req.params.auctionId],
    );
    res.json(rows.length ? serialize(rows[0]) : null);
  } catch (err) {
    console.error('[refunds] GET /by-auction', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/refunds?sellerId= | ?buyerId= — 목록
router.get('/', async (req: Request, res: Response) => {
  const sellerId = req.query.sellerId ? Number(req.query.sellerId) : null;
  const buyerId = req.query.buyerId ? Number(req.query.buyerId) : null;
  if (!sellerId && !buyerId) return res.status(400).json({ error: 'sellerId or buyerId required' });

  try {
    const col = sellerId ? 'r.seller_id' : 'r.buyer_id';
    const val = sellerId ?? buyerId;
    const [rows] = await pool.query<any[]>(
      `SELECT r.*, a.product_name, a.image_url
         FROM refunds r JOIN auctions a ON a.id = r.auction_id
        WHERE ${col} = ?
        ORDER BY r.id DESC`,
      [val],
    );
    res.json(rows.map(serialize));
  } catch (err) {
    console.error('[refunds] GET /', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/refunds — 환불 신청 (구매자)
// body: { auctionId, buyerId, reason }
router.post('/', async (req: Request, res: Response) => {
  const { auctionId, buyerId, reason } = req.body;
  if (!auctionId || !buyerId || !reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'auctionId, buyerId, reason required' });
  }

  try {
    const [aRows] = await pool.query<any[]>(
      `SELECT seller_id, top_bidder_id, delivery_status, product_name,
              current_price, buyer_discount_amt, shipping_fee, shipping_fee_status
         FROM auctions WHERE id = ?`,
      [auctionId],
    );
    const a = aRows[0];
    if (!a) return res.status(404).json({ error: 'order not found' });
    if (String(a.top_bidder_id) !== String(buyerId)) {
      return res.status(403).json({ error: 'not your order' });
    }
    if (!REFUNDABLE_STATUSES.includes(a.delivery_status)) {
      return res.status(409).json({ error: 'not refundable in current status' });
    }

    // 진행 중인 환불(신청/승인)이 있으면 중복 차단
    const [actRows] = await pool.query<any[]>(
      "SELECT id FROM refunds WHERE auction_id = ? AND status IN ('requested','approved') LIMIT 1",
      [auctionId],
    );
    if (actRows.length) return res.status(409).json({ error: 'refund already in progress' });

    // 환불금액 = 실결제 상품가(현재가 - 할인) + 결제된 배송비
    const itemPaid = Number(a.current_price) - Number(a.buyer_discount_amt ?? 0);
    const shippingPaid = a.shipping_fee_status === 'paid' ? Number(a.shipping_fee ?? 0) : 0;
    const refundAmount = Math.max(0, itemPaid + shippingPaid);

    const [result] = await pool.query<any>(
      `INSERT INTO refunds (auction_id, buyer_id, seller_id, reason, status, refund_amount)
       VALUES (?, ?, ?, ?, 'requested', ?)`,
      [auctionId, Number(buyerId), Number(a.seller_id), String(reason).trim(), refundAmount],
    );

    await createNotification(Number(a.seller_id), {
      type: 'refund_requested',
      title: '반품·환불 요청이 접수되었습니다',
      body: `${a.product_name} — 사유: ${String(reason).trim()}`,
      link: `/app/order-detail/${auctionId}`,
    });

    res.status(201).json({ id: result.insertId, refundAmount });
  } catch (err) {
    console.error('[refunds] POST /', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/refunds/:id/approve — 판매자 승인
// body: { sellerId }
router.patch('/:id/approve', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const sellerId = Number(req.body.sellerId);
  if (!sellerId) return res.status(400).json({ error: 'sellerId required' });

  try {
    const [rows] = await pool.query<any[]>(
      `SELECT r.*, a.product_name FROM refunds r JOIN auctions a ON a.id = r.auction_id WHERE r.id = ?`,
      [id],
    );
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'refund not found' });
    if (String(r.seller_id) !== String(sellerId)) return res.status(403).json({ error: 'not your refund' });
    if (r.status !== 'requested') return res.status(409).json({ error: 'not in requested state' });

    await pool.query("UPDATE refunds SET status='approved', decided_at=NOW() WHERE id=?", [id]);
    await createNotification(Number(r.buyer_id), {
      type: 'refund_approved',
      title: '반품·환불 요청이 승인되었습니다',
      body: `${r.product_name} — 환불 처리가 진행됩니다`,
      link: `/app/order-detail/${r.auction_id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[refunds] PATCH /:id/approve', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/refunds/:id/reject — 판매자 거절
// body: { sellerId, rejectReason }
router.patch('/:id/reject', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const sellerId = Number(req.body.sellerId);
  const rejectReason = String(req.body.rejectReason ?? '').trim();
  if (!sellerId) return res.status(400).json({ error: 'sellerId required' });

  try {
    const [rows] = await pool.query<any[]>(
      `SELECT r.*, a.product_name FROM refunds r JOIN auctions a ON a.id = r.auction_id WHERE r.id = ?`,
      [id],
    );
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'refund not found' });
    if (String(r.seller_id) !== String(sellerId)) return res.status(403).json({ error: 'not your refund' });
    if (r.status !== 'requested') return res.status(409).json({ error: 'not in requested state' });

    await pool.query(
      "UPDATE refunds SET status='rejected', reject_reason=?, decided_at=NOW() WHERE id=?",
      [rejectReason || null, id],
    );
    await createNotification(Number(r.buyer_id), {
      type: 'refund_rejected',
      title: '반품·환불 요청이 거절되었습니다',
      body: rejectReason ? `${r.product_name} — 사유: ${rejectReason}` : r.product_name,
      link: `/app/order-detail/${r.auction_id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[refunds] PATCH /:id/reject', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/refunds/:id/complete — 환불 완료 처리 (판매자)
// 승인된 건을 완료 상태로 전환하고, 주문은 환불 처리 표시
// body: { sellerId }
router.patch('/:id/complete', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const sellerId = Number(req.body.sellerId);
  if (!sellerId) return res.status(400).json({ error: 'sellerId required' });

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query<any[]>(
      `SELECT r.*, a.product_name FROM refunds r JOIN auctions a ON a.id = r.auction_id WHERE r.id = ?`,
      [id],
    );
    const r = rows[0];
    if (!r) { conn.release(); return res.status(404).json({ error: 'refund not found' }); }
    if (String(r.seller_id) !== String(sellerId)) { conn.release(); return res.status(403).json({ error: 'not your refund' }); }
    if (r.status !== 'approved') { conn.release(); return res.status(409).json({ error: 'not in approved state' }); }

    await conn.beginTransaction();
    await conn.query("UPDATE refunds SET status='completed', completed_at=NOW() WHERE id=?", [id]);
    await conn.commit();

    await createNotification(Number(r.buyer_id), {
      type: 'refund_completed',
      title: '환불이 완료되었습니다',
      body: `${r.product_name} — ${Number(r.refund_amount).toLocaleString('ko-KR')}원 환불`,
      link: `/app/order-detail/${r.auction_id}`,
    });
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('[refunds] PATCH /:id/complete', err);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    conn.release();
  }
});

export default router;
