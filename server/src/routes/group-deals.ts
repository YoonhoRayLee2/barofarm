import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import pool from '../db/mysql';
import { getUsersByInterest, notifyUsers } from '../services/notifications';

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'group-deals');
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

function toCamel(row: Record<string, any>) {
  return {
    id:                  row.id,
    sellerId:            row.seller_id,
    sellerName:          row.seller_name ?? null,
    sellerAvatar:        row.seller_avatar ?? null,
    title:               row.title,
    description:         row.description ?? null,
    imageUrl:            row.image_url ?? null,
    category:            row.category,
    pricePerUnit:        Number(row.price_per_unit),
    unitLabel:           row.unit_label,
    minParticipants:     Number(row.min_participants),
    maxParticipants:     row.max_participants != null ? Number(row.max_participants) : null,
    currentParticipants: Number(row.current_participants),
    status:              row.status,
    closesAt:            row.closes_at,
    createdAt:           row.created_at,
  };
}

export function createGroupDealsRouter(io: Server) {
  const r = Router();

  // POST / — 공동구매 개설
  r.post('/', upload.single('image'), async (req: Request, res: Response) => {
    const {
      sellerId, title, description, category,
      pricePerUnit, unitLabel, minParticipants, maxParticipants, closesAt,
    } = req.body as {
      sellerId?: string; title?: string; description?: string; category?: string;
      pricePerUnit?: string; unitLabel?: string; minParticipants?: string;
      maxParticipants?: string; closesAt?: string;
    };

    if (!sellerId || !title || !category || !pricePerUnit || !unitLabel || !minParticipants || !closesAt) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: 'sellerId, title, category, pricePerUnit, unitLabel, minParticipants, closesAt 은 필수입니다.' });
      return;
    }

    let imageUrl: string | null = null;
    if (req.file) {
      const tmpPath = req.file.path;
      // 임시로 저장된 파일을 임시 이름 그대로 유지 — insertId 획득 후 rename
      imageUrl = tmpPath; // placeholder, updated below
    }

    try {
      const [result]: any = await pool.execute(
        `INSERT INTO group_deals
           (seller_id, title, description, image_url, category, price_per_unit, unit_label,
            min_participants, max_participants, closes_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(sellerId), title, description ?? null, null,
          category, Number(pricePerUnit), unitLabel,
          Number(minParticipants), maxParticipants ? Number(maxParticipants) : null,
          new Date(closesAt as string).toISOString().slice(0, 19).replace('T', ' '),
        ],
      );

      const dealId: number = result.insertId;

      // 이미지 파일이 있으면 dealId 기반 최종 경로로 rename
      if (req.file) {
        const finalName = `${dealId}.jpg`;
        const finalPath = path.join(UPLOADS_DIR, finalName);
        try {
          fs.renameSync(req.file.path, finalPath);
          imageUrl = `/uploads/group-deals/${finalName}`;
          await pool.execute('UPDATE group_deals SET image_url = ? WHERE id = ?', [imageUrl, dealId]);
        } catch (err) {
          console.error('[group-deals] image rename failed:', (err as Error).message);
          imageUrl = null;
        }
      }

      const [[row]]: any = await pool.execute(
        `SELECT g.*, u.nickname AS seller_name, u.avatar_url AS seller_avatar
         FROM group_deals g LEFT JOIN users u ON u.id = g.seller_id
         WHERE g.id = ?`,
        [dealId],
      );

      res.status(201).json(toCamel(row));

      // 관심 카테고리 사용자 fan-out 알림 (fire-and-forget — 응답 차단 금지)
      (async () => {
        const targets = (await getUsersByInterest(category)).filter(uid => uid !== Number(sellerId));
        if (targets.length > 0) {
          await notifyUsers(io, targets, {
            type:  'group_deal_new',
            title: '관심 카테고리 새 공동구매',
            body:  title,
            link:  `/app/group-deals/${dealId}`,
          });
        }
      })().catch((err: unknown) => console.error('[group-deals] interest fan-out error:', err));
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      console.error('[group-deals] POST / error:', err);
      res.status(500).json({ error: '서버 오류가 발생했습니다' });
    }
  });

  // GET / — 목록
  r.get('/', async (req: Request, res: Response) => {
    const {
      status = 'recruiting',
      category,
      limit = '20',
      offset = '0',
      mine,
    } = req.query as {
      status?: string; category?: string;
      limit?: string; offset?: string; mine?: string;
    };

    try {
      const conditions: string[] = [];
      const params: any[] = [];

      if (mine) {
        if (mine.startsWith('seller:')) {
          const sellerId = mine.slice('seller:'.length);
          conditions.push('g.seller_id = ?');
          params.push(Number(sellerId));
        } else if (mine.startsWith('buyer:')) {
          const buyerId = mine.slice('buyer:'.length);
          conditions.push('g.id IN (SELECT deal_id FROM group_deal_participants WHERE buyer_id = ?)');
          params.push(Number(buyerId));
        }
      } else {
        conditions.push('g.status = ?');
        params.push(status);
      }

      if (category) {
        conditions.push('g.category = ?');
        params.push(category);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const lim = Math.max(1, parseInt(limit as string, 10) || 20);
      const off = Math.max(0, parseInt(offset as string, 10) || 0);
      const [rows]: any = await pool.query(
        `SELECT g.*, u.nickname AS seller_name, u.avatar_url AS seller_avatar
         FROM group_deals g LEFT JOIN users u ON u.id = g.seller_id
         ${where}
         ORDER BY g.created_at DESC
         LIMIT ${lim} OFFSET ${off}`,
        params,
      );

      res.json((rows as any[]).map(toCamel));
    } catch (err) {
      console.error('[group-deals] GET / error:', err);
      res.status(500).json({ error: 'database error' });
    }
  });

  // GET /:id — 상세
  r.get('/:id', async (req: Request, res: Response) => {
    const dealId = Number(req.params.id);
    const { viewerId } = req.query as { viewerId?: string };

    try {
      const [[row]]: any = await pool.execute(
        `SELECT g.*, u.nickname AS seller_name, u.avatar_url AS seller_avatar
         FROM group_deals g LEFT JOIN users u ON u.id = g.seller_id
         WHERE g.id = ?`,
        [dealId],
      );

      if (!row) {
        res.status(404).json({ error: 'deal not found' });
        return;
      }

      let isParticipant = false;
      if (viewerId) {
        const [[p]]: any = await pool.execute(
          'SELECT id FROM group_deal_participants WHERE deal_id = ? AND buyer_id = ?',
          [dealId, Number(viewerId)],
        );
        isParticipant = !!p;
      }

      res.json({ ...toCamel(row), isParticipant });
    } catch (err) {
      console.error('[group-deals] GET /:id error:', err);
      res.status(500).json({ error: 'database error' });
    }
  });

  // POST /:id/join — 참여
  r.post('/:id/join', async (req: Request, res: Response) => {
    const dealId = Number(req.params.id);
    const { buyerId, quantity = 1 } = req.body as { buyerId?: number; quantity?: number };

    if (!buyerId) {
      res.status(400).json({ error: 'buyerId 는 필수입니다.' });
      return;
    }

    const conn = await pool.getConnection();
    try {
      const [[deal]]: any = await conn.execute(
        'SELECT id, status, closes_at, current_participants, max_participants FROM group_deals WHERE id = ?',
        [dealId],
      );

      if (!deal) {
        res.status(404).json({ error: 'deal not found' });
        return;
      }
      if (deal.status !== 'recruiting') {
        res.status(409).json({ error: '모집 중인 공동구매만 참여할 수 있습니다.' });
        return;
      }
      if (new Date(deal.closes_at) < new Date()) {
        res.status(409).json({ error: '마감된 공동구매입니다.' });
        return;
      }

      await conn.beginTransaction();

      // 정원 검사 + 증가를 원자적으로 수행 — max_participants가 없으면(무제한) 조건 없이 증가.
      const capSql = deal.max_participants != null
        ? 'UPDATE group_deals SET current_participants = current_participants + 1 WHERE id = ? AND current_participants < max_participants'
        : 'UPDATE group_deals SET current_participants = current_participants + 1 WHERE id = ?';
      const [capResult]: any = await conn.execute(capSql, [dealId]);

      if (capResult.affectedRows === 0) {
        await conn.rollback();
        res.status(409).json({ error: '최대 참여 인원에 도달했습니다.' });
        return;
      }

      const [insertResult]: any = await conn.execute(
        'INSERT IGNORE INTO group_deal_participants (deal_id, buyer_id, quantity) VALUES (?, ?, ?)',
        [dealId, Number(buyerId), Number(quantity)],
      );

      // 이미 참여 중이었던 경우(INSERT IGNORE로 무시됨) — 위에서 증가시킨 current_participants를 되돌린다.
      if (insertResult.affectedRows === 0) {
        await conn.execute(
          'UPDATE group_deals SET current_participants = GREATEST(current_participants - 1, 0) WHERE id = ?',
          [dealId],
        );
      }

      const [[updated]]: any = await conn.execute(
        'SELECT current_participants, status FROM group_deals WHERE id = ?',
        [dealId],
      );

      await conn.commit();

      io.emit('group-deal:updated', {
        dealId,
        currentParticipants: updated.current_participants,
        status: updated.status,
      });

      res.json({
        joined: insertResult.affectedRows > 0,
        currentParticipants: updated.current_participants,
      });
    } catch (err) {
      try { await conn.rollback(); } catch { /* 이미 rollback/commit된 경우 무시 */ }
      console.error('[group-deals] POST /:id/join error:', err);
      res.status(500).json({ error: 'database error' });
    } finally {
      conn.release();
    }
  });

  // DELETE /:id/join — 참여 취소
  r.delete('/:id/join', async (req: Request, res: Response) => {
    const dealId = Number(req.params.id);
    const { buyerId } = req.body as { buyerId?: number };

    if (!buyerId) {
      res.status(400).json({ error: 'buyerId 는 필수입니다.' });
      return;
    }

    try {
      const [deleteResult]: any = await pool.execute(
        'DELETE FROM group_deal_participants WHERE deal_id = ? AND buyer_id = ?',
        [dealId, Number(buyerId)],
      );

      if (deleteResult.affectedRows > 0) {
        await pool.execute(
          'UPDATE group_deals SET current_participants = GREATEST(current_participants - 1, 0) WHERE id = ?',
          [dealId],
        );
      }

      const [[updated]]: any = await pool.execute(
        'SELECT current_participants, status FROM group_deals WHERE id = ?',
        [dealId],
      );

      if (!updated) {
        res.status(404).json({ error: 'deal not found' });
        return;
      }

      io.emit('group-deal:updated', {
        dealId,
        currentParticipants: updated.current_participants,
        status: updated.status,
      });

      res.json({
        cancelled: deleteResult.affectedRows > 0,
        currentParticipants: updated.current_participants,
      });
    } catch (err) {
      console.error('[group-deals] DELETE /:id/join error:', err);
      res.status(500).json({ error: 'database error' });
    }
  });

  // PATCH /:id/confirm — 확정
  r.patch('/:id/confirm', async (req: Request, res: Response) => {
    const dealId = Number(req.params.id);
    const { sellerId } = req.body as { sellerId?: number };

    if (!sellerId) {
      res.status(400).json({ error: 'sellerId 는 필수입니다.' });
      return;
    }

    try {
      const [[deal]]: any = await pool.execute(
        'SELECT id, seller_id, status, current_participants, min_participants FROM group_deals WHERE id = ?',
        [dealId],
      );

      if (!deal) { res.status(404).json({ error: 'deal not found' }); return; }
      if (String(deal.seller_id) !== String(sellerId)) { res.status(403).json({ error: '판매자 권한이 없습니다.' }); return; }
      if (deal.status !== 'recruiting') { res.status(409).json({ error: '모집 중인 상태에서만 확정할 수 있습니다.' }); return; }
      if (deal.current_participants < deal.min_participants) {
        res.status(409).json({ error: `최소 참여 인원(${deal.min_participants}명)에 미달합니다.` });
        return;
      }

      await pool.execute("UPDATE group_deals SET status = 'confirmed' WHERE id = ?", [dealId]);

      io.emit('group-deal:updated', { dealId, currentParticipants: deal.current_participants, status: 'confirmed' });
      res.json({ success: true, status: 'confirmed' });
    } catch (err) {
      console.error('[group-deals] PATCH /:id/confirm error:', err);
      res.status(500).json({ error: 'database error' });
    }
  });

  // PATCH /:id/cancel — 취소
  r.patch('/:id/cancel', async (req: Request, res: Response) => {
    const dealId = Number(req.params.id);
    const { sellerId } = req.body as { sellerId?: number };

    if (!sellerId) {
      res.status(400).json({ error: 'sellerId 는 필수입니다.' });
      return;
    }

    try {
      const [[deal]]: any = await pool.execute(
        'SELECT id, seller_id, status, current_participants FROM group_deals WHERE id = ?',
        [dealId],
      );

      if (!deal) { res.status(404).json({ error: 'deal not found' }); return; }
      if (String(deal.seller_id) !== String(sellerId)) { res.status(403).json({ error: '판매자 권한이 없습니다.' }); return; }
      if (!['recruiting', 'confirmed'].includes(deal.status)) {
        res.status(409).json({ error: '모집 중 또는 확정 상태에서만 취소할 수 있습니다.' });
        return;
      }

      await pool.execute("UPDATE group_deals SET status = 'cancelled' WHERE id = ?", [dealId]);

      io.emit('group-deal:updated', { dealId, currentParticipants: deal.current_participants, status: 'cancelled' });
      res.json({ success: true, status: 'cancelled' });
    } catch (err) {
      console.error('[group-deals] PATCH /:id/cancel error:', err);
      res.status(500).json({ error: 'database error' });
    }
  });

  // PATCH /:id/ship — 발송
  r.patch('/:id/ship', async (req: Request, res: Response) => {
    const dealId = Number(req.params.id);
    const { sellerId } = req.body as { sellerId?: number };

    if (!sellerId) {
      res.status(400).json({ error: 'sellerId 는 필수입니다.' });
      return;
    }

    try {
      const [[deal]]: any = await pool.execute(
        'SELECT id, seller_id, status, current_participants FROM group_deals WHERE id = ?',
        [dealId],
      );

      if (!deal) { res.status(404).json({ error: 'deal not found' }); return; }
      if (String(deal.seller_id) !== String(sellerId)) { res.status(403).json({ error: '판매자 권한이 없습니다.' }); return; }
      if (deal.status !== 'confirmed') { res.status(409).json({ error: '확정 상태에서만 발송할 수 있습니다.' }); return; }

      await pool.execute("UPDATE group_deals SET status = 'shipped' WHERE id = ?", [dealId]);

      io.emit('group-deal:updated', { dealId, currentParticipants: deal.current_participants, status: 'shipped' });
      res.json({ success: true, status: 'shipped' });
    } catch (err) {
      console.error('[group-deals] PATCH /:id/ship error:', err);
      res.status(500).json({ error: 'database error' });
    }
  });

  return r;
}
