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

// GET /api/users/:id/public-profile?viewerId=
router.get('/:id/public-profile', async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const viewerId = Number(req.query.viewerId) || 0;

  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.nickname, u.name, u.avatar_url,
              (SELECT COUNT(*) FROM auctions WHERE seller_id = ? AND status = 'ended') AS sales_count,
              (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS follower_count,
              (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following_count,
              (SELECT COUNT(*) FROM follows WHERE follower_id = ? AND following_id = ?) AS is_following
       FROM users u WHERE u.id = ?`,
      [userId, userId, userId, viewerId, userId, userId],
    ) as [unknown[], unknown];

    const user = (rows as any[])[0];
    if (!user) return res.status(404).json({ error: 'user not found' });

    res.json({
      id: user.id,
      displayName: user.nickname || user.name,
      avatarUrl: user.avatar_url ?? null,
      salesCount: Number(user.sales_count),
      followerCount: Number(user.follower_count),
      followingCount: Number(user.following_count),
      isFollowing: Number(user.is_following) > 0,
    });
  } catch (err) {
    console.error('[users] GET /:id/public-profile', err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/users/:id/followers — 나를 팔로우하는 사람 목록
router.get('/:id/followers', async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.nickname, u.avatar_url
       FROM follows f
       JOIN users u ON u.id = f.follower_id
       WHERE f.following_id = ?
       ORDER BY f.created_at DESC`,
      [userId],
    ) as [unknown[], unknown];
    res.json((rows as Array<{ id: number; nickname: string | null; avatar_url: string | null }>)
      .map(r => ({ id: r.id, nickname: r.nickname ?? '사용자', avatarUrl: r.avatar_url ?? null })));
  } catch (err) {
    console.error('[users] GET /:id/followers error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/users/:id/following — 내가 팔로우하는 사람 목록
router.get('/:id/following', async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.nickname, u.avatar_url
       FROM follows f
       JOIN users u ON u.id = f.following_id
       WHERE f.follower_id = ?
       ORDER BY f.created_at DESC`,
      [userId],
    ) as [unknown[], unknown];
    res.json((rows as Array<{ id: number; nickname: string | null; avatar_url: string | null }>)
      .map(r => ({ id: r.id, nickname: r.nickname ?? '사용자', avatarUrl: r.avatar_url ?? null })));
  } catch (err) {
    console.error('[users] GET /:id/following error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// POST /api/users/:id/follow
router.post('/:id/follow', async (req: Request, res: Response) => {
  const followingId = Number(req.params.id);
  const { followerId } = req.body as { followerId?: number };
  if (!followerId) return res.status(400).json({ error: 'followerId required' });
  if (followerId === followingId) return res.status(400).json({ error: 'cannot follow yourself' });

  try {
    await pool.execute(
      'INSERT INTO follows (follower_id, following_id) VALUES (?, ?)',
      [followerId, followingId],
    );
    res.json({ ok: true });
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'already_following' });
    console.error('[users] POST /:id/follow', err);
    res.status(500).json({ error: 'database error' });
  }
});

// DELETE /api/users/:id/follow
router.delete('/:id/follow', async (req: Request, res: Response) => {
  const followingId = Number(req.params.id);
  const { followerId } = req.body as { followerId?: number };
  if (!followerId) return res.status(400).json({ error: 'followerId required' });

  try {
    await pool.execute(
      'DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
      [followerId, followingId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[users] DELETE /:id/follow', err);
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
              delivery_name, delivery_phone, delivery_address, delivery_detail, delivery_zipcode,
              interests
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
      interests: string | null;
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
      interests: user.interests ? user.interests.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    });
  } catch (err) {
    console.error('[users] GET /:id error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// PATCH /api/users/:id — 프로필 수정 (아바타·닉네임)
router.patch('/:id', uploadAvatar.single('avatar'), async (req: Request, res: Response) => {
  const userId = req.params.id;
  if (!userId) {
    res.status(400).json({ error: 'user id is required' });
    return;
  }

  const { nickname, interests } = req.body as {
    nickname?: string;
    interests?: string | string[];
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

    // 3. 관심카테고리
    if (interests !== undefined) {
      const val = Array.isArray(interests)
        ? interests.join(',')
        : String(interests ?? '');
      await pool.execute('UPDATE users SET interests = ? WHERE id = ?', [val || null, userId]);
    }

    // 최신 row 조회 후 GET과 동일한 형태로 응답
    const [rows] = await pool.execute(
      `SELECT id, name, nickname, avatar_url, role,
              nickname_changed_at,
              delivery_name, delivery_phone, delivery_address, delivery_detail, delivery_zipcode,
              interests
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
      interests: string | null;
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
      interests: user.interests ? user.interests.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
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
    // DB에서 라이브 목록 조회 (서버 재시작 후에도 기록 유지)
    const [dbLives] = await pool.execute(
      `SELECT id, seller_id, title, thumbnail_url, status, created_at, scheduled_at
       FROM lives WHERE seller_id = ?
       ORDER BY created_at DESC`,
      [sellerId],
    ) as [unknown[], unknown];

    const result = (dbLives as any[]).map((r) => {
      const liveId = String(r.id);
      // 메모리에 살아 있는 라이브면 실시간 데이터로 보완
      const memLive = lives.get(liveId);
      let productCount = 0;
      if (memLive) {
        for (const auc of auctions.values()) {
          if (auc.liveId === liveId) productCount++;
        }
      }
      return {
        liveId,
        sellerId: r.seller_id,
        title: r.title || '라이브 방송',
        thumbnailUrl: r.thumbnail_url ?? null,
        status: memLive ? memLive.status : r.status,
        startedAt: Number(r.created_at),
        endedAt: null,
        totalAuctions: productCount || null,
        totalRevenue: null,
        currentViewers: memLive?.status === 'live' ? memLive.viewerCount : null,
        productCount,
      };
    });

    // 진행 중 우선, 이후 최신순
    result.sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (a.status !== 'live' && b.status === 'live') return 1;
      return b.startedAt - a.startedAt;
    });

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

    // DB에서 라이브 카운트 집계 (서버 재시작 후에도 정확)
    const [liveRows] = await pool.execute(
      `SELECT
         COUNT(*) AS live_count,
         SUM(CASE WHEN status = 'ended' THEN 1 ELSE 0 END) AS ended_count,
         SUM(CASE WHEN status = 'live'  THEN 1 ELSE 0 END) AS ongoing_count
       FROM lives WHERE seller_id = ?`,
      [userId],
    ) as [unknown[], unknown];
    const dbLiveStats = (liveRows as Array<{live_count:number;ended_count:number;ongoing_count:number}>)[0]
      ?? { live_count: 0, ended_count: 0, ongoing_count: 0 };
    const liveCount    = Number(dbLiveStats.live_count);
    const endedCount   = Number(dbLiveStats.ended_count);
    const ongoingCount = Number(dbLiveStats.ongoing_count);

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
         a.id              AS auction_id,
         a.product_name,
         a.current_price   AS final_price,
         a.image_url,
         a.ends_at         AS order_at,
         a.mode,
         a.delivery_status,
         a.live_id,
         a.seller_id,
         s.nickname        AS seller_name,
         l.title           AS live_title,
         l.created_at      AS live_created_at
       FROM auctions a
       JOIN users s ON s.id = a.seller_id
       LEFT JOIN lives l ON l.id = a.live_id
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
      delivery_status: string | null;
      live_id: string | null;
      seller_id: number;
      seller_name: string | null;
      live_title: string | null;
      live_created_at: string | null;
    }>).map(r => ({
      auctionId:      r.auction_id,
      productName:    r.product_name,
      finalPrice:     Number(r.final_price),
      imageUrl:       r.image_url ?? null,
      orderAt:        r.order_at,
      mode:           r.mode ?? null,
      deliveryStatus: r.delivery_status ?? 'payment_complete',
      liveId:         r.live_id ?? null,
      sellerId:       r.seller_id,
      sellerName:     r.seller_name || '알 수 없음',
      liveTitle:      r.live_title ?? null,
      liveCreatedAt:  r.live_created_at ?? null,
    }));

    res.json(orders);
  } catch (err) {
    console.error('[users] GET /:id/orders error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/users/:id/sales — 셀러의 판매 내역
router.get('/:id/sales', async (req: Request, res: Response) => {
  const sellerId = req.params.id;
  if (!sellerId) {
    res.status(400).json({ error: 'user id is required' });
    return;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         a.id AS auction_id,
         a.product_name,
         a.current_price AS final_price,
         a.mode,
         a.delivery_status,
         a.image_url,
         a.ends_at AS sold_at,
         b.nickname AS buyer_name,
         a.top_bidder_id AS buyer_id
       FROM auctions a
       LEFT JOIN users b ON b.id = a.top_bidder_id
       WHERE a.seller_id = ?
         AND a.status = 'ended'
       ORDER BY a.ends_at DESC`,
      [sellerId],
    ) as [unknown[], unknown];

    const sales = (rows as Array<{
      auction_id: string;
      product_name: string;
      final_price: number;
      mode: string;
      delivery_status: string;
      image_url: string | null;
      sold_at: string;
      buyer_name: string | null;
      buyer_id: string | null;
    }>).map(r => ({
      auctionId:      r.auction_id,
      productName:    r.product_name,
      finalPrice:     Number(r.final_price),
      mode:           r.mode,
      deliveryStatus: r.delivery_status,
      imageUrl:       r.image_url ?? null,
      soldAt:         r.sold_at,
      buyerName:      r.buyer_name ?? null,
      buyerId:        r.buyer_id ?? null,
    }));

    res.json(sales);
  } catch (err) {
    console.error('[users] GET /:id/sales error:', err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/users/:id/unshipped — 미발송 주문 목록 (delivery_status = payment_complete)
router.get('/:id/unshipped', async (req: Request, res: Response) => {
  const sellerId = Number(req.params.id);
  if (!sellerId) {
    res.status(400).json({ error: 'seller id required' });
    return;
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         a.id          AS auction_id,
         a.product_name,
         a.current_price AS final_price,
         a.image_url,
         a.ends_at     AS paid_at,
         u.id          AS buyer_id,
         u.nickname    AS buyer_name,
         u.avatar_url  AS buyer_avatar
       FROM auctions a
       JOIN users u ON u.id = a.top_bidder_id
       WHERE a.seller_id = ?
         AND a.delivery_status = 'payment_complete'
         AND a.top_bidder_id IS NOT NULL
       ORDER BY a.ends_at ASC`,
      [sellerId],
    ) as [unknown[], unknown];

    const list = (rows as any[]).map((r) => ({
      auctionId:   r.auction_id,
      productName: r.product_name,
      finalPrice:  r.final_price != null ? Number(r.final_price) : null,
      imageUrl:    r.image_url ?? null,
      paidAt:      r.paid_at ?? null,
      buyerId:     r.buyer_id,
      buyerName:   r.buyer_name || '알 수 없음',
      buyerAvatar: r.buyer_avatar ?? null,
    }));

    res.json(list);
  } catch (err) {
    console.error('[users] GET /:id/unshipped', err);
    res.status(500).json({ error: 'database error' });
  }
});

export default router;
