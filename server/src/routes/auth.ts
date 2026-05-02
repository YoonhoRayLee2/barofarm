import { Router, Request, Response } from 'express';
import pool from '../db/mysql';
import { hashPassword, verifyPassword } from '../services/auth';
import { generateUniqueNickname } from '../services/nickname';
import { signToken, signRefreshToken, verifyToken } from '../services/jwt';
import { requireAuth } from '../middleware/auth';
import { normalizePhone } from '../utils/phone';

const router = Router();

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  const { username, password, phone } = req.body as {
    username?: string;
    password?: string;
    phone?: string;
  };

  // 입력 검증
  if (!username || !password || !phone) {
    res.status(400).json({ error: 'username, password, phone are required' });
    return;
  }
  if (!/^[a-zA-Z0-9_]{4,30}$/.test(username)) {
    res.status(400).json({ error: 'username must be 4–30 alphanumeric/underscore characters' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' });
    return;
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    res.status(400).json({ error: 'phone must match 010-XXXX-XXXX or 010XXXXXXXX format' });
    return;
  }

  try {
    const nickname = await generateUniqueNickname();
    const passwordHash = await hashPassword(password);

    const [result] = await pool.execute(
      `INSERT INTO users (username, password_hash, nickname, phone, name, role)
       VALUES (?, ?, ?, ?, ?, 'buyer')`,
      [username, passwordHash, nickname, normalizedPhone, username],
    ) as [{ insertId: number }, unknown];

    const userId = result.insertId;
    const tokenPayload = { userId, username };
    const token = signToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    res.status(201).json({
      user: { id: userId, username, nickname, phone: normalizedPhone },
      token,
      refreshToken,
    });
  } catch (err: unknown) {
    const mysqlErr = err as { code?: string };
    if (mysqlErr.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'username or phone already exists' });
      return;
    }
    console.error('[auth] POST /signup error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, username, password_hash, nickname, phone FROM users WHERE username = ?',
      [username],
    ) as [unknown[], unknown];

    const user = (rows as Array<{
      id: number;
      username: string;
      password_hash: string;
      nickname: string;
      phone: string;
    }>)[0];

    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const tokenPayload = { userId: user.id, username: user.username };
    const token = signToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    res.json({
      user: { id: user.id, username: user.username, nickname: user.nickname, phone: user.phone },
      token,
      refreshToken,
    });
  } catch (err) {
    console.error('[auth] POST /login error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', (req: Request, res: Response): void => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: 'refreshToken is required' });
    return;
  }
  const payload = verifyToken(refreshToken);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
    return;
  }
  const newToken = signToken({ userId: payload.userId, username: payload.username });
  res.json({ token: newToken });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, nickname, phone, role, created_at FROM users WHERE id = ?',
      [req.user!.userId],
    ) as [unknown[], unknown];

    const user = (rows as unknown[])[0];
    if (!user) {
      res.status(404).json({ error: 'user not found' });
      return;
    }
    res.json(user);
  } catch (err) {
    console.error('[auth] GET /me error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

export default router;
