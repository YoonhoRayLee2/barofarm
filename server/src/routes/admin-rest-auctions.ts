// 어드민 REST 경매 관리 API (Phase 7, §19-4) — auctions.bidding_channel='REST'인 경매만 대상.
// 기존 소켓 라이브 경매(admin.ts의 /api/auctions, /api/live/*)는 이 라우터가 건드리지 않는다.

import { Router, Request, Response } from 'express';
import pool from '../db/mysql';
import { requireAdmin } from '../middleware/admin-auth';
import { recordAdminAction } from '../services/admin-audit';

const AUTH_MODES = ['PAYMENT_ONLY', 'AUCTION_ENTRY', 'ENTRY_AND_PAYMENT', 'ALWAYS'];

// 경매당 최신 주문 1건(있다면) — 결제기한/미결제 여부 판단용
const LATEST_ORDER_JOIN = `
  LEFT JOIN (
    SELECT o1.* FROM orders o1
    INNER JOIN (SELECT auction_id, MAX(id) AS max_id FROM orders GROUP BY auction_id) o2
      ON o1.id = o2.max_id
  ) o ON o.auction_id = a.id
`;

export default function createAdminRestAuctionsRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  // GET / — REST 경매 목록. query: q, status, onlyUnpaid, page
  router.get('/', async (req: Request, res: Response) => {
    const { q, status, onlyUnpaid, page = '1' } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const pageSize = 20;
    const offset = (pageNum - 1) * pageSize;

    const conditions: string[] = [`a.bidding_channel = 'REST'`];
    const params: any[] = [];
    if (q) { conditions.push('a.product_name LIKE ?'); params.push(`%${q}%`); }
    if (status) { conditions.push('a.status = ?'); params.push(status); }
    if (onlyUnpaid === 'true') { conditions.push(`o.status IN ('PAYMENT_PENDING','PAYMENT_EXPIRED')`); }
    const where = `WHERE ${conditions.join(' AND ')}`;

    try {
      const [[{ total }]] = await pool.query<any>(
        `SELECT COUNT(*) AS total FROM auctions a ${LATEST_ORDER_JOIN} ${where}`,
        params,
      ) as any;
      const [rows] = await pool.query<any>(
        `SELECT a.id, a.product_name, a.status, a.current_price, a.seller_id, a.top_bidder_id,
                a.authentication_mode, a.high_value_reauth_amount, a.ends_at, a.created_at,
                seller.nickname AS seller_nickname, buyer.nickname AS buyer_nickname,
                o.id AS order_id, o.status AS order_status, o.payment_due_at
           FROM auctions a
           JOIN users seller ON seller.id = a.seller_id
           LEFT JOIN users buyer ON buyer.id = a.top_bidder_id
           ${LATEST_ORDER_JOIN}
           ${where}
           ORDER BY a.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      ) as any;
      res.json({ auctions: rows, total, page: pageNum, pageSize });
    } catch (err) {
      console.error('[admin-rest-auctions/list]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /:id — 경매 상세(입찰내역·낙찰자·주문/결제기한 포함)
  router.get('/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      const [[auction]] = await pool.query<any>(
        `SELECT a.*, seller.nickname AS seller_nickname, buyer.nickname AS buyer_nickname
           FROM auctions a
           JOIN users seller ON seller.id = a.seller_id
           LEFT JOIN users buyer ON buyer.id = a.top_bidder_id
          WHERE a.id = ? AND a.bidding_channel = 'REST' LIMIT 1`,
        [id],
      ) as any;
      if (!auction) { res.status(404).json({ error: 'not found' }); return; }

      const [bids] = await pool.query<any>(
        `SELECT b.id, b.bidder_id, b.price, b.status, b.created_at, u.nickname AS bidder_name
           FROM bids b JOIN users u ON u.id = b.bidder_id
          WHERE b.auction_id = ? ORDER BY b.created_at DESC`,
        [id],
      ) as any;
      const [orders] = await pool.query<any>(
        `SELECT id, status, payment_amount, payment_due_at, created_at FROM orders
          WHERE auction_id = ? ORDER BY id DESC`,
        [id],
      ) as any;

      res.json({ ...auction, bids, orders });
    } catch (err) {
      console.error('[admin-rest-auctions/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /:id/auth-settings — 인증모드/고액입찰 재인증 기준 설정. body: { authenticationMode?, highValueReauthAmount?, reason? }
  router.patch('/:id/auth-settings', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { authenticationMode, highValueReauthAmount, reason } = req.body as {
      authenticationMode?: string;
      highValueReauthAmount?: number | null;
      reason?: string;
    };

    if (authenticationMode === undefined && highValueReauthAmount === undefined) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: '변경할 필드가 없습니다' });
      return;
    }
    if (authenticationMode !== undefined && !AUTH_MODES.includes(authenticationMode)) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: `authenticationMode must be one of: ${AUTH_MODES.join(', ')}` });
      return;
    }
    if (
      highValueReauthAmount !== undefined &&
      highValueReauthAmount !== null &&
      (!Number.isFinite(highValueReauthAmount) || highValueReauthAmount <= 0)
    ) {
      res.status(400).json({ error: 'INVALID_REQUEST', message: 'highValueReauthAmount는 양수 또는 null이어야 합니다' });
      return;
    }

    try {
      const [[auction]] = await pool.query<any>(
        `SELECT id FROM auctions WHERE id = ? AND bidding_channel = 'REST' LIMIT 1`,
        [id],
      ) as any;
      if (!auction) {
        res.status(400).json({ error: 'INVALID_REQUEST', message: 'REST 경매가 아닙니다(소켓 라이브 경매는 기존 경매 관리 화면에서 관리하세요)' });
        return;
      }

      const fields: string[] = [];
      const vals: any[] = [];
      if (authenticationMode !== undefined) { fields.push('authentication_mode = ?'); vals.push(authenticationMode); }
      if (highValueReauthAmount !== undefined) { fields.push('high_value_reauth_amount = ?'); vals.push(highValueReauthAmount); }
      await pool.query(`UPDATE auctions SET ${fields.join(', ')} WHERE id = ?`, [...vals, id]);

      await recordAdminAction({
        administratorId: req.adminUserId!,
        actionType: 'AUCTION_AUTH_SETTINGS_UPDATE',
        targetType: 'AUCTION',
        targetId: id,
        reason: reason ?? null,
        metadata: { authenticationMode, highValueReauthAmount },
        requestIp: req.ip ?? null,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('[admin-rest-auctions/:id/auth-settings]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
}
