import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import pool from '../db/mysql';
import { hashPassword, verifyPassword } from '../services/auth';
import { generateUniqueNickname } from '../services/nickname';
import { signToken, signRefreshToken, verifyToken } from '../services/jwt';
import { requireAuth } from '../middleware/auth';
import { normalizePhone } from '../utils/phone';
import { LOGIN_WHITELIST } from '../config/login-whitelist';

const JWT_SECRET = process.env.JWT_SECRET!;

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
router.post('/signup', authLimiter, async (req: Request, res: Response): Promise<void> => {
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
      const msg = (mysqlErr as any).sqlMessage || '';
      if (msg.includes('phone')) {
        res.status(409).json({ error: 'phone already exists' });
      } else {
        res.status(409).json({ error: 'username already exists' });
      }
      return;
    }
    console.error('[auth] POST /signup error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  if (!LOGIN_WHITELIST.has(username.trim())) {
    res.status(403).json({ error: '현재 로그인이 제한되어 있습니다.' });
    return;
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, username, password_hash, nickname, phone, interests, status FROM users WHERE username = ?',
      [username],
    ) as [unknown[], unknown];

    const user = (rows as Array<{
      id: number;
      username: string;
      password_hash: string;
      nickname: string;
      phone: string;
      interests: string | null;
      status: string;
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

    if (user.status === 'suspended') {
      res.status(403).json({ error: '정지된 계정입니다' });
      return;
    }

    const tokenPayload = { userId: user.id, username: user.username };
    const token = signToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    const interests = user.interests
      ? user.interests.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
    res.json({
      user: { id: user.id, username: user.username, nickname: user.nickname, phone: user.phone, interests },
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

// ─── POST /api/auth/verify-identity ──────────────────────────────────────────
router.post('/verify-identity', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const { username, phone } = req.body as { username?: string; phone?: string };

  if (!username || !phone) {
    res.status(400).json({ error: '아이디와 휴대폰 번호를 입력해 주세요' });
    return;
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    res.status(400).json({ error: 'phone must match 010-XXXX-XXXX or 010XXXXXXXX format' });
    return;
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id FROM users WHERE username = ? AND phone = ?',
      [username, normalizedPhone],
    ) as [unknown[], unknown];

    const user = (rows as Array<{ id: number }>)[0];
    if (!user) {
      res.status(404).json({ error: '일치하는 계정을 찾을 수 없습니다' });
      return;
    }

    const resetToken = jwt.sign(
      { userId: user.id, purpose: 'reset' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '10m' },
    );
    res.json({ resetToken });
  } catch (err) {
    console.error('[auth] POST /verify-identity error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post('/reset-password', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const { resetToken, newPassword } = req.body as { resetToken?: string; newPassword?: string };

  if (!resetToken) {
    res.status(400).json({ error: 'resetToken is required' });
    return;
  }
  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다' });
    return;
  }

  try {
    const decoded = jwt.verify(resetToken, JWT_SECRET) as jwt.JwtPayload;
    if (decoded.purpose !== 'reset') {
      res.status(400).json({ error: '유효하지 않은 토큰입니다' });
      return;
    }

    const passwordHash = await hashPassword(newPassword);
    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, decoded.userId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] POST /reset-password error:', err);
    res.status(400).json({ error: '토큰이 만료됐거나 유효하지 않습니다' });
  }
});

export default router;
