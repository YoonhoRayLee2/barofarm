"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mysql_1 = __importDefault(require("../db/mysql"));
const auth_1 = require("../services/auth");
const nickname_1 = require("../services/nickname");
const jwt_1 = require("../services/jwt");
const auth_2 = require("../middleware/auth");
const phone_1 = require("../utils/phone");
const router = (0, express_1.Router)();
// ─── POST /api/auth/signup ────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
    const { username, password, phone } = req.body;
    // 입력 검증
    if (!username || !password || !phone) {
        res.status(400).json({ error: 'username, password, phone are required' });
        return;
    }
    if (!/^[a-zA-Z0-9_]{4,30}$/.test(username)) {
        res.status(400).json({ error: 'username must be 4–30 alphanumeric/underscore characters' });
        return;
    }
    if (password.length < 8) {
        res.status(400).json({ error: 'password must be at least 8 characters' });
        return;
    }
    const normalizedPhone = (0, phone_1.normalizePhone)(phone);
    if (!normalizedPhone) {
        res.status(400).json({ error: 'phone must match 010-XXXX-XXXX or 010XXXXXXXX format' });
        return;
    }
    try {
        const nickname = await (0, nickname_1.generateUniqueNickname)();
        const passwordHash = await (0, auth_1.hashPassword)(password);
        const [result] = await mysql_1.default.execute(`INSERT INTO users (username, password_hash, nickname, phone, name, role)
       VALUES (?, ?, ?, ?, ?, 'buyer')`, [username, passwordHash, nickname, normalizedPhone, username]);
        const userId = result.insertId;
        const tokenPayload = { userId, username };
        const token = (0, jwt_1.signToken)(tokenPayload);
        const refreshToken = (0, jwt_1.signRefreshToken)(tokenPayload);
        res.status(201).json({
            user: { id: userId, username, nickname, phone: normalizedPhone },
            token,
            refreshToken,
        });
    }
    catch (err) {
        const mysqlErr = err;
        if (mysqlErr.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ error: 'username or phone already exists' });
            return;
        }
        console.error('[auth] POST /signup error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'username and password are required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute('SELECT id, username, password_hash, nickname, phone FROM users WHERE username = ?', [username]);
        const user = rows[0];
        if (!user) {
            res.status(401).json({ error: 'Invalid username or password' });
            return;
        }
        const valid = await (0, auth_1.verifyPassword)(password, user.password_hash);
        if (!valid) {
            res.status(401).json({ error: 'Invalid username or password' });
            return;
        }
        const tokenPayload = { userId: user.id, username: user.username };
        const token = (0, jwt_1.signToken)(tokenPayload);
        const refreshToken = (0, jwt_1.signRefreshToken)(tokenPayload);
        res.json({
            user: { id: user.id, username: user.username, nickname: user.nickname, phone: user.phone },
            token,
            refreshToken,
        });
    }
    catch (err) {
        console.error('[auth] POST /login error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        res.status(400).json({ error: 'refreshToken is required' });
        return;
    }
    const payload = (0, jwt_1.verifyToken)(refreshToken);
    if (!payload) {
        res.status(401).json({ error: 'Invalid or expired refresh token' });
        return;
    }
    const newToken = (0, jwt_1.signToken)({ userId: payload.userId, username: payload.username });
    res.json({ token: newToken });
});
// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', auth_2.requireAuth, async (req, res) => {
    try {
        const [rows] = await mysql_1.default.execute('SELECT id, username, nickname, phone, role, created_at FROM users WHERE id = ?', [req.user.userId]);
        const user = rows[0];
        if (!user) {
            res.status(404).json({ error: 'user not found' });
            return;
        }
        res.json(user);
    }
    catch (err) {
        console.error('[auth] GET /me error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
exports.default = router;
