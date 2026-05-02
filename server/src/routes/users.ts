import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import pool from '../db/mysql';
import { lives, auctions } from '../store/memory';

const AVATARS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'avatars');
fs.mkdirSync(AVATARS_DIR, { recursive: true });

const uploadAvatar = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${(req as Request).params.id}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  },
});

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

// GET /api/users/:id — 퍼블릭 프로필
router.get('/:id', async (req: Request, res: Response) => {
  const userId = req.params.id;
  if (!userId) {
    res.status(400).json({ error: 'user id is required' });
    return;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT id, name, nickname, avatar_url, role,
              nickname_changed_at,
              delivery_name, delivery_phone, delivery_address, delivery_detail, delivery_zipcode
       FROM users WHERE id = ?`,
      [userId],
    ) as [unknown[], unknown];

    const user = (rows as Array<{
      id: number;
      name: string;
      nickname: string | null;
      avatar_url: string | null;
      role: string;
      nickname_changed_at: string | null;
      delivery_name: string | null;
      delivery_phone: string | null;
      delivery_address: string | null;
      delivery_detail: string | null;
      delivery_zipcode: string | null;
    }>)[0];

    if (!user) {
      res.status(404).json({ error: 'user not found' });
      return;
    }

    res.json({
      id: user.id,
      displayName: user.nickname || user.name,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      role: user.role,
      nicknameChangedAt: user.nickname_changed_at ?? null,
      hasDeliveryAddress: !!user.delivery_address,
      delivery: user.delivery_address ? {
        name:    user.delivery_name,
        phone:   user.delivery_phone,
        address: user.delivery_address,
        detail:  user.delivery_detail,
        zipcode: user.delivery_zipcode,
      } : null,
    });
  } catch (err) {
    console.error('[users] GET /:id error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// PATCH /api/users/:id — 프로필 수정 (아바타·닉네임·배송지)
router.patch('/:id', uploadAvatar.single('avatar'), async (req: Request, res: Response) => {
  const userId = req.params.id;
  if (!userId) {
    res.status(400).json({ error: 'user id is required' });
    return;
  }

  const { nickname, deliveryName, deliveryPhone, deliveryAddress, deliveryDetail, deliveryZipcode } = req.body as {
    nickname?: string;
    deliveryName?: string;
    deliveryPhone?: string;
    deliveryAddress?: string;
    deliveryDetail?: string;
    deliveryZipcode?: string;
  };

  try {
    // 1. 아바타
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
      const avatarUrl = `/uploads/avatars/${userId}${ext}`;
      await pool.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, userId]);
    }

    // 2. 닉네임
    if (nickname !== undefined && nickname !== '') {
      const [rows] = await pool.execute(
        'SELECT nickname_changed_at FROM users WHERE id = ?',
        [userId],
      ) as [unknown[], unknown];
      const row = (rows as Array<{ nickname_changed_at: string | null }>)[0];
      if (!row) {
        res.status(404).json({ error: 'user not found' });
        return;
      }
      if (row.nickname_changed_at) {
        const lastChanged = new Date(row.nickname_changed_at).getTime();
        const diffDays = (Date.now() - lastChanged) / (1000 * 60 * 60 * 24);
        if (diffDays < 90) {
          const nextChangeAt = new Date(lastChanged + 90 * 24 * 60 * 60 * 1000).toISOString();
          res.status(400).json({ error: '닉네임은 90일마다 변경할 수 있습니다.', nextChangeAt });
          return;
        }
      }
      await pool.execute(
        'UPDATE users SET nickname = ?, nickname_changed_at = NOW() WHERE id = ?',
        [nickname, userId],
      );
    }

    // 3. 배송지
    if (deliveryAddress !== undefined) {
      if (!deliveryAddress) {
        res.status(400).json({ error: 'deliveryAddress is required' });
        return;
      }
      await pool.execute(
        `UPDATE users SET
           delivery_name    = ?,
           delivery_phone   = ?,
           delivery_address = ?,
           delivery_detail  = ?,
           delivery_zipcode = ?
         WHERE id = ?`,
        [deliveryName ?? null, deliveryPhone ?? null, deliveryAddress, deliveryDetail ?? null, deliveryZipcode ?? null, userId],
      );
    }

    // 최신 row 조회 후 GET과 동일한 형태로 응답
    const [rows] = await pool.execute(
      `SELECT id, name, nickname, avatar_url, role,
              nickname_changed_at,
              delivery_name, delivery_phone, delivery_address, delivery_detail, delivery_zipcode
       FROM users WHERE id = ?`,
      [userId],
    ) as [unknown[], unknown];

    const user = (rows as Array<{
      id: number;
      name: string;
      nickname: string | null;
      avatar_url: string | null;
      role: string;
      nickname_changed_at: string | null;
      delivery_name: string | null;
      delivery_phone: string | null;
      delivery_address: string | null;
      delivery_detail: string | null;
      delivery_zipcode: string | null;
    }>)[0];

    if (!user) {
      res.status(404).json({ error: 'user not found' });
      return;
    }

    res.json({
      id: user.id,
      displayName: user.nickname || user.name,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      role: user.role,
      nicknameChangedAt: user.nickname_changed_at ?? null,
      hasDeliveryAddress: !!user.delivery_address,
      delivery: user.delivery_address ? {
        name:    user.delivery_name,
        phone:   user.delivery_phone,
        address: user.delivery_address,
        detail:  user.delivery_detail,
        zipcode: user.delivery_zipcode,
      } : null,
    });
  } catch (err) {
    console.error('[users] PATCH /:id error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/users/:id/lives — 판매자의 라이브 기록
router.get('/:id/lives', async (req: Request, res: Response) => {
  const sellerId = req.params.id;
  if (!sellerId) {
    res.status(400).json({ error: 'user id is required' });
    return;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         seller_id,
         COUNT(*) AS total_auctions,
         SUM(CASE WHEN status = 'ended' AND top_bidder_id IS NOT NULL THEN current_price ELSE 0 END) AS total_revenue,
         MIN(created_at) AS started_at,
         MAX(ends_at) AS ended_at
       FROM auctions
       WHERE seller_id = ?
       GROUP BY seller_id`,
      [sellerId],
    ) as [unknown[], unknown];

    const dbSummary = (rows as Array<{
      seller_id: number;
      total_auctions: number;
      total_revenue: number;
      started_at: string;
      ended_at: string;
    }>)[0] ?? null;

    // 메모리에서 현재 진행 중인/종료된 라이브(sellerId 일치)
    const memoryLives: Array<{
      liveId: string;
      title: string;
      status: 'live' | 'ended' | 'upcoming';
      startedAt: number;
      endedAt: number | null;
      totalAuctions: number;
      totalRevenue: number;
      currentViewers: number | null;
      productCount: number;
    }> = [];

    for (const [liveId, live] of lives.entries()) {
      if (live.sellerId === sellerId) {
        // 해당 라이브의 경매 건수를 메모리 auctions Map에서 집계
        let productCount = 0;
        for (const auc of auctions.values()) {
          if (auc.liveId === liveId) productCount++;
        }

        memoryLives.push({
          liveId,
          title: live.title,
          status: live.status,
          startedAt: live.createdAt,
          endedAt: null,
          totalAuctions: productCount,
          totalRevenue: 0,
          currentViewers: live.status === 'live' ? live.viewerCount : null,
          productCount,
        });
      }
    }

    // 라이브 중 우선, 이후 startedAt DESC 정렬
    memoryLives.sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (a.status !== 'live' && b.status === 'live') return 1;
      return b.startedAt - a.startedAt;
    });

    // DB 요약이 있으면 종료된 라이브 집계 항목으로 추가 (auctions 테이블에 live_id 없으므로 seller 단위 집계)
    const result = [...memoryLives];
    if (dbSummary) {
      result.push({
        liveId: `db-summary-${sellerId}`,
        title: '종료된 라이브 기록 (집계)',
        status: 'ended',
        startedAt: new Date(dbSummary.started_at).getTime(),
        endedAt: dbSummary.ended_at ? new Date(dbSummary.ended_at).getTime() : null,
        totalAuctions: Number(dbSummary.total_auctions),
        totalRevenue: Number(dbSummary.total_revenue),
        currentViewers: null,
        productCount: Number(dbSummary.total_auctions),
      });
    }

    res.json(result);
  } catch (err) {
    console.error('[users] GET /:id/lives error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/users/:id/dashboard-summary — 셀러 대시보드 요약 통계
router.get('/:id/dashboard-summary', async (req: Request, res: Response) => {
  const userId = req.params.id;
  if (!userId) {
    res.status(400).json({ error: 'user id is required' });
    return;
  }

  try {
    // DB에서 전체 경매 집계
    const [auctionRows] = await pool.execute(
      `SELECT
         COUNT(*) AS total_auctions,
         SUM(CASE WHEN status = 'ended' AND top_bidder_id IS NOT NULL THEN 1 ELSE 0 END) AS total_sold,
         SUM(CASE WHEN status = 'ended' AND top_bidder_id IS NOT NULL THEN current_price ELSE 0 END) AS total_revenue
       FROM auctions
       WHERE seller_id = ?`,
      [userId],
    ) as [unknown[], unknown];

    const dbStats = (auctionRows as Array<{
      total_auctions: number;
      total_sold: number;
      total_revenue: number;
    }>)[0] ?? { total_auctions: 0, total_sold: 0, total_revenue: 0 };

    // 메모리에서 라이브 카운트 집계
    let liveCount = 0;
    let ongoingCount = 0;
    let endedCount = 0;

    for (const live of lives.values()) {
      if (live.sellerId === userId) {
        liveCount++;
        if (live.status === 'live') ongoingCount++;
        else endedCount++;
      }
    }

    res.json({
      userId: Number(userId),
      stats: {
        liveCount,
        endedCount,
        ongoingCount,
        totalRevenue: Number(dbStats.total_revenue),
        totalAuctions: Number(dbStats.total_auctions),
        totalSoldAuctions: Number(dbStats.total_sold),
      },
    });
  } catch (err) {
    console.error('[users] GET /:id/dashboard-summary error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/users/:id/bids — 입찰 기록
router.get('/:id/bids', async (req: Request, res: Response) => {
  const userId = req.params.id;
  if (!userId) {
    res.status(400).json({ error: 'user id is required' });
    return;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         b.id              AS bid_id,
         b.auction_id      AS auction_id,
         b.price           AS bid_price,
         a.current_price   AS final_price,
         b.created_at      AS bid_at,
         a.product_name,
         a.top_bidder_id,
         b.bidder_id
       FROM bids b
       JOIN auctions a ON a.id = b.auction_id
       WHERE b.bidder_id = ?
       ORDER BY b.created_at DESC`,
      [userId],
    ) as [unknown[], unknown];

    const bids = rows as Array<{
      bid_id: number;
      auction_id: number;
      bid_price: number;
      final_price: number;
      bid_at: string;
      product_name: string;
      top_bidder_id: number | null;
      bidder_id: number;
    }>;

    const result = bids.map(b => {
      const isWinner = b.top_bidder_id !== null && b.top_bidder_id === b.bidder_id;
      return {
        auctionId:   b.auction_id,
        liveId:      null as string | null,
        productName: b.product_name,
        bidPrice:    b.bid_price,
        finalPrice:  isWinner ? Number(b.final_price) : null,
        isWinner,
        bidAt:       b.bid_at,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[users] GET /:id/bids error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/users/:id/orders — 낙찰·구매 내역 (auctions 테이블 기준)
router.get('/:id/orders', async (req: Request, res: Response) => {
  const userId = req.params.id;
  if (!userId) {
    res.status(400).json({ error: 'user id is required' });
    return;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         a.id           AS auction_id,
         a.product_name,
         a.current_price AS final_price,
         a.image_url,
         a.ends_at      AS order_at,
         a.mode
       FROM auctions a
       WHERE a.top_bidder_id = ?
         AND a.status = 'ended'
       ORDER BY a.ends_at DESC`,
      [userId],
    ) as [unknown[], unknown];

    const orders = (rows as Array<{
      auction_id: number;
      product_name: string;
      final_price: number;
      image_url: string | null;
      order_at: string;
      mode: string | null;
    }>).map(r => ({
      auctionId:   r.auction_id,
      productName: r.product_name,
      finalPrice:  Number(r.final_price),
      imageUrl:    r.image_url ?? null,
      orderAt:     r.order_at,
      mode:        r.mode ?? null,
    }));

    res.json(orders);
  } catch (err) {
    console.error('[users] GET /:id/orders error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

export default router;
