"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ACCESS_EXPIRES = '14d';
const REFRESH_EXPIRES = '30d';
function getSecret() {
    return process.env.JWT_SECRET ?? 'barofarm-insecure-dev-secret';
}
/**
 * access token 발급 (HS256, 14일 만료)
 */
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, getSecret(), {
        algorithm: 'HS256',
        expiresIn: ACCESS_EXPIRES,
    });
}
/**
 * refresh token 발급 (HS256, 30일 만료)
 */
function signRefreshToken(payload) {
    return jsonwebtoken_1.default.sign({ ...payload, type: 'refresh' }, getSecret(), {
        algorithm: 'HS256',
        expiresIn: REFRESH_EXPIRES,
    });
}
/**
 * 토큰 검증. 유효하면 payload 반환, 무효면 null.
 */
function verifyToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, getSecret());
        if (typeof decoded.userId !== 'number' || typeof decoded.username !== 'string') {
            return null;
        }
        return { userId: decoded.userId, username: decoded.username };
    }
    catch {
        return null;
    }
}
