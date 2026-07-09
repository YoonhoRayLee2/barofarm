import { Router, Request, Response } from 'express';
import pool from '../db/mysql';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

async function syncDefaultToUsers(
  userId: number,
  addr: { name: string; phone: string; zipcode: string; address: string; detail: string | null },
): Promise<void> {
  await pool.query(
    'UPDATE users SET delivery_name=?, delivery_phone=?, delivery_zipcode=?, delivery_address=?, delivery_detail=? WHERE id=?',
    [addr.name, addr.phone, addr.zipcode, addr.address, addr.detail ?? null, userId],
  );
}

// GET /api/delivery-addresses
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const [rows] = await pool.query<any[]>(
      'SELECT id, name, phone, zipcode, address, detail, is_default, created_at FROM delivery_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [userId],
    );
    res.json(rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      zipcode: r.zipcode,
      address: r.address,
      detail: r.detail,
      isDefault: Boolean(r.is_default),
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('[delivery-addresses] GET /', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/delivery-addresses
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, phone, zipcode, address, detail } = req.body;
  if (!name || !phone || !zipcode || !address) {
    return res.status(400).json({ error: 'required fields missing' });
  }

  try {
    const [existing] = await pool.query<any[]>(
      'SELECT COUNT(*) AS cnt FROM delivery_addresses WHERE user_id = ?',
      [userId],
    );
    const isDefault = existing[0].cnt === 0 ? 1 : 0;

    const [result] = await pool.query<any>(
      'INSERT INTO delivery_addresses (user_id, name, phone, zipcode, address, detail, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, name, phone, zipcode, address, detail ?? null, isDefault],
    );

    if (isDefault) {
      await syncDefaultToUsers(userId, { name, phone, zipcode, address, detail: detail ?? null });
    }

    res.status(201).json({ id: result.insertId, isDefault: Boolean(isDefault) });
  } catch (err) {
    console.error('[delivery-addresses] POST /', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/delivery-addresses/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const userId = req.user!.userId;
  const { name, phone, zipcode, address, detail } = req.body;
  if (!name || !phone || !zipcode || !address) {
    return res.status(400).json({ error: 'required fields missing' });
  }

  try {
    const [result] = await pool.query<any>(
      'UPDATE delivery_addresses SET name=?, phone=?, zipcode=?, address=?, detail=? WHERE id=? AND user_id=?',
      [name, phone, zipcode, address, detail ?? null, id, userId],
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not_found' });

    const [rows] = await pool.query<any[]>(
      'SELECT is_default FROM delivery_addresses WHERE id=?',
      [id],
    );
    if (rows.length && rows[0].is_default) {
      await syncDefaultToUsers(userId, { name, phone, zipcode, address, detail: detail ?? null });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[delivery-addresses] PATCH /:id', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/delivery-addresses/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const userId = req.user!.userId;

  try {
    const [rows] = await pool.query<any[]>(
      'SELECT is_default FROM delivery_addresses WHERE id=? AND user_id=?',
      [id, userId],
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const wasDefault = Boolean(rows[0].is_default);

    await pool.query('DELETE FROM delivery_addresses WHERE id=? AND user_id=?', [id, userId]);

    if (wasDefault) {
      const [remaining] = await pool.query<any[]>(
        'SELECT id, name, phone, zipcode, address, detail FROM delivery_addresses WHERE user_id=? ORDER BY created_at DESC LIMIT 1',
        [userId],
      );
      if (remaining.length) {
        await pool.query('UPDATE delivery_addresses SET is_default=1 WHERE id=?', [remaining[0].id]);
        await syncDefaultToUsers(userId, remaining[0]);
      } else {
        await pool.query(
          'UPDATE users SET delivery_name=NULL, delivery_phone=NULL, delivery_zipcode=NULL, delivery_address=NULL, delivery_detail=NULL WHERE id=?',
          [userId],
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[delivery-addresses] DELETE /:id', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/delivery-addresses/:id/set-default
router.patch('/:id/set-default', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const userId = req.user!.userId;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE delivery_addresses SET is_default=0 WHERE user_id=?', [userId]);
    const [result] = await conn.query<any>(
      'UPDATE delivery_addresses SET is_default=1 WHERE id=? AND user_id=?',
      [id, userId],
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not_found' });
    }
    const [rows] = await conn.query<any[]>(
      'SELECT name, phone, zipcode, address, detail FROM delivery_addresses WHERE id=?',
      [id],
    );
    await conn.commit();

    await syncDefaultToUsers(userId, rows[0]);
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('[delivery-addresses] PATCH /:id/set-default', err);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    conn.release();
  }
});

export default router;
