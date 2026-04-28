import { Router, Request, Response } from 'express';
import pool from '../db/mysql';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { name, phone, role } = req.body as { name?: string; phone?: string; role?: string };

  if (!name || !phone) {
    res.status(400).json({ error: 'name and phone are required' });
    return;
  }
  const userRole = role ?? 'buyer';

  try {
    await pool.execute(
      `INSERT INTO users (name, phone, role) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)`,
      [name, phone, userRole],
    );
    const [rows] = await pool.execute(
      'SELECT id, name, phone, role, created_at FROM users WHERE phone = ?',
      [phone],
    );
    res.json((rows as unknown[])[0]);
  } catch (err) {
    console.error('[users] POST error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

export default router;
