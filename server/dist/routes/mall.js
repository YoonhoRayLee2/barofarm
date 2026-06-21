"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
// 모듈 로드 시 1회만 읽어 메모리 캐시
const dataPath = path_1.default.join(__dirname, '..', '..', 'public', 'data', 'mall-products.json');
const _products = JSON.parse(fs_1.default.readFileSync(dataPath, 'utf-8'));
// GET /api/mall/products?category=&q=&limit=20&offset=0
router.get('/products', (req, res) => {
    const category = req.query.category?.trim();
    const q = req.query.q?.trim().toLowerCase();
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const offset = parseInt(req.query.offset || '0', 10);
    let filtered = _products;
    if (category) {
        filtered = filtered.filter(p => p.category === category);
    }
    if (q) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.tags.some(t => t.toLowerCase().includes(q)));
    }
    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit);
    res.json({ items, total });
});
// GET /api/mall/products/:id
router.get('/products/:id', (req, res) => {
    const product = _products.find(p => p.id === req.params.id);
    if (!product) {
        res.status(404).json({ error: 'Product not found' });
        return;
    }
    res.json(product);
});
// GET /api/mall/categories
router.get('/categories', (_req, res) => {
    const counts = {};
    for (const p of _products) {
        counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    const result = Object.entries(counts).map(([category, count]) => ({ category, count }));
    res.json(result);
});
exports.default = router;
