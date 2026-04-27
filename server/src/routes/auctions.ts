import { Router, Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { Server } from 'socket.io';
import db from '../db/mysql';
import { auctions, createAuction, startTimer, stopTimer } from '../store/memory';

interface AuctionRow extends RowDataPacket {
  id: number;
  seller_id: number;
  product_name: string;
  start_price: number;
  current_price: number;
  status: 'pending' | 'live' | 'ended';
  top_bidder_id: number | null;
  created_at: Date;
  ends_at: Date | null;
}

export default function createAuctionRouter(io: Server) {
const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { sellerId, productName, startPrice } = req.body;
  const [result] = await db.query<ResultSetHeader>(
    'INSERT INTO auctions (seller_id, product_name, start_price, current_price, status) VALUES (?, ?, ?, ?, ?)',
    [sellerId, productName, startPrice, startPrice, 'pending']
  );
  res.json({ id: result.insertId });
});

router.get('/', async (_req: Request, res: Response) => {
  const [rows] = await db.query<AuctionRow[]>(
    'SELECT * FROM auctions WHERE status != "ended" ORDER BY created_at DESC'
  );
  res.json(rows);
});

router.get('/:id', async (req: Request, res: Response) => {
  const [rows] = await db.query<AuctionRow[]>('SELECT * FROM auctions WHERE id = ?', [req.params.id]);
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
  const memState = auctions.get(String(req.params.id)) ?? {};
  res.json({ ...rows[0], ...memState });
});

// 셀러가 라이브 시작 시 경매를 메모리로 올리고 DB status를 live로 변경
router.patch('/:id/start', async (req: Request, res: Response) => {
  const [rows] = await db.query<AuctionRow[]>('SELECT * FROM auctions WHERE id = ?', [req.params.id]);
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
  const row = rows[0];
  createAuction(String(req.params.id), {
    productName: row.product_name,
    startPrice: row.start_price,
    sellerId: String(row.seller_id),
  });
  startTimer(String(req.params.id), io);
  await db.query('UPDATE auctions SET status = "live" WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// 낙찰 처리 — 메모리 상태를 DB에 영구 저장
router.patch('/:id/end', async (req: Request, res: Response) => {
  const auction = auctions.get(String(req.params.id));
  if (!auction) { res.status(404).json({ error: 'Auction not in progress' }); return; }
  await db.query(
    'UPDATE auctions SET current_price = ?, top_bidder_id = ?, status = "ended", ends_at = NOW() WHERE id = ?',
    [auction.currentPrice, auction.topBidder, req.params.id]
  );
  stopTimer(String(req.params.id));
  auctions.delete(String(req.params.id));
  res.json({ success: true });
});

return router;
}
