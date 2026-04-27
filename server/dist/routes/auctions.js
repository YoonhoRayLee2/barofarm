"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createAuctionRouter;
const express_1 = require("express");
const mysql_1 = __importDefault(require("../db/mysql"));
const memory_1 = require("../store/memory");
const livekit_service_1 = require("../services/livekit-service");
function createAuctionRouter(io) {
    const router = (0, express_1.Router)();
    router.post('/', async (req, res) => {
        try {
            const { sellerId, productName, startPrice } = req.body;
            const [result] = await mysql_1.default.query('INSERT INTO auctions (seller_id, product_name, start_price, current_price, status) VALUES (?, ?, ?, ?, ?)', [sellerId, productName, startPrice, startPrice, 'pending']);
            res.json({ id: result.insertId });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    router.get('/', async (_req, res) => {
        try {
            const [rows] = await mysql_1.default.query('SELECT * FROM auctions WHERE status != "ended" ORDER BY created_at DESC');
            res.json(rows);
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    router.get('/:id', async (req, res) => {
        try {
            const [rows] = await mysql_1.default.query('SELECT * FROM auctions WHERE id = ?', [req.params.id]);
            if (!rows.length) {
                res.status(404).json({ error: 'Not found' });
                return;
            }
            const memState = memory_1.auctions.get(String(req.params.id)) ?? {};
            res.json({ ...rows[0], ...memState });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    // 셀러가 라이브 시작 시 경매를 메모리로 올리고 DB status를 live로 변경
    router.patch('/:id/start', async (req, res) => {
        try {
            const [rows] = await mysql_1.default.query('SELECT * FROM auctions WHERE id = ?', [req.params.id]);
            if (!rows.length) {
                res.status(404).json({ error: 'Not found' });
                return;
            }
            const row = rows[0];
            if (row.status === 'live') {
                res.status(409).json({ error: '이미 진행 중인 경매입니다.' });
                return;
            }
            (0, memory_1.createAuction)(String(req.params.id), {
                productName: row.product_name,
                startPrice: row.start_price,
                sellerId: String(row.seller_id),
            });
            (0, memory_1.startTimer)(String(req.params.id), io, async (state) => {
                await (0, livekit_service_1.endAuction)(state);
            });
            await mysql_1.default.query('UPDATE auctions SET status = "live" WHERE id = ?', [req.params.id]);
            res.json({ success: true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    // 낙찰 처리 — 메모리 상태를 DB에 영구 저장
    router.patch('/:id/end', async (req, res) => {
        try {
            const auction = memory_1.auctions.get(String(req.params.id));
            if (!auction) {
                res.status(404).json({ error: 'Auction not in progress' });
                return;
            }
            await mysql_1.default.query('UPDATE auctions SET current_price = ?, top_bidder_id = ?, status = "ended", ends_at = NOW() WHERE id = ?', [auction.currentPrice, auction.topBidder, req.params.id]);
            (0, memory_1.stopTimer)(String(req.params.id));
            memory_1.auctions.delete(String(req.params.id));
            await (0, livekit_service_1.deleteRoom)(String(req.params.id)); // fire-and-forget (내부에서 에러 삼킴)
            res.json({ success: true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    return router;
}
