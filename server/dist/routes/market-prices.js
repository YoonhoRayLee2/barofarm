"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const kamis_1 = require("../services/kamis");

const router = (0, express_1.Router)();
// GET /api/market-prices
router.get('/', async (req, res) => {
    const rows = await (0, kamis_1.getTodayPrices)();
    res.json(rows);
});
// GET /api/market-prices/match?name=...&category=...
router.get('/match', async (req, res) => {
    const name = String(req.query.name || '').trim();
    const category = req.query.category ? String(req.query.category) : undefined;
    if (!name)
        return res.status(400).json({ error: 'name query param required' });
    const price = await (0, kamis_1.matchMarketPrice)(name, category);
    if (!price)
        return res.json({ matched: false });
    const trend = await (0, kamis_1.getPriceTrend)(price.itemCode, price.kindName);
    return res.json({ matched: true, price, ...(trend ? { trend } : {}) });
});
// GET /api/market-prices/:itemCode/history?kindName=후지&days=30
router.get('/:itemCode/history', async (req, res) => {
    const { itemCode } = req.params;
    const kindName = String(req.query.kindName || '');
    const days = Math.min(Number(req.query.days) || 30, 90);
    const rows = await (0, kamis_1.getPriceHistory)(itemCode, kindName, days);
    res.json(rows);
});
exports.default = router;
