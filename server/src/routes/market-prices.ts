import { Router } from 'express';
import { getTodayPrices, getPriceHistory, matchMarketPrice, getPriceTrend } from '../services/kamis';

const router = Router();

// GET /api/market-prices
router.get('/', async (req, res) => {
  const rows = await getTodayPrices();
  res.json(rows);
});

// GET /api/market-prices/match?name=...&category=...
router.get('/match', async (req, res) => {
  const name = String(req.query.name || '').trim();
  const category = req.query.category ? String(req.query.category) : undefined;
  if (!name) return res.status(400).json({ error: 'name query param required' });

  const price = await matchMarketPrice(name, category);
  if (!price) return res.json({ matched: false });

  const trend = await getPriceTrend(price.itemCode, price.kindName);
  return res.json({ matched: true, price, ...(trend ? { trend } : {}) });
});

// GET /api/market-prices/:itemCode/history?kindName=후지&days=30
router.get('/:itemCode/history', async (req, res) => {
  const { itemCode } = req.params;
  const kindName = String(req.query.kindName || '');
  const days = Math.min(Number(req.query.days) || 30, 90);
  const rows = await getPriceHistory(itemCode, kindName, days);
  res.json(rows);
});

export default router;
