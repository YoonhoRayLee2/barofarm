"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.optionalAuth = optionalAuth;
const jwt_1 = require("../services/jwt");
/**
 * Authorization: Bearer <token> 헤더를 파싱하여 req.user를 설정한다.
 * 토큰 누락 또는 무효 시 401 응답.
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authorization header missing or malformed' });
        return;
    }
    const token = authHeader.slice(7);
    const payload = (0, jwt_1.verifyToken)(token);
    if (!payload) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }
    req.user = payload;
    next();
}
/**
 * 토큰이 있으면 파싱하여 req.user를 설정하고, 없으면 그냥 통과한다.
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = (0, jwt_1.verifyToken)(token);
        if (payload) {
            req.user = payload;
        }
    }
    next();
}
