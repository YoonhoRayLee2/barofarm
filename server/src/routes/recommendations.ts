import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/mysql';
import { getRecommendationsByCategories } from '../utils/productRecommender';

const router = Router();

const ALL_CATEGORIES = ['과일', '채소', '수산', '축산', '곡물', '기타'];

router.get('/by-interests', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 8, 50);

  // 쿼리 파라미터 우선
  if (req.query.categories) {
    const categories = (req.query.categories as string)
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const recommendations = getRecommendationsByCategories(categories, limit);
    return res.json({ recommendations });
  }

  // 토큰에서 관심 카테고리 조회
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
      const [rows] = await pool.query<any[]>(
        'SELECT interests FROM users WHERE id = ?',
        [payload.userId]
      );
      // interests는 콤마구분 문자열("과일,채소")로 저장됨 (users.ts 참고)
      if (rows.length > 0 && rows[0].interests) {
        const interests: string[] = String(rows[0].interests)
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean);
        if (interests.length > 0) {
          const recommendations = getRecommendationsByCategories(interests, limit);
          return res.json({ recommendations });
        }
      }
    } catch {
      // 토큰 오류 시 fallback
    }
  }

  // fallback: 전체 카테고리
  const recommendations = getRecommendationsByCategories(ALL_CATEGORIES, limit);
  return res.json({ recommendations });
});

export default router;
