"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mysql_1 = __importDefault(require("../db/mysql"));
const memory_1 = require("../store/memory");
const router = (0, express_1.Router)();
router.post('/', async (req, res) => {
    const { name, phone, role } = req.body;
    if (!name || !phone) {
        res.status(400).json({ error: 'name and phone are required' });
        return;
    }
    const userRole = role ?? 'buyer';
    try {
        await mysql_1.default.execute(`INSERT INTO users (name, phone, role) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)`, [name, phone, userRole]);
        const [rows] = await mysql_1.default.execute('SELECT id, name, phone, role, created_at FROM users WHERE phone = ?', [phone]);
        res.json(rows[0]);
    }
    catch (err) {
        console.error('[users] POST error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/lives — 판매자의 라이브 기록
router.get('/:id/lives', async (req, res) => {
    const sellerId = req.params.id;
    if (!sellerId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute(`SELECT
         seller_id,
         COUNT(*) AS total_auctions,
         SUM(CASE WHEN status = 'ended' AND top_bidder_id IS NOT NULL THEN current_price ELSE 0 END) AS total_revenue,
         MIN(created_at) AS started_at,
         MAX(ends_at) AS ended_at
       FROM auctions
       WHERE seller_id = ?
       GROUP BY seller_id`, [sellerId]);
        const dbSummary = rows[0] ?? null;
        // 메모리에서 현재 진행 중인/종료된 라이브(sellerId 일치)
        const memoryLives = [];
        for (const [liveId, live] of memory_1.lives.entries()) {
            if (live.sellerId === sellerId) {
                // 해당 라이브의 경매 건수를 메모리 auctions Map에서 집계
                let productCount = 0;
                for (const auc of memory_1.auctions.values()) {
                    if (auc.liveId === liveId)
                        productCount++;
                }
                memoryLives.push({
                    liveId,
                    title: live.title,
                    status: live.status,
                    startedAt: live.createdAt,
                    endedAt: null,
                    totalAuctions: productCount,
                    totalRevenue: 0,
                    currentViewers: live.status === 'live' ? live.viewerCount : null,
                    productCount,
                });
            }
        }
        // 라이브 중 우선, 이후 startedAt DESC 정렬
        memoryLives.sort((a, b) => {
            if (a.status === 'live' && b.status !== 'live')
                return -1;
            if (a.status !== 'live' && b.status === 'live')
                return 1;
            return b.startedAt - a.startedAt;
        });
        // DB 요약이 있으면 종료된 라이브 집계 항목으로 추가 (auctions 테이블에 live_id 없으므로 seller 단위 집계)
        const result = [...memoryLives];
        if (dbSummary) {
            result.push({
                liveId: `db-summary-${sellerId}`,
                title: '종료된 라이브 기록 (집계)',
                status: 'ended',
                startedAt: new Date(dbSummary.started_at).getTime(),
                endedAt: dbSummary.ended_at ? new Date(dbSummary.ended_at).getTime() : null,
                totalAuctions: Number(dbSummary.total_auctions),
                totalRevenue: Number(dbSummary.total_revenue),
                currentViewers: null,
                productCount: Number(dbSummary.total_auctions),
            });
        }
        res.json(result);
    }
    catch (err) {
        console.error('[users] GET /:id/lives error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/dashboard-summary — 셀러 대시보드 요약 통계
router.get('/:id/dashboard-summary', async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        // DB에서 전체 경매 집계
        const [auctionRows] = await mysql_1.default.execute(`SELECT
         COUNT(*) AS total_auctions,
         SUM(CASE WHEN status = 'ended' AND top_bidder_id IS NOT NULL THEN 1 ELSE 0 END) AS total_sold,
         SUM(CASE WHEN status = 'ended' AND top_bidder_id IS NOT NULL THEN current_price ELSE 0 END) AS total_revenue
       FROM auctions
       WHERE seller_id = ?`, [userId]);
        const dbStats = auctionRows[0] ?? { total_auctions: 0, total_sold: 0, total_revenue: 0 };
        // 메모리에서 라이브 카운트 집계
        let liveCount = 0;
        let ongoingCount = 0;
        let endedCount = 0;
        for (const live of memory_1.lives.values()) {
            if (live.sellerId === userId) {
                liveCount++;
                if (live.status === 'live')
                    ongoingCount++;
                else
                    endedCount++;
            }
        }
        res.json({
            userId: Number(userId),
            stats: {
                liveCount,
                endedCount,
                ongoingCount,
                totalRevenue: Number(dbStats.total_revenue),
                totalAuctions: Number(dbStats.total_auctions),
                totalSoldAuctions: Number(dbStats.total_sold),
            },
        });
    }
    catch (err) {
        console.error('[users] GET /:id/dashboard-summary error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/bids — 입찰 기록
router.get('/:id/bids', async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute(`SELECT
         b.id         AS bid_id,
         b.auction_id AS auction_id,
         b.price      AS bid_price,
         b.created_at AS bid_at,
         a.product_name,
         a.top_bidder_id,
         b.bidder_id
       FROM bids b
       JOIN auctions a ON a.id = b.auction_id
       WHERE b.bidder_id = ?
       ORDER BY b.created_at DESC`, [userId]);
        const bids = rows;
        const result = bids.map(b => ({
            auctionId: b.auction_id,
            liveId: null, // auctions 테이블에 live_id 컬럼 없음
            productName: b.product_name,
            bidPrice: b.bid_price,
            isWinner: b.top_bidder_id !== null && b.top_bidder_id === b.bidder_id,
            bidAt: b.bid_at,
        }));
        res.json(result);
    }
    catch (err) {
        console.error('[users] GET /:id/bids error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
exports.default = router;
