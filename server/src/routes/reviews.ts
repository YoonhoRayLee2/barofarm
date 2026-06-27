import { Router, Request, Response } from 'express';
import pool from '../db/mysql';
import { requireAuth } from '../middleware/auth';
import { createNotification } from '../services/notifications';

const router = Router();

// 구매확정 또는 정산완료 상태에서만 리뷰 작성 허용
const REVIEWABLE_STATUSES = ['purchase_confirmed', 'settlement_complete'];

// POST /api/reviews — 리뷰 작성 (구매자, requireAuth)
// body: { auctionId, rating, comment? }
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { auctionId, rating, comment } = req.body;
  const reviewerId = req.user!.userId;

  if (!auctionId) return res.status(400).json({ error: 'auctionId required' });
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'rating must be integer 1–5' });
  }

  try {
    const [aRows] = await pool.query<any[]>(
      'SELECT id, seller_id, top_bidder_id, delivery_status, product_name FROM auctions WHERE id = ?',
      [auctionId],
    );
    const a = aRows[0];
    if (!a) return res.status(404).json({ error: 'order not found' });
    if (String(a.top_bidder_id) !== String(reviewerId)) {
      return res.status(403).json({ error: 'not your order' });
    }
    if (!REVIEWABLE_STATUSES.includes(a.delivery_status)) {
      return res.status(400).json({ error: 'review only allowed after purchase_confirmed' });
    }

    const commentVal = comment ? String(comment).trim().slice(0, 500) || null : null;

    let insertId: number;
    try {
      const [result] = await pool.query<any>(
        'INSERT INTO reviews (auction_id, reviewer_id, seller_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
        [auctionId, reviewerId, Number(a.seller_id), ratingNum, commentVal],
      );
      insertId = result.insertId;
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'review already submitted for this order' });
      }
      throw err;
    }

    try {
      await createNotification(Number(a.seller_id), {
        type: 'review',
        title: '새 리뷰가 등록되었어요',
        body: `${a.product_name} — ★${ratingNum}${commentVal ? ' ' + commentVal.slice(0, 30) : ''}`,
        link: `/app/seller-profile/${a.seller_id}`,
      });
    } catch (notifErr) {
      console.error('[reviews] notification failed (non-fatal)', notifErr);
    }

    res.status(201).json({
      id: insertId,
      auctionId,
      reviewerId,
      sellerId: Number(a.seller_id),
      rating: ratingNum,
      comment: commentVal,
      sellerReply: null,
    });
  } catch (err) {
    console.error('[reviews] POST /', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/reviews/seller/:sellerId — 판매자 리뷰 목록 + 집계
router.get('/seller/:sellerId', async (req: Request, res: Response) => {
  const sellerId = Number(req.params.sellerId);
  if (!sellerId) return res.status(400).json({ error: 'invalid sellerId' });

  try {
    const [aggRows] = await pool.query<any[]>(
      'SELECT ROUND(AVG(rating), 1) AS average, COUNT(*) AS count FROM reviews WHERE seller_id = ?',
      [sellerId],
    );
    const agg = aggRows[0];

    const [items] = await pool.query<any[]>(
      `SELECT r.id, r.rating, r.comment, r.seller_reply, r.created_at,
              u.nickname AS reviewer_name
         FROM reviews r
         JOIN users u ON u.id = r.reviewer_id
        WHERE r.seller_id = ?
        ORDER BY r.id DESC`,
      [sellerId],
    );

    res.json({
      average: agg.average !== null ? Number(agg.average) : null,
      count: Number(agg.count),
      items: items.map(r => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment ?? null,
        reviewerName: r.reviewer_name,
        createdAt: r.created_at,
        sellerReply: r.seller_reply ?? null,
      })),
    });
  } catch (err) {
    console.error('[reviews] GET /seller/:sellerId', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/reviews/by-auction/:auctionId — 내 리뷰 1건 조회 (작성 여부 판단용, requireAuth)
router.get('/by-auction/:auctionId', requireAuth, async (req: Request, res: Response) => {
  const reviewerId = req.user!.userId;
  try {
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM reviews WHERE auction_id = ? AND reviewer_id = ? LIMIT 1',
      [req.params.auctionId, reviewerId],
    );
    if (!rows.length) return res.json(null);
    const r = rows[0];
    res.json({
      id: r.id,
      auctionId: r.auction_id,
      reviewerId: r.reviewer_id,
      sellerId: r.seller_id,
      rating: r.rating,
      comment: r.comment ?? null,
      sellerReply: r.seller_reply ?? null,
      createdAt: r.created_at,
    });
  } catch (err) {
    console.error('[reviews] GET /by-auction/:auctionId', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
