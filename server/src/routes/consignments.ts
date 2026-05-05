import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import pool from '../db/mysql';

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'consignments');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const router = Router();

// POST /api/consignments — 위탁 신청 제출 (multipart/form-data)
router.post('/', upload.array('images', 5), async (req: Request, res: Response) => {
  const {
    buyerId, consignmentType, category, quantity, expectedPrice,
    description, minPriceType, commissionRate, commissionNegotiable,
  } = req.body;

  if (!buyerId || !consignmentType || !category || !quantity || !expectedPrice || !description || !commissionRate) {
    return res.status(400).json({ error: 'required fields missing' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query<any>(
      `INSERT INTO consignments
         (buyer_id, consignment_type, category, quantity, expected_price, description, min_price_type, commission_rate, commission_negotiable)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(buyerId), consignmentType, category,
        Number(quantity), Number(expectedPrice),
        description, minPriceType || 'none',
        Number(commissionRate), commissionNegotiable === 'true' || commissionNegotiable === true ? 1 : 0,
      ],
    );
    const consignmentId = result.insertId;

    // 이미지 저장
    const files = (req.files as Express.Multer.File[]) || [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const filename = `${consignmentId}_${i}${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.buffer);
      const imageUrl = `/uploads/consignments/${filename}`;
      await conn.query(
        'INSERT INTO consignment_images (consignment_id, image_url, is_primary, display_order) VALUES (?, ?, ?, ?)',
        [consignmentId, imageUrl, i === 0 ? 1 : 0, i],
      );
    }

    await conn.commit();
    res.status(201).json({ id: consignmentId });
  } catch (err) {
    await conn.rollback();
    console.error('[consignments] POST /', err);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    conn.release();
  }
});

// GET /api/consignments?category= — 목록 (판매자용)
router.get('/', async (req: Request, res: Response) => {
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  try {
    const params: any[] = [];
    let where = "WHERE c.status = 'pending'";
    if (category) { where += ' AND c.category = ?'; params.push(category); }

    const [rows] = await pool.query<any[]>(
      `SELECT
         c.id, c.consignment_type, c.category, c.quantity, c.expected_price,
         c.description, c.min_price_type, c.commission_rate, c.commission_negotiable,
         c.created_at,
         u.nickname AS buyer_name, u.avatar_url AS buyer_avatar,
         (SELECT ci.image_url FROM consignment_images ci
          WHERE ci.consignment_id = c.id AND ci.is_primary = 1 LIMIT 1) AS primary_image
       FROM consignments c
       JOIN users u ON u.id = c.buyer_id
       ${where}
       ORDER BY c.created_at DESC`,
      params,
    );

    res.json(rows.map((r: any) => ({
      id: r.id,
      consignmentType: r.consignment_type,
      category: r.category,
      quantity: Number(r.quantity),
      expectedPrice: Number(r.expected_price),
      description: r.description,
      minPriceType: r.min_price_type,
      commissionRate: Number(r.commission_rate),
      commissionNegotiable: Boolean(r.commission_negotiable),
      createdAt: r.created_at,
      buyerName: r.buyer_name || '익명',
      buyerAvatar: r.buyer_avatar ?? null,
      primaryImage: r.primary_image ?? null,
    })));
  } catch (err) {
    console.error('[consignments] GET /', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/consignments/:id — 상세
router.get('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT
         c.id, c.buyer_id, c.consignment_type, c.category, c.quantity, c.expected_price,
         c.description, c.min_price_type, c.commission_rate, c.commission_negotiable,
         c.status, c.created_at,
         u.nickname AS buyer_name, u.avatar_url AS buyer_avatar
       FROM consignments c
       JOIN users u ON u.id = c.buyer_id
       WHERE c.id = ?`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });

    const [imgRows] = await pool.query<any[]>(
      'SELECT image_url, is_primary, display_order FROM consignment_images WHERE consignment_id = ? ORDER BY display_order ASC',
      [id],
    );

    const r = rows[0];
    res.json({
      id: r.id,
      buyerId: r.buyer_id,
      consignmentType: r.consignment_type,
      category: r.category,
      quantity: Number(r.quantity),
      expectedPrice: Number(r.expected_price),
      description: r.description,
      minPriceType: r.min_price_type,
      commissionRate: Number(r.commission_rate),
      commissionNegotiable: Boolean(r.commission_negotiable),
      status: r.status,
      createdAt: r.created_at,
      buyerName: r.buyer_name || '익명',
      buyerAvatar: r.buyer_avatar ?? null,
      images: imgRows.map((i: any) => i.image_url),
    });
  } catch (err) {
    console.error('[consignments] GET /:id', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/consignments/:id/match — 매칭 신청 (판매자)
// 신청 후 buyer↔seller 간 DM 채팅방 생성
router.post('/:id/match', async (req: Request, res: Response) => {
  const consignmentId = Number(req.params.id);
  const { sellerId } = req.body;
  if (!sellerId) return res.status(400).json({ error: 'sellerId required' });

  try {
    const [rows] = await pool.query<any[]>(
      'SELECT buyer_id, status FROM consignments WHERE id = ?', [consignmentId],
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    if (rows[0].status !== 'pending') return res.status(409).json({ error: 'already_matched' });

    const buyerId = rows[0].buyer_id;

    // DM 채팅방 찾기 or 생성
    const [existing] = await pool.query<any[]>(
      `SELECT cr.id FROM chat_rooms cr
       JOIN chat_room_members m1 ON m1.room_id = cr.id AND m1.user_id = ?
       JOIN chat_room_members m2 ON m2.room_id = cr.id AND m2.user_id = ?
       WHERE cr.is_dm = 1 LIMIT 1`,
      [sellerId, buyerId],
    );

    let roomId: number;
    if (existing.length > 0) {
      roomId = existing[0].id;
    } else {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [r] = await conn.query<any>(
          'INSERT INTO chat_rooms (name, is_dm, created_by) VALUES (?, 1, ?)', ['dm', sellerId],
        );
        roomId = r.insertId;
        await conn.query('INSERT INTO chat_room_members (room_id, user_id) VALUES (?, ?)', [roomId, sellerId]);
        await conn.query('INSERT INTO chat_room_members (room_id, user_id) VALUES (?, ?)', [roomId, buyerId]);
        await conn.commit();
      } catch (e) {
        await conn.rollback(); throw e;
      } finally { conn.release(); }
    }

    res.json({ ok: true, roomId });
  } catch (err) {
    console.error('[consignments] POST /:id/match', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
