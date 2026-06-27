import { Router, Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';

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
  seller_nickname?: string | null;
  is_seasonal_bundle?: number;
  subscriber_price?: number | null;
  season_label?: string | null;
}

function formatProduct(row: ProductRow) {
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
    isSeasonalBundle: (row.is_seasonal_bundle ?? 0) === 1,
    subscriberPrice:  row.subscriber_price ?? null,
    seasonLabel:      row.season_label ?? null,
  };
}

export function createWishlistRouter(pool: Pool): Router {
  const router = Router();

  // POST /api/wishlist — 상품 찜 토글
  router.post('/', async (req: Request, res: Response) => {
    const { userId, productId } = req.body as { userId?: unknown; productId?: unknown };
    const userIdNum = Number(userId);
    const productIdNum = Number(productId);
    if (!userId || Number.isNaN(userIdNum)) {
      res.status(400).json({ error: 'userId must be a valid integer' });
      return;
    }
    if (!productId || Number.isNaN(productIdNum)) {
      res.status(400).json({ error: 'productId must be a valid integer' });
      return;
    }

    try {
      const [existing] = await pool.execute(
        'SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?',
        [userIdNum, productIdNum],
      );
      const rows = existing as unknown[];

      if (rows.length > 0) {
        await pool.execute(
          'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?',
          [userIdNum, productIdNum],
        );
        res.json({ wishlisted: false });
      } else {
        await pool.execute(
          'INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)',
          [userIdNum, productIdNum],
        );
        res.json({ wishlisted: true });
      }
    } catch (err) {
      console.error('[wishlist] POST error:', err);
      res.status(500).json({ error: 'database error' });
    }
  });

  // GET /api/wishlist?userId= — 찜한 상품 목록
  router.get('/', async (req: Request, res: Response) => {
    const { userId } = req.query as { userId?: string };
    const userIdNum = Number(userId);
    if (!userId || Number.isNaN(userIdNum)) {
      res.status(400).json({ error: 'userId must be a valid integer' });
      return;
    }

    try {
      const [rows] = await pool.execute(
        `SELECT p.*, u.nickname AS seller_nickname
         FROM wishlist w
         JOIN products p ON p.id = w.product_id
         LEFT JOIN users u ON u.id = p.seller_id
         WHERE w.user_id = ?
         ORDER BY w.created_at DESC`,
        [userIdNum],
      ) as [ProductRow[], unknown];

      res.json(rows.map(r => formatProduct(r)));
    } catch (err) {
      console.error('[wishlist] GET error:', err);
      res.status(500).json({ error: 'database error' });
    }
  });

  return router;
}
