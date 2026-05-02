"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFavoritesRouter = createFavoritesRouter;
const express_1 = require("express");
const memory_1 = require("../store/memory");
function createFavoritesRouter(_io, pool) {
    const router = (0, express_1.Router)();
    // POST /api/favorites — 관심 라이브 토글
    router.post('/', async (req, res) => {
        const { userId, liveId } = req.body;
        if (!liveId) {
            res.status(400).json({ error: 'userId and liveId are required' });
            return;
        }
        const userIdNum = Number(userId);
        if (!userId || Number.isNaN(userIdNum)) {
            res.status(400).json({ error: 'userId must be a valid integer' });
            return;
        }
        try {
            const [existing] = await pool.execute('SELECT id FROM favorites WHERE user_id = ? AND live_id = ?', [userIdNum, liveId]);
            const rows = existing;
            if (rows.length > 0) {
                await pool.execute('DELETE FROM favorites WHERE user_id = ? AND live_id = ?', [userIdNum, liveId]);
                res.json({ favorited: false });
            }
            else {
                await pool.execute('INSERT INTO favorites (user_id, live_id) VALUES (?, ?)', [userIdNum, liveId]);
                res.json({ favorited: true });
            }
        }
        catch (err) {
            console.error('[favorites] POST error:', err);
            res.status(500).json({ error: 'database error' });
        }
    });
    // GET /api/favorites?userId=... — 관심 라이브 목록
    router.get('/', async (req, res) => {
        const { userId } = req.query;
        const userIdNum = Number(userId);
        if (!userId || Number.isNaN(userIdNum)) {
            res.status(400).json({ error: 'userId must be a valid integer' });
            return;
        }
        try {
            const [rows] = await pool.execute('SELECT live_id FROM favorites WHERE user_id = ?', [userIdNum]);
            const liveIds = rows.map(r => r.live_id);
            const result = liveIds.map(liveId => {
                const memLive = memory_1.lives.get(liveId);
                if (memLive) {
                    return {
                        liveId,
                        title: memLive.title,
                        sellerName: memLive.sellerId,
                        status: memLive.status,
                        thumbnailUrl: null,
                    };
                }
                // 메모리에 없으면 종료된 라이브
                return {
                    liveId,
                    title: null,
                    sellerName: null,
                    status: 'ended',
                    thumbnailUrl: null,
                };
            });
            res.json(result);
        }
        catch (err) {
            console.error('[favorites] GET error:', err);
            res.status(500).json({ error: 'database error' });
        }
    });
    return router;
}
