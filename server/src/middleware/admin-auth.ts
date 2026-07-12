// 어드민 전용 인증 미들웨어 — POST /admin/api/login 이 발급하는 관리자 JWT(isAdmin 클레임)를 검증하고,
// JWT 클레임은 발급 시점 값일 뿐이므로 DB의 실제 is_admin을 재확인한다.
// admin.ts(기존)와 Phase 7 신규 admin-payments/admin-auth-management/admin-rest-auctions 라우터가 공용으로 사용한다.
// (admin.ts에 있던 동일 로직을 그대로 옮긴 것 — 동작 변경 없음)

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/mysql';

declare global {
  namespace Express {
    interface Request {
      adminUserId?: number;
    }
  }
}

function getSecret(): string {
  return process.env.JWT_SECRET!;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), getSecret()) as { userId: number; isAdmin?: boolean };
    if (!payload.isAdmin) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    // JWT의 isAdmin 클레임은 발급 시점 값일 뿐이므로, DB의 실제 is_admin을 재확인한다.
    const [rows] = await pool.query<any[]>(
      'SELECT is_admin FROM users WHERE id = ? LIMIT 1',
      [payload.userId],
    );
    const user = rows[0];
    if (!user || !user.is_admin) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    req.adminUserId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}
