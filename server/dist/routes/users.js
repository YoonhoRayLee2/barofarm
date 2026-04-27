"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mysql_1 = __importDefault(require("../db/mysql"));
const router = (0, express_1.Router)();
router.post('/', async (req, res) => {
    const { name, phone, role } = req.body;
    if (!name || !phone || !role) {
        res.status(400).json({ error: 'name, phone, role are required' });
        return;
    }
    if (role !== 'seller' && role !== 'buyer') {
        res.status(400).json({ error: 'role must be seller or buyer' });
        return;
    }
    try {
        await mysql_1.default.execute(`INSERT INTO users (name, phone, role) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)`, [name, phone, role]);
        const [rows] = await mysql_1.default.execute('SELECT id, name, phone, role, created_at FROM users WHERE phone = ?', [phone]);
        res.json(rows[0]);
    }
    catch (err) {
        console.error('[users] POST error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
exports.default = router;
