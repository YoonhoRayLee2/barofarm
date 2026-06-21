import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

interface MallProduct {
  id: string;
  category: string;
  subCategory: string;
  name: string;
  origin: string;
  price: number;
  unit: string;
  description: string;
  imageUrl: string;
  tags: string[];
  complementaryHints: string[];
  priceTier: 'low' | 'mid' | 'high';
  stock: number;
  createdAt: string;
}

// 모듈 로드 시 1회만 읽어 메모리 캐시
const dataPath = path.join(__dirname, '..', '..', 'public', 'data', 'mall-products.json');
const _products: MallProduct[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as MallProduct[];

// GET /api/mall/products?category=&q=&limit=20&offset=0
router.get('/products', (req: Request, res: Response) => {
  const category = (req.query.category as string | undefined)?.trim();
  const q = (req.query.q as string | undefined)?.trim().toLowerCase();
  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
  const offset = parseInt((req.query.offset as string) || '0', 10);

  let filtered = _products;

  if (category) {
    filtered = filtered.filter(p => p.category === category);
  }

  if (q) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q)),
    );
  }

  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit);

  res.json({ items, total });
});

// GET /api/mall/products/:id
router.get('/products/:id', (req: Request, res: Response) => {
  const product = _products.find(p => p.id === req.params.id);
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json(product);
});

// GET /api/mall/categories
router.get('/categories', (_req: Request, res: Response) => {
  const counts: Record<string, number> = {};
  for (const p of _products) {
    counts[p.category] = (counts[p.category] ?? 0) + 1;
  }
  const result = Object.entries(counts).map(([category, count]) => ({ category, count }));
  res.json(result);
});

export default router;
