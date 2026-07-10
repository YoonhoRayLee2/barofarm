import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import pool from '../db/mysql';
import { verifyPassword, hashPassword } from '../services/auth';
import { lives, auctions, endAuctionState, endLive } from '../store/memory';
import { endAuction } from '../services/livekit-service';
import { createNotification } from '../services/notifications';

function getSecret(): string {
  return process.env.JWT_SECRET!;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), getSecret()) as { userId: number; isAdmin?: boolean };
    if (!payload.isAdmin) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    // JWT의 isAdmin 클레임은 발급 시점 값일 뿐이므로, DB의 실제 is_admin을 재확인한다.
    const [rows] = await pool.query<any[]>(
      'SELECT is_admin FROM users WHERE id = ? LIMIT 1',
      [payload.userId],
    );
    const user = rows[0];
    if (!user || !user.is_admin) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    (req as any).adminUserId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

export default function createAdminRouter(io: Server) {
  const router = Router();
  const adminPublicPath = path.join(__dirname, '..', '..', 'public', 'admin');

  // POST /admin/api/login
  router.post('/api/login', async (req: Request, res: Response) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'username and password required' });
      return;
    }
    try {
      const [rows] = await pool.query<any[]>(
        'SELECT id, username, password_hash, is_admin FROM users WHERE username = ? LIMIT 1',
        [username],
      );
      const user = rows[0];
      if (!user) {
        res.status(401).json({ error: 'invalid credentials' });
        return;
      }
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) {
        res.status(401).json({ error: 'invalid credentials' });
        return;
      }
      if (!user.is_admin) {
        res.status(403).json({ error: 'admin only' });
        return;
      }
      const token = jwt.sign(
        { userId: user.id, username: user.username, isAdmin: true },
        getSecret(),
        { algorithm: 'HS256', expiresIn: '14d' },
      );
      res.json({ token });
    } catch (err) {
      console.error('[admin/login]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /admin/api/dashboard
  router.get('/api/dashboard', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [totals, todayTotals, monthTotals, pending, recent, totalUsersRes, newUsersTodayRes, sellerCountRes, pendingRefundsRes] = await Promise.all([
        pool.query<any[]>(
          "SELECT COALESCE(SUM(current_price),0) AS totalGross, COALESCE(SUM(seller_fee_amt),0) AS totalFee FROM auctions WHERE status='ended'",
        ),
        pool.query<any[]>(
          "SELECT COALESCE(SUM(current_price),0) AS todayGross, COUNT(*) AS todayCount FROM auctions WHERE status='ended' AND DATE(created_at) = CURDATE()",
        ),
        pool.query<any[]>(
          "SELECT COALESCE(SUM(current_price),0) AS monthGross, COUNT(*) AS monthCount FROM auctions WHERE status='ended' AND YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())",
        ),
        pool.query<any[]>(
          "SELECT COUNT(*) AS cnt FROM settlements WHERE status='pending'",
        ),
        pool.query<any[]>(
          `SELECT a.id, a.product_name, a.current_price, a.seller_fee_amt,
                  a.delivery_status, a.created_at, u.nickname AS seller_name
           FROM auctions a JOIN users u ON u.id = a.seller_id
           WHERE a.status='ended' ORDER BY a.created_at DESC LIMIT 20`,
        ),
        pool.query<any[]>('SELECT COUNT(*) AS cnt FROM users'),
        pool.query<any[]>('SELECT COUNT(*) AS cnt FROM users WHERE DATE(created_at)=CURDATE()'),
        pool.query<any[]>("SELECT COUNT(*) AS cnt FROM users WHERE role='seller'"),
        pool.query<any[]>("SELECT COUNT(*) AS cnt FROM refunds WHERE status='requested'"),
      ]);

      res.json({
        totalGross: totals[0][0].totalGross,
        totalFee: totals[0][0].totalFee,
        todayGross: todayTotals[0][0].todayGross,
        todayCount: todayTotals[0][0].todayCount,
        monthGross: monthTotals[0][0].monthGross,
        monthCount: monthTotals[0][0].monthCount,
        pendingSettlements: pending[0][0].cnt,
        recentAuctions: recent[0],
        totalUsers: (totalUsersRes[0] as any[])[0].cnt,
        newUsersToday: (newUsersTodayRes[0] as any[])[0].cnt,
        sellerCount: (sellerCountRes[0] as any[])[0].cnt,
        pendingRefunds: (pendingRefundsRes[0] as any[])[0].cnt,
      });
    } catch (err) {
      console.error('[admin/dashboard]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /admin/api/settlements/generate
  router.post('/api/settlements/generate', requireAdmin, async (req: Request, res: Response) => {
    const { periodStart, periodEnd } = req.body as { periodStart?: string; periodEnd?: string };
    if (!periodStart || !periodEnd) {
      res.status(400).json({ error: 'periodStart and periodEnd required' });
      return;
    }
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT a.seller_id, u.nickname AS seller_name,
                SUM(a.current_price) AS gross, SUM(a.seller_fee_amt) AS fee, COUNT(*) AS cnt
         FROM auctions a JOIN users u ON u.id = a.seller_id
         WHERE a.status='ended' AND DATE(a.created_at) BETWEEN ? AND ?
         GROUP BY a.seller_id, u.nickname`,
        [periodStart, periodEnd],
      );

      let generated = 0;
      for (const row of rows) {
        const [existing] = await pool.query<any[]>(
          'SELECT id FROM settlements WHERE seller_id=? AND period_start=? AND period_end=? LIMIT 1',
          [row.seller_id, periodStart, periodEnd],
        );
        if ((existing as any[]).length > 0) continue;

        const gross = row.gross ?? 0;
        const fee = row.fee ?? 0;
        await pool.query(
          `INSERT INTO settlements (seller_id, seller_name, period_start, period_end,
             gross_amount, fee_amount, net_amount, auction_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.seller_id, row.seller_name, periodStart, periodEnd, gross, fee, gross - fee, row.cnt],
        );
        generated++;
      }
      res.json({ generated });
    } catch (err) {
      console.error('[admin/settlements/generate]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /admin/api/settlements
  router.get('/api/settlements', requireAdmin, async (req: Request, res: Response) => {
    const { status, sellerId } = req.query as { status?: string; sellerId?: string };
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      if (status) {
        conditions.push('s.status = ?');
        params.push(status);
      }
      if (sellerId) {
        conditions.push('s.seller_id = ?');
        params.push(Number(sellerId));
      }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const [rows] = await pool.query<any[]>(
        `SELECT s.*, u.nickname AS seller_name_display
         FROM settlements s JOIN users u ON u.id = s.seller_id
         ${where}
         ORDER BY s.created_at DESC`,
        params,
      );
      res.json(rows);
    } catch (err) {
      console.error('[admin/settlements]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /admin/api/settlements/:id
  router.get('/api/settlements/:id', requireAdmin, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    try {
      const [sRows] = await pool.query<any[]>(
        `SELECT s.*, u.nickname AS seller_name_display
         FROM settlements s JOIN users u ON u.id = s.seller_id
         WHERE s.id = ? LIMIT 1`,
        [id],
      );
      const settlement = (sRows as any[])[0];
      if (!settlement) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const [auctionRows] = await pool.query<any[]>(
        `SELECT id, product_name, current_price, seller_fee_amt, seller_fee_rate, delivery_status, created_at
         FROM auctions
         WHERE seller_id = ? AND DATE(created_at) BETWEEN ? AND ? AND status='ended'
         ORDER BY created_at DESC`,
        [settlement.seller_id, settlement.period_start, settlement.period_end],
      );
      res.json({ ...settlement, auctions: auctionRows });
    } catch (err) {
      console.error('[admin/settlements/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /admin/api/settlements/:id/pay
  router.patch('/api/settlements/:id/pay', requireAdmin, async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    try {
      await pool.query(
        "UPDATE settlements SET status='paid', paid_at=NOW() WHERE id=?",
        [id],
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/settlements/:id/pay]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /admin/api/sellers
  router.get('/api/sellers', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<any[]>(
        "SELECT id, nickname FROM users WHERE role = 'seller' ORDER BY nickname",
      );
      res.json(rows);
    } catch (err) {
      console.error('[admin/sellers]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /admin/api/users
  router.get('/api/users', requireAdmin, async (req, res) => {
    const { q, role, page = '1' } = req.query as any;
    const pageNum = Math.max(1, parseInt(page));
    const offset = (pageNum - 1) * 20;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (q) { where += ' AND (username LIKE ? OR nickname LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    if (role) { where += ' AND role=?'; params.push(role); }
    try {
      const [[{ total }]] = await pool.query<any>(`SELECT COUNT(*) AS total FROM users ${where}`, params) as any;
      const [users] = await pool.query<any>(`SELECT id, username, nickname, role, is_admin, status, created_at FROM users ${where} ORDER BY id DESC LIMIT 20 OFFSET ?`, [...params, offset]) as any;
      res.json({ users, total, page: pageNum, pageSize: 20 });
    } catch (err) {
      console.error('[admin/users]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /admin/api/users/:id
  router.get('/api/users/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const [[user]] = await pool.query<any>('SELECT id, username, nickname, role, is_admin, status, created_at FROM users WHERE id=?', [id]) as any;
      if (!user) { res.status(404).json({ error: 'Not found' }); return; }
      const [[pc]] = await pool.query<any>("SELECT COUNT(*) AS purchaseCount, COALESCE(SUM(current_price),0) AS purchaseAmount FROM auctions WHERE top_bidder_id=? AND status='ended'", [id]) as any;
      const [[sc]] = await pool.query<any>("SELECT COUNT(*) AS salesCount, COALESCE(SUM(current_price),0) AS salesAmount FROM auctions WHERE seller_id=? AND status='ended'", [id]) as any;
      res.json({ ...user, ...pc, ...sc });
    } catch (err) {
      console.error('[admin/users/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /admin/api/users/:id
  router.patch('/api/users/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const adminUserId = (req as any).adminUserId;
    const { is_admin, role, status, nickname } = req.body;
    if (String(id) === String(adminUserId) && is_admin === 0) { res.status(400).json({ error: '본인 관리자 권한 해제 불가' }); return; }
    if (String(id) === String(adminUserId) && status === 'suspended') { res.status(400).json({ error: '본인 계정 정지 불가' }); return; }
    const fields: string[] = [];
    const vals: any[] = [];
    if (is_admin  !== undefined) { fields.push('is_admin=?');  vals.push(is_admin); }
    if (role      !== undefined) { fields.push('role=?');      vals.push(role); }
    if (status    !== undefined) { fields.push('status=?');    vals.push(status); }
    if (nickname  !== undefined) { fields.push('nickname=?');  vals.push(nickname); }
    if (!fields.length) { res.status(400).json({ error: 'No fields' }); return; }
    try {
      await pool.query(`UPDATE users SET ${fields.join(',')} WHERE id=?`, [...vals, id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/users/:id PATCH]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /admin/api/live/active
  router.get('/api/live/active', requireAdmin, (_req, res) => {
    const result: any[] = [];
    for (const [liveId, live] of lives) {
      if (live.status !== 'live') continue;
      const auc = live.currentAuctionId ? auctions.get(live.currentAuctionId) ?? null : null;
      result.push({
        liveId,
        sellerId: live.sellerId,
        sellerName: live.sellerName,
        title: live.title,
        viewerCount: live.viewerCount,
        auction: auc ? { id: auc.id, mode: auc.mode, currentPrice: auc.currentPrice, topBidder: auc.topBidder, topBidderName: auc.topBidderName, timeLeft: auc.timeLeft, status: auc.status } : null,
      });
    }
    res.json(result);
  });

  // GET /admin/api/auctions
  router.get('/api/auctions', requireAdmin, async (req, res) => {
    const { status, deliveryStatus, sellerId, page = '1' } = req.query as any;
    const pageNum = Math.max(1, parseInt(page));
    const offset = (pageNum - 1) * 20;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (status) { where += ' AND a.status=?'; params.push(status); }
    if (deliveryStatus) { where += ' AND a.delivery_status=?'; params.push(deliveryStatus); }
    if (sellerId) { where += ' AND a.seller_id=?'; params.push(sellerId); }
    try {
      const [[{ total }]] = await pool.query<any>(`SELECT COUNT(*) AS total FROM auctions a ${where}`, params) as any;
      const [auctionRows] = await pool.query<any>(`SELECT a.id, a.product_name, a.current_price, a.seller_fee_amt, a.delivery_status, a.status, a.created_at, a.top_bidder_id, seller.nickname AS seller_nickname, buyer.nickname AS buyer_nickname FROM auctions a JOIN users seller ON seller.id=a.seller_id LEFT JOIN users buyer ON buyer.id=a.top_bidder_id ${where} ORDER BY a.id DESC LIMIT 20 OFFSET ?`, [...params, offset]) as any;
      res.json({ auctions: auctionRows, total, page: pageNum, pageSize: 20 });
    } catch (err) {
      console.error('[admin/auctions]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /admin/api/live/:id/force-end
  router.post('/api/live/:id/force-end', requireAdmin, async (req, res) => {
    const live = lives.get(String(req.params.id));
    if (!live || live.status !== 'live') { res.status(400).json({ error: '진행 중인 라이브 없음' }); return; }
    try {
      if (live.currentAuctionId) {
        const auc = auctions.get(live.currentAuctionId);
        if (auc) {
          await new Promise<void>(resolve => {
            endAuctionState(auc, io, async (state: any) => {
              try { await endAuction(state); } catch {}
              resolve();
            });
          });
        }
      }
      endLive(live.id);
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/live/force-end]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /admin/api/products
  router.get('/api/products', requireAdmin, async (req, res) => {
    const { q, category, sellerId, page = '1' } = req.query as any;
    const pageNum = Math.max(1, parseInt(page));
    const offset = (pageNum - 1) * 20;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (q) { where += ' AND p.name LIKE ?'; params.push(`%${q}%`); }
    if (category) { where += ' AND p.category=?'; params.push(category); }
    if (sellerId) { where += ' AND p.seller_id=?'; params.push(sellerId); }
    try {
      const [[{ total }]] = await pool.query<any>(`SELECT COUNT(*) AS total FROM products p ${where}`, params) as any;
      const [products] = await pool.query<any>(`SELECT p.id, p.name, p.category, p.price, p.status, p.created_at, seller.nickname AS seller_nickname FROM products p JOIN users seller ON seller.id=p.seller_id ${where} ORDER BY p.id DESC LIMIT 20 OFFSET ?`, [...params, offset]) as any;
      res.json({ products, total, page: pageNum, pageSize: 20 });
    } catch (err) {
      console.error('[admin/products]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // DELETE /admin/api/products/:id
  router.delete('/api/products/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const [[product]] = await pool.query<any>('SELECT * FROM products WHERE id=?', [id]) as any;
      if (!product) { res.status(404).json({ error: 'Not found' }); return; }
      const [images] = await pool.query<any>('SELECT * FROM product_images WHERE product_id=?', [id]) as any;
      for (const img of images) {
        try { const fs = await import('fs'); fs.unlinkSync(img.image_path); } catch {}
      }
      await pool.query('DELETE FROM product_images WHERE product_id=?', [id]);
      await pool.query('DELETE FROM products WHERE id=?', [id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/products/:id DELETE]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /admin/api/refunds
  router.get('/api/refunds', requireAdmin, async (req, res) => {
    const { status, page = '1' } = req.query as any;
    const pageNum = Math.max(1, parseInt(page));
    const offset = (pageNum - 1) * 20;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (status) { where += ' AND r.status=?'; params.push(status); }
    try {
      const [[{ total }]] = await pool.query<any>(`SELECT COUNT(*) AS total FROM refunds r ${where}`, params) as any;
      const [refunds] = await pool.query<any>(`SELECT r.*, a.product_name, u_buyer.nickname AS buyer_name, u_seller.nickname AS seller_name FROM refunds r JOIN auctions a ON a.id=r.auction_id JOIN users u_buyer ON u_buyer.id=r.buyer_id JOIN users u_seller ON u_seller.id=r.seller_id ${where} ORDER BY r.id DESC LIMIT 20 OFFSET ?`, [...params, offset]) as any;
      res.json({ refunds, total, page: pageNum, pageSize: 20 });
    } catch (err) {
      console.error('[admin/refunds]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /admin/api/refunds/:id/approve
  router.patch('/api/refunds/:id/approve', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const [[refund]] = await pool.query<any>('SELECT * FROM refunds WHERE id=?', [id]) as any;
      if (!refund || refund.status !== 'requested') { res.status(400).json({ error: '처리 불가' }); return; }
      await pool.query("UPDATE refunds SET status='approved', decided_at=NOW() WHERE id=?", [id]);
      try {
        await createNotification(refund.buyer_id, { type: 'refund_approved', title: '환불 승인', body: '환불 신청이 승인되었습니다.' });
      } catch {}
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/refunds/:id/approve]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /admin/api/refunds/:id/reject
  router.patch('/api/refunds/:id/reject', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { rejectReason } = req.body;
    try {
      const [[refund]] = await pool.query<any>('SELECT * FROM refunds WHERE id=?', [id]) as any;
      if (!refund || refund.status !== 'requested') { res.status(400).json({ error: '처리 불가' }); return; }
      await pool.query("UPDATE refunds SET status='rejected', reject_reason=?, decided_at=NOW() WHERE id=?", [rejectReason || null, id]);
      try {
        await createNotification(refund.buyer_id, { type: 'refund_rejected', title: '환불 거부', body: '환불 신청이 거부되었습니다.' });
      } catch {}
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/refunds/:id/reject]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /admin/api/refunds/:id/complete
  router.patch('/api/refunds/:id/complete', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const [[refund]] = await pool.query<any>('SELECT * FROM refunds WHERE id=?', [id]) as any;
      if (!refund || refund.status !== 'approved') { res.status(400).json({ error: '처리 불가' }); return; }
      await pool.query("UPDATE refunds SET status='completed', completed_at=NOW() WHERE id=?", [id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/refunds/:id/complete]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // GET /admin/api/stats/export
  router.get('/api/stats/export', requireAdmin, async (req, res) => {
    const { type, from, to } = req.query as any;
    const BOM = '﻿';
    try {
      if (type === 'settlements') {
        let where = 'WHERE 1=1';
        const params: any[] = [];
        if (from) { where += ' AND s.period_start>=?'; params.push(from); }
        if (to) { where += ' AND s.period_end<=?'; params.push(to); }
        const [rows] = await pool.query<any>(`SELECT s.id, u.nickname AS seller, s.period_start, s.period_end, s.auction_count, s.total_sales, s.fee_amount, s.net_amount, s.status FROM settlements s JOIN users u ON u.id=s.seller_id ${where} ORDER BY s.id DESC`, params) as any;
        const header = 'ID,판매자,기간시작,기간종료,낙찰건수,총낙찰액,수수료,실지급액,상태\n';
        const csv = BOM + header + rows.map((r: any) => [r.id, r.seller, r.period_start, r.period_end, r.auction_count, r.total_sales, r.fee_amount, r.net_amount, r.status].join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=settlements.csv');
        return res.send(csv);
      } else {
        let where = 'WHERE 1=1';
        const params: any[] = [];
        if (from) { where += ' AND a.created_at>=?'; params.push(from); }
        if (to) { where += ' AND a.created_at<=?'; params.push(to); }
        const [rows] = await pool.query<any>(`SELECT a.id, a.product_name, u.nickname AS seller, a.current_price, a.seller_fee_amt, a.delivery_status, a.created_at FROM auctions a JOIN users u ON u.id=a.seller_id ${where} ORDER BY a.id DESC`, params) as any;
        const header = 'ID,상품명,판매자,낙찰가,수수료,배송상태,생성일시\n';
        const csv = BOM + header + rows.map((r: any) => [r.id, r.product_name, r.seller, r.current_price, r.seller_fee_amt, r.delivery_status, r.created_at].join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=auctions.csv');
        return res.send(csv);
      }
    } catch (err) {
      console.error('[admin/stats/export]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ─── 사용자 관리 확장 ────────────────────────────────────────────────────────

  // POST /admin/api/users/:id/reset-password
  router.post('/api/users/:id/reset-password', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'newPassword (8자 이상) 필수' });
      return;
    }
    try {
      const passwordHash = await hashPassword(newPassword);
      await pool.query('UPDATE users SET password_hash=? WHERE id=?', [passwordHash, id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/users/:id/reset-password]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ─── 경매·라이브 ─────────────────────────────────────────────────────────────

  // GET /admin/api/auctions/:id
  router.get('/api/auctions/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const [[auction]] = await pool.query<any>(
        `SELECT a.*, u.nickname AS seller_nickname, buyer.nickname AS buyer_nickname
         FROM auctions a JOIN users u ON u.id = a.seller_id
         LEFT JOIN users buyer ON buyer.id = a.top_bidder_id
         WHERE a.id = ? LIMIT 1`,
        [id],
      ) as any;
      if (!auction) { res.status(404).json({ error: 'Not found' }); return; }
      const [bids] = await pool.query<any>(
        `SELECT b.id, b.price, b.created_at, u.nickname AS bidder_name
         FROM bids b JOIN users u ON u.id = b.bidder_id
         WHERE b.auction_id = ? ORDER BY b.created_at DESC`,
        [id],
      ) as any;
      res.json({ ...auction, bids });
    } catch (err) {
      console.error('[admin/auctions/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // POST /admin/api/auctions/:id/force-end
  router.post('/api/auctions/:id/force-end', requireAdmin, async (req, res) => {
    const auc = auctions.get(String(req.params.id));
    if (!auc) { res.status(400).json({ error: '메모리에 진행 중인 경매 없음' }); return; }
    try {
      await new Promise<void>(resolve => {
        endAuctionState(auc, io, async (state: any) => {
          try { await endAuction(state); } catch {}
          resolve();
        });
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/auctions/:id/force-end]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /admin/api/auctions/:id/delivery-status
  // DeliveryStatus ENUM 값은 auctions.ts 기준: payment_complete|shipped|purchase_confirmed|settlement_complete
  router.patch('/api/auctions/:id/delivery-status', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { deliveryStatus } = req.body as { deliveryStatus?: string };
    const VALID_STATUSES = ['payment_complete', 'shipped', 'purchase_confirmed', 'settlement_complete'];
    if (!deliveryStatus || !VALID_STATUSES.includes(deliveryStatus)) {
      res.status(400).json({ error: `deliveryStatus must be one of: ${VALID_STATUSES.join(', ')}` });
      return;
    }
    try {
      const [[auction]] = await pool.query<any>('SELECT id FROM auctions WHERE id=? LIMIT 1', [id]) as any;
      if (!auction) { res.status(404).json({ error: 'Not found' }); return; }
      await pool.query('UPDATE auctions SET delivery_status=? WHERE id=?', [deliveryStatus, id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/auctions/:id/delivery-status]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // DELETE /admin/api/auctions/:id — 종료(낙찰) 경매 내역 삭제
  router.delete('/api/auctions/:id', requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    // 메모리 진행중 경매 확인
    if (auctions.has(id)) {
      res.status(400).json({ error: '진행중 경매는 삭제 불가' });
      return;
    }
    // lives 중 currentAuctionId가 일치하는 것도 차단
    for (const live of lives.values()) {
      if (live.currentAuctionId === id) {
        res.status(400).json({ error: '진행중 경매는 삭제 불가' });
        return;
      }
    }
    try {
      const [[auction]] = await pool.query<any>(
        "SELECT id, status FROM auctions WHERE id=? LIMIT 1",
        [String(id)],
      ) as any;
      if (!auction) { res.status(404).json({ error: 'Not found' }); return; }
      if (auction.status !== 'ended') {
        res.status(400).json({ error: '종료(ended) 상태 경매만 삭제 가능' });
        return;
      }
      // bids 외래키에 CASCADE 없으므로 먼저 삭제
      await pool.query('DELETE FROM bids WHERE auction_id=?', [String(id)]);
      await pool.query('DELETE FROM auctions WHERE id=?', [String(id)]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/auctions/:id DELETE]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // DELETE /admin/api/auctions/:id/bids/:bidId
  // DB 기록만 삭제, 메모리 경매 진행중이면 영향 없음
  router.delete('/api/auctions/:id/bids/:bidId', requireAdmin, async (req, res) => {
    const { bidId } = req.params;
    try {
      await pool.query('DELETE FROM bids WHERE id=?', [bidId]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/auctions/:id/bids/:bidId DELETE]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ─── 상품 ────────────────────────────────────────────────────────────────────

  // GET /admin/api/products/:id
  router.get('/api/products/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const [[product]] = await pool.query<any>(
        'SELECT p.*, u.nickname AS seller_nickname FROM products p JOIN users u ON u.id = p.seller_id WHERE p.id=? LIMIT 1',
        [id],
      ) as any;
      if (!product) { res.status(404).json({ error: 'Not found' }); return; }
      const [images] = await pool.query<any>(
        'SELECT image_url FROM product_images WHERE product_id=? ORDER BY sort_order',
        [id],
      ) as any;
      res.json({ ...product, images: images.map((r: any) => r.image_url) });
    } catch (err) {
      console.error('[admin/products/:id]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // PATCH /admin/api/products/:id
  // body: { name?, description?, price?, category?, status? }
  // 카테고리: ['과일','채소','수산','축산','곡물','기타']
  router.patch('/api/products/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, description, price, category, status } = req.body as {
      name?: string; description?: string; price?: number; category?: string; status?: string;
    };
    const VALID_CATEGORIES = ['과일', '채소', '수산', '축산', '곡물', '기타'];
    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
      return;
    }
    const fields: string[] = [];
    const vals: any[] = [];
    if (name        !== undefined) { fields.push('name=?');        vals.push(name); }
    if (description !== undefined) { fields.push('description=?'); vals.push(description); }
    if (price       !== undefined) { fields.push('price=?');       vals.push(Number(price)); }
    if (category    !== undefined) { fields.push('category=?');    vals.push(category); }
    if (status      !== undefined) { fields.push('status=?');      vals.push(status); }
    if (!fields.length) { res.status(400).json({ error: 'No fields' }); return; }
    try {
      const [[product]] = await pool.query<any>('SELECT id FROM products WHERE id=? LIMIT 1', [id]) as any;
      if (!product) { res.status(404).json({ error: 'Not found' }); return; }
      await pool.query(`UPDATE products SET ${fields.join(',')} WHERE id=?`, [...vals, id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/products/:id PATCH]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // ─── 정산 ────────────────────────────────────────────────────────────────────

  // POST /admin/api/settlements/:id/cancel
  // settlements ENUM은 'pending'|'paid' 뿐이므로 'pending'으로 되돌린다 (cancelled 미지원)
  router.post('/api/settlements/:id/cancel', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const [[settlement]] = await pool.query<any>('SELECT id, status FROM settlements WHERE id=? LIMIT 1', [id]) as any;
      if (!settlement) { res.status(404).json({ error: 'Not found' }); return; }
      await pool.query("UPDATE settlements SET status='pending', paid_at=NULL WHERE id=?", [id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('[admin/settlements/:id/cancel]', err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // 신규 페이지 라우트 (HTML은 인증 없이 서빙, 실제 보호는 페이지 JS의 토큰 기반 API 호출에서 requireAdmin이 담당)
  router.get('/users', (_req, res) => res.sendFile(path.join(adminPublicPath, 'users.html')));
  router.get('/auctions', (_req, res) => res.sendFile(path.join(adminPublicPath, 'auctions.html')));
  router.get('/products', (_req, res) => res.sendFile(path.join(adminPublicPath, 'products.html')));

  // 정적 파일 서빙
  router.get('/', (_req, res) => res.sendFile(path.join(adminPublicPath, 'index.html')));
  router.get('/settlements', (_req, res) => res.sendFile(path.join(adminPublicPath, 'settlements.html')));
  router.use(express.static(adminPublicPath));

  return router;
}
