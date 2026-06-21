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
// GET /api/market-prices/:itemCode/history?kindName=후지&days=30
router.get('/:itemCode/history', async (req, res) => {
    const { itemCode } = req.params;
    const kindName = String(req.query.kindName || '');
    const days = Math.min(Number(req.query.days) || 30, 90);
    const rows = await (0, kamis_1.getPriceHistory)(itemCode, kindName, days);
    res.json(rows);
});
exports.default = router;
