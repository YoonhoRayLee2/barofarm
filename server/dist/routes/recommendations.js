"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mysql_1 = __importDefault(require("../db/mysql"));
const productRecommender_1 = require("../utils/productRecommender");
const router = (0, express_1.Router)();
const ALL_CATEGORIES = ['과일', '채소', '수산', '축산', '곡물', '기타'];
router.get('/by-interests', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 8, 50);
    // 쿼리 파라미터 우선
    if (req.query.categories) {
        const categories = req.query.categories
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean);
        const recommendations = (0, productRecommender_1.getRecommendationsByCategories)(categories, limit);
        return res.json({ recommendations });
    }
    // 토큰에서 관심 카테고리 조회
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
            const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
            const [rows] = await mysql_1.default.query('SELECT interests FROM users WHERE id = ?', [payload.userId]);
            // interests는 콤마구분 문자열("과일,채소")로 저장됨 (users.ts 참고)
            if (rows.length > 0 && rows[0].interests) {
                const interests = String(rows[0].interests)
                    .split(',')
                    .map((c) => c.trim())
                    .filter(Boolean);
                if (interests.length > 0) {
                    const recommendations = (0, productRecommender_1.getRecommendationsByCategories)(interests, limit);
                    return res.json({ recommendations });
                }
            }
        }
        catch {
            // 토큰 오류 시 fallback
        }
    }
    // fallback: 전체 카테고리
    const recommendations = (0, productRecommender_1.getRecommendationsByCategories)(ALL_CATEGORIES, limit);
    return res.json({ recommendations });
});
exports.default = router;
