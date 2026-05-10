import { Router } from 'express';
import { getTodayPrices, getPriceHistory } from '../services/kamis';

const router = Router();

// GET /api/market-prices
router.get('/', async (req, res) => {
  const rows = await getTodayPrices();
  res.json(rows);
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
