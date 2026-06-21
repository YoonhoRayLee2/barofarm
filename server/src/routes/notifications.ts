import { Router, Request, Response } from 'express';
import pool from '../db/mysql';

const router = Router();

// GET /api/notifications?userId=
router.get('/', async (req: Request, res: Response) => {
  const userId = Number(req.query.userId as string);
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    const [rows]: any = await pool.execute(
      `SELECT id, type, title, body, link, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId],
    );
    const [countRows]: any = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId],
    );
    const unreadCount = Number(countRows[0]?.cnt ?? 0);

    res.json({
      items: rows.map((r: any) => ({
        id:        r.id,
        type:      r.type,
        title:     r.title,
        body:      r.body,
        link:      r.link,
        isRead:    r.is_read === 1,
        createdAt: r.created_at,
      })),
      unreadCount,
    });
  } catch (err) {
    console.error('[notifications] GET error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response) => {
  const notifId = Number(req.params.id);
  const { userId } = req.body as { userId?: number };
  if (!userId) return res.status(400).json({ error: 'userId required' });

  try {
    const [rows]: any = await pool.execute(
      'SELECT user_id FROM notifications WHERE id = ?',
      [notifId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    if (rows[0].user_id !== userId) return res.status(403).json({ error: 'forbidden' });

    await pool.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [notifId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[notifications] PATCH /:id/read error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

export default router;
