"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mysql_1 = __importDefault(require("../db/mysql"));
const auth_1 = require("../services/auth");
const nickname_1 = require("../services/nickname");
const jwt_1 = require("../services/jwt");
const auth_2 = require("../middleware/auth");
const phone_1 = require("../utils/phone");
const JWT_SECRET = process.env.JWT_SECRET;
const router = (0, express_1.Router)();
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요' },
    standardHeaders: true,
    legacyHeaders: false,
});
// ─── POST /api/auth/signup ────────────────────────────────────────────────────
router.post('/signup', authLimiter, async (req, res) => {
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
            const msg = mysqlErr.sqlMessage || '';
            if (msg.includes('phone')) {
                res.status(409).json({ error: 'phone already exists' });
            }
            else {
                res.status(409).json({ error: 'username already exists' });
            }
            return;
        }
        console.error('[auth] POST /signup error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'username and password are required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute('SELECT id, username, password_hash, nickname, phone, interests FROM users WHERE username = ?', [username]);
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
        const interests = user.interests
            ? user.interests.split(',').map((s) => s.trim()).filter(Boolean)
            : [];
        res.json({
            user: { id: user.id, username: user.username, nickname: user.nickname, phone: user.phone, interests },
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
// ─── POST /api/auth/verify-identity ──────────────────────────────────────────
router.post('/verify-identity', authLimiter, async (req, res) => {
    const { username, phone } = req.body;
    if (!username || !phone) {
        res.status(400).json({ error: '아이디와 휴대폰 번호를 입력해 주세요' });
        return;
    }
    const normalizedPhone = (0, phone_1.normalizePhone)(phone);
    if (!normalizedPhone) {
        res.status(400).json({ error: 'phone must match 010-XXXX-XXXX or 010XXXXXXXX format' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute('SELECT id FROM users WHERE username = ? AND phone = ?', [username, normalizedPhone]);
        const user = rows[0];
        if (!user) {
            res.status(404).json({ error: '일치하는 계정을 찾을 수 없습니다' });
            return;
        }
        const resetToken = jsonwebtoken_1.default.sign({ userId: user.id, purpose: 'reset' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '10m' });
        res.json({ resetToken });
    }
    catch (err) {
        console.error('[auth] POST /verify-identity error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post('/reset-password', authLimiter, async (req, res) => {
    const { resetToken, newPassword } = req.body;
    if (!resetToken) {
        res.status(400).json({ error: 'resetToken is required' });
        return;
    }
    if (!newPassword || newPassword.length < 8) {
        res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(resetToken, JWT_SECRET);
        if (decoded.purpose !== 'reset') {
            res.status(400).json({ error: '유효하지 않은 토큰입니다' });
            return;
        }
        const passwordHash = await (0, auth_1.hashPassword)(newPassword);
        await mysql_1.default.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, decoded.userId]);
        res.json({ ok: true });
    }
    catch (err) {
        console.error('[auth] POST /reset-password error:', err);
        res.status(400).json({ error: '토큰이 만료됐거나 유효하지 않습니다' });
    }
});
exports.default = router;
