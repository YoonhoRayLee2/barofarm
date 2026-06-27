import { Router, Request, Response } from 'express';
import pool from '../db/mysql';

interface ProductRow {
  id: number;
  seller_id: number;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  stock: number;
  features: string | null;
  attributes: string | null;
  status: string;
  created_at: string;
  seller_nickname: string | null;
  is_seasonal_bundle: number;
  subscriber_price: number | null;
  season_label: string | null;
}

interface ProductImageRow {
  product_id: number;
  image_url: string;
}

interface SellerRow {
  id: number;
  nickname: string;
  avatar_url: string | null;
  sales_count: number;
}

function formatProduct(row: ProductRow, extraImages: string[] = []) {
  return {
    id:               row.id,
    sellerId:         row.seller_id,
    sellerName:       row.seller_nickname ?? null,
    name:             row.name,
    description:      row.description,
    price:            row.price,
    stock:            row.stock ?? 1,
    category:         row.category,
    imageUrl:         row.image_url,
    features:         row.features,
    attributes:       row.attributes,
    status:           row.status,
    createdAt:        row.created_at,
    images:           extraImages,
    isSeasonalBundle: (row.is_seasonal_bundle ?? 0) === 1,
    subscriberPrice:  null,
    seasonLabel:      row.season_label ?? null,
  };
}

const router = Router();

// GET /api/search?q=&category=&minPrice=&maxPrice=
router.get('/', async (req: Request, res: Response) => {
  const q         = req.query.q         ? String(req.query.q).trim()         : '';
  const category  = req.query.category  ? String(req.query.category).trim()  : '';
  const minPrice  = req.query.minPrice  ? Number(req.query.minPrice)          : null;
  const maxPrice  = req.query.maxPrice  ? Number(req.query.maxPrice)          : null;

  // 파라미터가 하나도 없으면 빈 결과 반환
  if (!q && !category && minPrice === null && maxPrice === null) {
    res.json({ products: [], sellers: [] });
    return;
  }

  try {
    // ── 상품 검색 ──────────────────────────────────────────────
    const productConditions: string[] = ["p.status = 'active'"];
    const productParams: (string | number)[] = [];

    if (q) {
      productConditions.push('(p.name LIKE ? OR p.description LIKE ?)');
      productParams.push(`%${q}%`, `%${q}%`);
    }
    if (category && category !== '전체') {
      productConditions.push('p.category = ?');
      productParams.push(category);
    }
    if (minPrice !== null && !isNaN(minPrice)) {
      productConditions.push('p.price >= ?');
      productParams.push(minPrice);
    }
    if (maxPrice !== null && !isNaN(maxPrice)) {
      productConditions.push('p.price <= ?');
      productParams.push(maxPrice);
    }

    const [productRows] = await pool.execute(
      `SELECT p.*, u.nickname AS seller_nickname
       FROM products p
       LEFT JOIN users u ON u.id = p.seller_id
       WHERE ${productConditions.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT 50`,
      productParams,
    ) as [ProductRow[], unknown];

    const extraMap: Record<number, string[]> = {};
    if (productRows.length > 0) {
      const ids = productRows.map(r => r.id);
      const [imgRows] = await pool.query(
        'SELECT product_id, image_url FROM product_images WHERE product_id IN (?) ORDER BY sort_order',
        [ids],
      ) as [ProductImageRow[], unknown];
      imgRows.forEach(r => {
        if (!extraMap[r.product_id]) extraMap[r.product_id] = [];
        extraMap[r.product_id].push(r.image_url);
      });
    }

    const products = productRows.map(r => formatProduct(r, extraMap[r.id] ?? []));

    // ── 판매자 검색 (q가 있을 때만) ────────────────────────────
    let sellers: { id: number; nickname: string; avatarUrl: string | null; salesCount: number }[] = [];
    if (q) {
      const [sellerRows] = await pool.execute(
        `SELECT u.id, u.nickname, u.avatar_url,
                (SELECT COUNT(*) FROM auctions a WHERE a.seller_id = u.id AND a.status = 'ended') AS sales_count
         FROM users u
         WHERE u.role = 'seller' AND u.nickname LIKE ?
         LIMIT 20`,
        [`%${q}%`],
      ) as [SellerRow[], unknown];

      sellers = sellerRows.map(r => ({
        id:         r.id,
        nickname:   r.nickname,
        avatarUrl:  r.avatar_url,
        salesCount: Number(r.sales_count),
      }));
    }

    res.json({ products, sellers });
  } catch (err) {
    console.error('[search] GET error:', err);
    res.status(500).json({ error: '검색에 실패했습니다.' });
  }
});

export default router;
