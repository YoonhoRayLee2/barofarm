"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mysql_1 = __importDefault(require("../db/mysql"));
const memory_1 = require("../store/memory");
const recommender_1 = require("../services/recommender/recommender");
const router = (0, express_1.Router)();
const recommender = (0, recommender_1.createRecommender)();
const WIN_QUERY = `
  SELECT
    a.id,
    a.product_name,
    a.current_price,
    a.top_bidder_id,
    u.nickname AS winner_nickname,
    l.category AS live_category,
    NULL AS description
  FROM auctions a
  LEFT JOIN users u ON u.id = a.top_bidder_id
  LEFT JOIN lives l ON l.id = a.live_id
  WHERE a.id = ? AND a.status = 'ended'
`;
// GET /api/recommend?auctionId=<id>&limit=<n>
router.get('/', async (req, res) => {
    const auctionId = req.query.auctionId?.trim();
    if (!auctionId) {
        res.status(400).json({ error: 'auctionId is required' });
        return;
    }
    const rawLimit = req.query.limit;
    const limit = rawLimit !== undefined ? parseInt(rawLimit, 10) : 5;
    if (isNaN(limit) || limit < 1 || limit > 10) {
        res.status(400).json({ error: 'limit must be between 1 and 10' });
        return;
    }
    // 1. 메모리에서 방금 종료된 경매 확인 (status === 'ended')
    let win = null;
    let winnerNickname;
    const memState = memory_1.auctions.get(auctionId);
    if (memState && memState.status === 'ended' && memState.topBidder) {
        win = {
            auctionId: memState.id,
            itemName: memState.productName,
            category: '기타', // 메모리 상태에는 category 없음 — DB fallback 시도
            finalPrice: memState.currentPrice,
        };
        winnerNickname = memState.topBidderName;
    }
    // 2. DB에서 조회 (메모리에 없거나 category 보완)
    let dbRow = null;
    try {
        const [rows] = await mysql_1.default.execute(WIN_QUERY, [auctionId]);
        dbRow = rows[0] ?? null;
    }
    catch (err) {
        console.error('[recommend] DB query error:', err);
        if (!win) {
            res.status(500).json({ error: 'database error' });
            return;
        }
        // DB 오류지만 메모리에 데이터 있으면 계속
    }
    if (dbRow) {
        win = {
            auctionId: dbRow.id,
            itemName: dbRow.product_name,
            category: dbRow.live_category ?? '기타',
            finalPrice: Number(dbRow.current_price),
            description: dbRow.description ?? undefined,
        };
        winnerNickname = dbRow.winner_nickname ?? undefined;
    }
    if (!win) {
        res.status(404).json({ error: '낙찰 정보를 찾을 수 없습니다. 진행 중이거나 존재하지 않는 경매입니다.' });
        return;
    }
    // 3. 추천 실행
    let recommendations;
    try {
        recommendations = await recommender.recommend(win, limit);
    }
    catch (err) {
        console.error('[recommend] recommender error:', err);
        res.status(500).json({ error: '추천 생성 중 오류가 발생했습니다' });
        return;
    }
    const algorithm = (process.env.RECOMMENDER_TYPE ?? 'rule') === 'ai' ? 'ai' : 'rule-based';
    res.json({
        auction: {
            id: win.auctionId,
            itemName: win.itemName,
            category: win.category,
            finalPrice: win.finalPrice,
            ...(winnerNickname ? { winnerNickname } : {}),
        },
        recommendations,
        meta: {
            algorithm,
            generatedAt: new Date().toISOString(),
        },
    });
});
exports.default = router;
