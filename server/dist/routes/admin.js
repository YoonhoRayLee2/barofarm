"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const express_2 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mysql_1 = __importDefault(require("../db/mysql"));
const auth_1 = require("../services/auth");
const router = (0, express_1.Router)();
function getSecret() {
    return process.env.JWT_SECRET;
}
function requireAdmin(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(auth.slice(7), getSecret());
        if (!payload.isAdmin) {
            res.status(403).json({ error: 'forbidden' });
            return;
        }
        req.adminUserId = payload.userId;
        next();
    }
    catch {
        res.status(401).json({ error: 'invalid token' });
    }
}
// POST /admin/api/login
router.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'username and password required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.query('SELECT id, username, password_hash, is_admin FROM users WHERE username = ? LIMIT 1', [username]);
        const user = rows[0];
        if (!user) {
            res.status(401).json({ error: 'invalid credentials' });
            return;
        }
        const ok = await (0, auth_1.verifyPassword)(password, user.password_hash);
        if (!ok) {
            res.status(401).json({ error: 'invalid credentials' });
            return;
        }
        if (!user.is_admin) {
            res.status(403).json({ error: 'admin only' });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, isAdmin: true }, getSecret(), { algorithm: 'HS256', expiresIn: '14d' });
        res.json({ token });
    }
    catch (err) {
        console.error('[admin/login]', err);
        res.status(500).json({ error: 'server error' });
    }
});
// GET /admin/api/dashboard
router.get('/api/dashboard', requireAdmin, async (_req, res) => {
    try {
        const [totals, todayTotals, monthTotals, pending, recent] = await Promise.all([
            mysql_1.default.query("SELECT COALESCE(SUM(current_price),0) AS totalGross, COALESCE(SUM(seller_fee_amt),0) AS totalFee FROM auctions WHERE status='ended'"),
            mysql_1.default.query("SELECT COALESCE(SUM(current_price),0) AS todayGross, COUNT(*) AS todayCount FROM auctions WHERE status='ended' AND DATE(created_at) = CURDATE()"),
            mysql_1.default.query("SELECT COALESCE(SUM(current_price),0) AS monthGross, COUNT(*) AS monthCount FROM auctions WHERE status='ended' AND YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())"),
            mysql_1.default.query("SELECT COUNT(*) AS cnt FROM settlements WHERE status='pending'"),
            mysql_1.default.query(`SELECT a.id, a.product_name, a.current_price, a.seller_fee_amt,
                a.delivery_status, a.created_at, u.nickname AS seller_name
         FROM auctions a JOIN users u ON u.id = a.seller_id
         WHERE a.status='ended' ORDER BY a.created_at DESC LIMIT 20`),
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
        });
    }
    catch (err) {
        console.error('[admin/dashboard]', err);
        res.status(500).json({ error: 'server error' });
    }
});
// POST /admin/api/settlements/generate
router.post('/api/settlements/generate', requireAdmin, async (req, res) => {
    const { periodStart, periodEnd } = req.body;
    if (!periodStart || !periodEnd) {
        res.status(400).json({ error: 'periodStart and periodEnd required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.query(`SELECT a.seller_id, u.nickname AS seller_name,
              SUM(a.current_price) AS gross, SUM(a.seller_fee_amt) AS fee, COUNT(*) AS cnt
       FROM auctions a JOIN users u ON u.id = a.seller_id
       WHERE a.status='ended' AND DATE(a.created_at) BETWEEN ? AND ?
       GROUP BY a.seller_id, u.nickname`, [periodStart, periodEnd]);
        let generated = 0;
        for (const row of rows) {
            const [existing] = await mysql_1.default.query('SELECT id FROM settlements WHERE seller_id=? AND period_start=? AND period_end=? LIMIT 1', [row.seller_id, periodStart, periodEnd]);
            if (existing.length > 0)
                continue;
            const gross = row.gross ?? 0;
            const fee = row.fee ?? 0;
            await mysql_1.default.query(`INSERT INTO settlements (seller_id, seller_name, period_start, period_end,
           gross_amount, fee_amount, net_amount, auction_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [row.seller_id, row.seller_name, periodStart, periodEnd, gross, fee, gross - fee, row.cnt]);
            generated++;
        }
        res.json({ generated });
    }
    catch (err) {
        console.error('[admin/settlements/generate]', err);
        res.status(500).json({ error: 'server error' });
    }
});
// GET /admin/api/settlements
router.get('/api/settlements', requireAdmin, async (req, res) => {
    const { status, sellerId } = req.query;
    try {
        const conditions = [];
        const params = [];
        if (status) {
            conditions.push('s.status = ?');
            params.push(status);
        }
        if (sellerId) {
            conditions.push('s.seller_id = ?');
            params.push(Number(sellerId));
        }
        const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
        const [rows] = await mysql_1.default.query(`SELECT s.*, u.nickname AS seller_name_display
       FROM settlements s JOIN users u ON u.id = s.seller_id
       ${where}
       ORDER BY s.created_at DESC`, params);
        res.json(rows);
    }
    catch (err) {
        console.error('[admin/settlements]', err);
        res.status(500).json({ error: 'server error' });
    }
});
// GET /admin/api/settlements/:id
router.get('/api/settlements/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    try {
        const [sRows] = await mysql_1.default.query(`SELECT s.*, u.nickname AS seller_name_display
       FROM settlements s JOIN users u ON u.id = s.seller_id
       WHERE s.id = ? LIMIT 1`, [id]);
        const settlement = sRows[0];
        if (!settlement) {
            res.status(404).json({ error: 'not found' });
            return;
        }
        const [auctions] = await mysql_1.default.query(`SELECT id, product_name, current_price, seller_fee_amt, seller_fee_rate, delivery_status, created_at
       FROM auctions
       WHERE seller_id = ? AND DATE(created_at) BETWEEN ? AND ? AND status='ended'
       ORDER BY created_at DESC`, [settlement.seller_id, settlement.period_start, settlement.period_end]);
        res.json({ ...settlement, auctions });
    }
    catch (err) {
        console.error('[admin/settlements/:id]', err);
        res.status(500).json({ error: 'server error' });
    }
});
// PATCH /admin/api/settlements/:id/pay
router.patch('/api/settlements/:id/pay', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    try {
        await mysql_1.default.query("UPDATE settlements SET status='paid', paid_at=NOW() WHERE id=?", [id]);
        res.json({ ok: true });
    }
    catch (err) {
        console.error('[admin/settlements/:id/pay]', err);
        res.status(500).json({ error: 'server error' });
    }
});
// GET /admin/api/sellers
router.get('/api/sellers', requireAdmin, async (_req, res) => {
    try {
        const [rows] = await mysql_1.default.query("SELECT id, nickname FROM users WHERE is_seller = 1 OR role = 'seller' ORDER BY nickname");
        res.json(rows);
    }
    catch (err) {
        console.error('[admin/sellers]', err);
        res.status(500).json({ error: 'server error' });
    }
});
// 정적 파일 서빙
router.get('/', (_req, res) => res.sendFile(path_1.default.join(__dirname, '..', '..', 'public', 'admin', 'index.html')));
router.get('/settlements', (_req, res) => res.sendFile(path_1.default.join(__dirname, '..', '..', 'public', 'admin', 'settlements.html')));
router.use(express_2.default.static(path_1.default.join(__dirname, '..', '..', 'public', 'admin')));
exports.default = router;
