import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import pool from '../db/mysql';

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'timelines');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, _file, cb) => cb(null, `tmp_${Date.now()}.jpg`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('이미지 파일만 허용됩니다.'));
  },
});

const VALID_STAGES = ['harvest', 'packing', 'departed', 'arrived'] as const;
type Stage = typeof VALID_STAGES[number];

const router = Router();

// POST /api/timelines
router.post('/', upload.single('photo'), async (req: Request, res: Response) => {
  const { auction_id, stage, farmer_note, userId } = req.body;
  const tmpFile = req.file;

  const cleanup = () => {
    if (tmpFile) fs.unlink(tmpFile.path, () => {});
  };

  if (!VALID_STAGES.includes(stage as Stage)) {
    cleanup();
    return res.status(400).json({ error: 'stage 값이 올바르지 않습니다.' });
  }

  if (!auction_id) {
    cleanup();
    return res.status(400).json({ error: 'auction_id가 필요합니다.' });
  }

  try {
    const [rows] = await pool.execute<any[]>(
      'SELECT seller_id FROM auctions WHERE id = ?',
      [auction_id]
    );
    if (!rows.length) {
      cleanup();
      return res.status(404).json({ error: '경매를 찾을 수 없습니다.' });
    }

    const { seller_id } = rows[0];
    if (String(userId) !== String(seller_id)) {
      cleanup();
      return res.status(403).json({ error: '판매자만 업로드할 수 있습니다.' });
    }

    if (!tmpFile && !farmer_note) {
      cleanup();
      return res.status(400).json({ error: '사진 또는 한마디가 필요합니다.' });
    }

    let photo_url: string | null = null;
    if (tmpFile) {
      const filename = `${auction_id}_${stage}_${Date.now()}.jpg`;
      const dest = path.join(UPLOADS_DIR, filename);
      fs.renameSync(tmpFile.path, dest);
      photo_url = `/uploads/timelines/${filename}`;
    }

    const [result] = await pool.execute<any>(
      'INSERT INTO delivery_timeline (auction_id, stage, photo_url, farmer_note) VALUES (?, ?, ?, ?)',
      [auction_id, stage, photo_url, farmer_note ?? null]
    );

    const insertId = result.insertId;
    const [newRows] = await pool.execute<any[]>(
      'SELECT id, stage, photo_url, farmer_note, created_at FROM delivery_timeline WHERE id = ?',
      [insertId]
    );
    const row = newRows[0];
    return res.status(201).json({
      id: row.id,
      stage: row.stage,
      photoUrl: row.photo_url,
      farmerNote: row.farmer_note,
      createdAt: row.created_at,
    });
  } catch (err) {
    cleanup();
    console.error('[timelines] POST error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

// GET /api/timelines/:auctionId
router.get('/:auctionId', async (req: Request, res: Response) => {
  const { auctionId } = req.params;
  const { userId } = req.query;

  try {
    const [rows] = await pool.execute<any[]>(
      'SELECT seller_id, top_bidder_id FROM auctions WHERE id = ?',
      [auctionId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: '경매를 찾을 수 없습니다.' });
    }

    const { seller_id, top_bidder_id } = rows[0];
    const uid = String(userId ?? '');
    if (uid !== String(seller_id) && uid !== String(top_bidder_id)) {
      return res.status(403).json({ error: '조회 권한이 없습니다.' });
    }

    const [items] = await pool.execute<any[]>(
      'SELECT id, stage, photo_url, farmer_note, created_at FROM delivery_timeline WHERE auction_id = ? ORDER BY created_at ASC',
      [auctionId]
    );

    return res.json({
      items: items.map(r => ({
        id: r.id,
        stage: r.stage,
        photoUrl: r.photo_url,
        farmerNote: r.farmer_note,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('[timelines] GET error:', err);
    return res.status(500).json({ error: '서버 오류' });
  }
});

export default router;
