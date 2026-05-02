import { Router, Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import type { Server } from 'socket.io';
import { lives } from '../store/memory';

export function createFavoritesRouter(_io: Server, pool: Pool): Router {
  const router = Router();

  // POST /api/favorites — 관심 라이브 토글
  router.post('/', async (req: Request, res: Response) => {
    const { userId, liveId } = req.body as { userId?: unknown; liveId?: string };
    if (!liveId) {
      res.status(400).json({ error: 'userId and liveId are required' });
      return;
    }
    const userIdNum = Number(userId);
    if (!userId || Number.isNaN(userIdNum)) {
      res.status(400).json({ error: 'userId must be a valid integer' });
      return;
    }

    try {
      const [existing] = await pool.execute(
        'SELECT id FROM favorites WHERE user_id = ? AND live_id = ?',
        [userIdNum, liveId],
      );
      const rows = existing as unknown[];

      if (rows.length > 0) {
        await pool.execute(
          'DELETE FROM favorites WHERE user_id = ? AND live_id = ?',
          [userIdNum, liveId],
        );
        res.json({ favorited: false });
      } else {
        await pool.execute(
          'INSERT INTO favorites (user_id, live_id) VALUES (?, ?)',
          [userIdNum, liveId],
        );
        res.json({ favorited: true });
      }
    } catch (err) {
      console.error('[favorites] POST error:', err);
      res.status(500).json({ error: 'database error' });
    }
  });

  // GET /api/favorites?userId=... — 관심 라이브 목록
  router.get('/', async (req: Request, res: Response) => {
    const { userId } = req.query as { userId?: string };
    const userIdNum = Number(userId);
    if (!userId || Number.isNaN(userIdNum)) {
      res.status(400).json({ error: 'userId must be a valid integer' });
      return;
    }

    try {
      const [rows] = await pool.execute(
        'SELECT live_id FROM favorites WHERE user_id = ?',
        [userIdNum],
      );
      const liveIds = (rows as Array<{ live_id: string }>).map(r => r.live_id);

      const result = liveIds.map(liveId => {
        const memLive = lives.get(liveId);
        if (memLive) {
          return {
            liveId,
            title: memLive.title,
            sellerName: memLive.sellerId,
            status: memLive.status as 'live' | 'ended',
            thumbnailUrl: null as string | null,
          };
        }
        // 메모리에 없으면 종료된 라이브
        return {
          liveId,
          title: null as string | null,
          sellerName: null as string | null,
          status: 'ended' as const,
          thumbnailUrl: null as string | null,
        };
      });

      res.json(result);
    } catch (err) {
      console.error('[favorites] GET error:', err);
      res.status(500).json({ error: 'database error' });
    }
  });

  return router;
}
