import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/mysql';
import { getRecommendationsByCategories, getPersonalizedRecommendations, hasBidOrPurchaseHistory } from '../utils/productRecommender';

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

      // 구매+입찰 이력이 전무하면 추천 자체를 숨긴다(프론트에서 섹션 숨김 처리).
      if (!(await hasBidOrPurchaseHistory(payload.userId))) {
        return res.json({ recommendations: [], noHistory: true });
      }

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

/**
 * GET /api/recommendations/personalized
 * 구매내역(상품명 키워드) + 관심 카테고리 혼합 개인화 추천.
 * 토큰 필수. 구매내역·관심사 모두 없으면 전체 카테고리 인기순 fallback.
 */
router.get('/personalized', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 8, 50);

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    // 비로그인: 전체 카테고리 fallback
    return res.json({ recommendations: getRecommendationsByCategories(ALL_CATEGORIES, limit) });
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };

    // 구매+입찰 이력이 전무하면 fallback으로 채우지 않고 숨김 플래그만 반환.
    if (!(await hasBidOrPurchaseHistory(payload.userId))) {
      return res.json({ recommendations: [], noHistory: true });
    }

    // 관심 카테고리
    const [userRows] = await pool.query<any[]>(
      'SELECT interests FROM users WHERE id = ?',
      [payload.userId]
    );
    const interests: string[] = userRows.length > 0 && userRows[0].interests
      ? String(userRows[0].interests).split(',').map((c) => c.trim()).filter(Boolean)
      : [];

    // 구매내역 — direct/auction 낙찰 상품명 (최근 30건)
    const [orderRows] = await pool.query<any[]>(
      `SELECT product_name FROM auctions
       WHERE top_bidder_id = ? AND status = 'ended'
       ORDER BY ends_at DESC LIMIT 30`,
      [payload.userId]
    );
    const purchasedNames: string[] = orderRows
      .map((r) => String(r.product_name || ''))
      .filter(Boolean);

    let recommendations = getPersonalizedRecommendations(purchasedNames, interests, limit);

    // 개인화 결과가 비면 fallback
    if (recommendations.length === 0) {
      const cats = interests.length > 0 ? interests : ALL_CATEGORIES;
      recommendations = getRecommendationsByCategories(cats, limit);
    }
    return res.json({ recommendations });
  } catch {
    return res.json({ recommendations: getRecommendationsByCategories(ALL_CATEGORIES, limit) });
  }
});

export default router;
