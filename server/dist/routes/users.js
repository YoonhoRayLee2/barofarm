"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mysql_1 = __importDefault(require("../db/mysql"));
const memory_1 = require("../store/memory");
const tier_1 = require("../services/tier");
const auth_1 = require("../middleware/auth");
// 정산계좌 1원 인증 대기 상태 (key: userId)
const pendingBankVerify = new Map();
const AVATARS_DIR = path_1.default.join(__dirname, '..', '..', 'public', 'uploads', 'avatars');
fs_1.default.mkdirSync(AVATARS_DIR, { recursive: true });
const uploadAvatar = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
        filename: (req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase() || '.jpg';
            cb(null, `${req.params.id}${ext}`);
        },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        cb(null, /^image\//.test(file.mimetype));
    },
});
const router = (0, express_1.Router)();
router.post('/', async (req, res) => {
    const { name, phone, role } = req.body;
    if (!name || !phone) {
        res.status(400).json({ error: 'name and phone are required' });
        return;
    }
    const userRole = role ?? 'buyer';
    try {
        await mysql_1.default.execute(`INSERT INTO users (name, phone, role) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)`, [name, phone, userRole]);
        const [rows] = await mysql_1.default.execute('SELECT id, name, phone, role, created_at FROM users WHERE phone = ?', [phone]);
        res.json(rows[0]);
    }
    catch (err) {
        console.error('[users] POST error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/public-profile?viewerId=
router.get('/:id/public-profile', async (req, res) => {
    const userId = Number(req.params.id);
    const viewerId = Number(req.query.viewerId) || 0;
    try {
        const [rows] = await mysql_1.default.execute(`SELECT u.id, u.nickname, u.name, u.avatar_url, u.bank_verified_at,
              (SELECT COUNT(*) FROM auctions WHERE seller_id = ? AND status = 'ended') AS sales_count,
              (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS follower_count,
              (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following_count,
              (SELECT COUNT(*) FROM follows WHERE follower_id = ? AND following_id = ?) AS is_following,
              (SELECT COUNT(*) FROM subscriptions WHERE seller_id = ? AND status = 'active') AS subscriber_count,
              (SELECT COUNT(*) FROM subscriptions WHERE subscriber_id = ? AND seller_id = ? AND status = 'active') AS is_subscribed
       FROM users u WHERE u.id = ?`, [userId, userId, userId, viewerId, userId, userId, viewerId, userId, userId]);
        const user = rows[0];
        if (!user)
            return res.status(404).json({ error: 'user not found' });
        const salesCount = Number(user.sales_count);
        const followerCount = Number(user.follower_count);
        const subscriberCount = Number(user.subscriber_count);
        const bankVerified = !!user.bank_verified_at;
        // PROF-4 배지 6종 — 기존 집계 지표 기반 자동 산정 (DB 변경 없음).
        // hint: 획득 조건 설명, progress: 카운트형 배지의 현재 달성도(단일 진실 공급원=서버).
        const badges = [
            { key: 'first_sale', emoji: '🌱', label: '첫 수확', earned: salesCount >= 1,
                hint: '경매 판매를 1건 이상 완료하면 받아요.', progress: `${Math.min(salesCount, 1)}/1` },
            { key: 'veteran', emoji: '🏅', label: '베테랑 농부', earned: salesCount >= 20,
                hint: '누적 판매 20건을 달성하면 받아요.', progress: `${Math.min(salesCount, 20)}/20` },
            { key: 'harvest', emoji: '🌾', label: '풍년', earned: salesCount >= 50,
                hint: '누적 판매 50건을 달성하면 받아요.', progress: `${Math.min(salesCount, 50)}/50` },
            { key: 'regulars', emoji: '🤝', label: '단골 농부', earned: subscriberCount >= 5,
                hint: '단골(구독자) 5명을 모으면 받아요.', progress: `${Math.min(subscriberCount, 5)}/5` },
            { key: 'popular', emoji: '⭐', label: '인기 셀러', earned: followerCount >= 10,
                hint: '팔로워 10명을 모으면 받아요.', progress: `${Math.min(followerCount, 10)}/10` },
            { key: 'verified', emoji: '🛡️', label: '인증 거래', earned: bankVerified,
                hint: '계좌 인증을 완료하면 받아요.', progress: null },
        ];
        res.json({
            id: user.id,
            displayName: user.nickname || user.name,
            avatarUrl: user.avatar_url ?? null,
            salesCount,
            followerCount,
            followingCount: Number(user.following_count),
            isFollowing: Number(user.is_following) > 0,
            subscriberCount,
            isSubscribed: Number(user.is_subscribed) > 0,
            badges,
        });
    }
    catch (err) {
        console.error('[users] GET /:id/public-profile', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/followers — 나를 팔로우하는 사람 목록
router.get('/:id/followers', async (req, res) => {
    const userId = Number(req.params.id);
    try {
        const [rows] = await mysql_1.default.execute(`SELECT u.id, u.nickname, u.avatar_url
       FROM follows f
       JOIN users u ON u.id = f.follower_id
       WHERE f.following_id = ?
       ORDER BY f.created_at DESC`, [userId]);
        res.json(rows
            .map(r => ({ id: r.id, nickname: r.nickname ?? '사용자', avatarUrl: r.avatar_url ?? null })));
    }
    catch (err) {
        console.error('[users] GET /:id/followers error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/following — 내가 팔로우하는 사람 목록
router.get('/:id/following', async (req, res) => {
    const userId = Number(req.params.id);
    try {
        const [rows] = await mysql_1.default.execute(`SELECT u.id, u.nickname, u.avatar_url
       FROM follows f
       JOIN users u ON u.id = f.following_id
       WHERE f.follower_id = ?
       ORDER BY f.created_at DESC`, [userId]);
        res.json(rows
            .map(r => ({ id: r.id, nickname: r.nickname ?? '사용자', avatarUrl: r.avatar_url ?? null })));
    }
    catch (err) {
        console.error('[users] GET /:id/following error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// POST /api/users/:id/follow
router.post('/:id/follow', async (req, res) => {
    const followingId = Number(req.params.id);
    const { followerId } = req.body;
    if (!followerId)
        return res.status(400).json({ error: 'followerId required' });
    if (followerId === followingId)
        return res.status(400).json({ error: 'cannot follow yourself' });
    try {
        await mysql_1.default.execute('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)', [followerId, followingId]);
        res.json({ ok: true });
    }
    catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ error: 'already_following' });
        console.error('[users] POST /:id/follow', err);
        res.status(500).json({ error: 'database error' });
    }
});
// DELETE /api/users/:id/follow
router.delete('/:id/follow', async (req, res) => {
    const followingId = Number(req.params.id);
    const { followerId } = req.body;
    if (!followerId)
        return res.status(400).json({ error: 'followerId required' });
    try {
        await mysql_1.default.execute('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
        res.json({ ok: true });
    }
    catch (err) {
        console.error('[users] DELETE /:id/follow', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/is-following?userId=
router.get('/:id/is-following', async (req, res) => {
    const followingId = Number(req.params.id);
    const userId = Number(req.query.userId);
    if (!userId)
        return res.status(400).json({ error: 'userId required' });
    try {
        const [rows] = await mysql_1.default.execute('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ? LIMIT 1', [userId, followingId]);
        res.json({ isFollowing: rows.length > 0 });
    }
    catch (err) {
        console.error('[users] GET /:id/is-following error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/tier — 구매자 등급
router.get('/:id/tier', async (req, res) => {
    const userId = Number(req.params.id);
    if (!userId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute(`SELECT COALESCE(SUM(current_price), 0) AS total_spend
       FROM auctions
       WHERE top_bidder_id = ? AND status = 'ended'
         AND ends_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)`, [userId]);
        const totalSpend = Number(rows[0]?.total_spend ?? 0);
        const tier = await (0, tier_1.getBuyerTier)(userId);
        const cfg = tier_1.BUYER_TIER_CONFIG[tier];
        const currentIdx = tier_1.BUYER_TIER_ORDER.indexOf(tier);
        const nextTierKey = currentIdx < tier_1.BUYER_TIER_ORDER.length - 1
            ? tier_1.BUYER_TIER_ORDER[currentIdx + 1]
            : null;
        const nextThreshold = nextTierKey ? tier_1.BUYER_TIER_CONFIG[nextTierKey].minSpend : null;
        let progressPct = 100;
        if (nextTierKey && nextThreshold !== null) {
            const range = nextThreshold - cfg.minSpend;
            progressPct = range > 0 ? Math.min(100, Math.round((totalSpend - cfg.minSpend) / range * 100)) : 100;
        }
        res.json({
            tier,
            label: cfg.label,
            emoji: cfg.emoji,
            totalSpend,
            buyerDiscountRate: cfg.buyerDiscountRate,
            nextTier: nextTierKey,
            nextThreshold,
            progressPct,
        });
    }
    catch (err) {
        console.error('[users] GET /:id/tier error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/seller-tier — 판매자 등급
router.get('/:id/seller-tier', async (req, res) => {
    const userId = Number(req.params.id);
    if (!userId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute(`SELECT COALESCE(SUM(current_price), 0) AS total_sales
       FROM auctions
       WHERE seller_id = ? AND status = 'ended'
         AND ends_at >= DATE_SUB(NOW(), INTERVAL 3 MONTH)`, [userId]);
        const totalSales = Number(rows[0]?.total_sales ?? 0);
        const tier = await (0, tier_1.getSellerTier)(userId);
        const cfg = tier_1.SELLER_TIER_CONFIG[tier];
        const currentIdx = tier_1.SELLER_TIER_ORDER.indexOf(tier);
        const nextTierKey = currentIdx < tier_1.SELLER_TIER_ORDER.length - 1
            ? tier_1.SELLER_TIER_ORDER[currentIdx + 1]
            : null;
        const nextThreshold = nextTierKey ? tier_1.SELLER_TIER_CONFIG[nextTierKey].minSpend : null;
        let progressPct = 100;
        if (nextTierKey && nextThreshold !== null) {
            const range = nextThreshold - cfg.minSpend;
            progressPct = range > 0 ? Math.min(100, Math.round((totalSales - cfg.minSpend) / range * 100)) : 100;
        }
        res.json({
            tier,
            label: cfg.label,
            emoji: cfg.emoji,
            totalSales,
            sellerFeeRate: cfg.sellerFeeRate,
            nextTier: nextTierKey,
            nextThreshold,
            progressPct,
        });
    }
    catch (err) {
        console.error('[users] GET /:id/seller-tier error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id — 퍼블릭 프로필
router.get('/:id', async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute(`SELECT id, name, nickname, avatar_url, role,
              nickname_changed_at,
              delivery_name, delivery_phone, delivery_address, delivery_detail, delivery_zipcode,
              farm_zipcode, farm_address,
              interests,
              bank_name, bank_account, bank_holder, bank_verified_at, is_nh_member,
              delivery_option, hanaro_mart_name, hanaro_mart_addr,
              seller_shipping_fee, allow_hanaro_delivery
       FROM users WHERE id = ?`, [userId]);
        const user = rows[0];
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
                name: user.delivery_name,
                phone: user.delivery_phone,
                address: user.delivery_address,
                detail: user.delivery_detail,
                zipcode: user.delivery_zipcode,
            } : null,
            farmZipcode: user.farm_zipcode ?? null,
            farmAddress: user.farm_address ?? null,
            interests: user.interests ? user.interests.split(',').map((s) => s.trim()).filter(Boolean) : [],
            bankName: user.bank_name ?? null,
            bankAccount: user.bank_account
                ? '****' + user.bank_account.slice(-4)
                : null,
            bankHolder: user.bank_holder ?? null,
            bankVerifiedAt: user.bank_verified_at ?? null,
            isNhMember: !!user.is_nh_member,
            deliveryOption: user.delivery_option ?? 'standard',
            hanaroMartName: user.hanaro_mart_name ?? null,
            hanaroMartAddr: user.hanaro_mart_addr ?? null,
            sellerShippingFee: user.seller_shipping_fee ?? 3000,
            allowHanaroDelivery: user.allow_hanaro_delivery !== 0,
        });
    }
    catch (err) {
        console.error('[users] GET /:id error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// PATCH /api/users/:id — 프로필 수정 (아바타·닉네임)
router.patch('/:id', uploadAvatar.single('avatar'), async (req, res) => {
    const userId = String(req.params.id);
    if (!userId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        try {
            const token = authHeader.slice(7);
            const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
            if (decoded.userId !== parseInt(userId, 10)) {
                res.status(403).json({ error: '권한이 없습니다' });
                return;
            }
        }
        catch {
            res.status(401).json({ error: '인증이 필요합니다' });
            return;
        }
    }
    const { nickname, interests, farmZipcode, farmAddress, sellerShippingFee } = req.body;
    try {
        // 1. 아바타
        if (req.file) {
            const ext = path_1.default.extname(req.file.originalname).toLowerCase() || '.jpg';
            const avatarUrl = `/uploads/avatars/${userId}${ext}`;
            await mysql_1.default.execute('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, userId]);
        }
        // 2. 닉네임
        if (nickname !== undefined && nickname !== '') {
            const [rows] = await mysql_1.default.execute('SELECT nickname_changed_at FROM users WHERE id = ?', [userId]);
            const row = rows[0];
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
            await mysql_1.default.execute('UPDATE users SET nickname = ?, nickname_changed_at = NOW() WHERE id = ?', [nickname, userId]);
        }
        // 3. 관심카테고리
        if (interests !== undefined) {
            const val = Array.isArray(interests)
                ? interests.join(',')
                : String(interests ?? '');
            await mysql_1.default.execute('UPDATE users SET interests = ? WHERE id = ?', [val || null, userId]);
        }
        // 4. 농장 위치
        if (farmZipcode !== undefined || farmAddress !== undefined) {
            await mysql_1.default.execute('UPDATE users SET farm_zipcode = ?, farm_address = ? WHERE id = ?', [farmZipcode ?? null, farmAddress ?? null, userId]);
        }
        if (sellerShippingFee !== undefined) {
            await mysql_1.default.execute('UPDATE users SET seller_shipping_fee = ? WHERE id = ?', [Number(sellerShippingFee), userId]);
        }
        const { allowHanaroDelivery } = req.body;
        if (allowHanaroDelivery !== undefined) {
            await mysql_1.default.execute('UPDATE users SET allow_hanaro_delivery = ? WHERE id = ?', [allowHanaroDelivery ? 1 : 0, userId]);
        }
        // 5. 배송지
        const { deliveryName, deliveryPhone, deliveryZipcode, deliveryAddress, deliveryDetail } = req.body;
        if (deliveryAddress !== undefined) {
            await mysql_1.default.execute('UPDATE users SET delivery_name = ?, delivery_phone = ?, delivery_zipcode = ?, delivery_address = ?, delivery_detail = ? WHERE id = ?', [deliveryName ?? null, deliveryPhone ?? null, deliveryZipcode ?? null, deliveryAddress ?? null, deliveryDetail ?? null, userId]);
        }
        // 최신 row 조회 후 GET과 동일한 형태로 응답
        const [rows] = await mysql_1.default.execute(`SELECT id, name, nickname, avatar_url, role,
              nickname_changed_at,
              delivery_name, delivery_phone, delivery_address, delivery_detail, delivery_zipcode,
              farm_zipcode, farm_address,
              interests
       FROM users WHERE id = ?`, [userId]);
        const user = rows[0];
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
                name: user.delivery_name,
                phone: user.delivery_phone,
                address: user.delivery_address,
                detail: user.delivery_detail,
                zipcode: user.delivery_zipcode,
            } : null,
            farmZipcode: user.farm_zipcode ?? null,
            farmAddress: user.farm_address ?? null,
            interests: user.interests ? user.interests.split(',').map((s) => s.trim()).filter(Boolean) : [],
        });
    }
    catch (err) {
        console.error('[users] PATCH /:id error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/lives — 판매자의 라이브 기록
router.get('/:id/lives', async (req, res) => {
    const sellerId = req.params.id;
    if (!sellerId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        // DB에서 라이브 목록 조회 (서버 재시작 후에도 기록 유지)
        const [dbLives] = await mysql_1.default.execute(`SELECT id, seller_id, title, thumbnail_url, status, created_at, scheduled_at
       FROM lives WHERE seller_id = ?
       ORDER BY created_at DESC`, [sellerId]);
        const result = dbLives.map((r) => {
            const liveId = String(r.id);
            // 메모리에 살아 있는 라이브면 실시간 데이터로 보완
            const memLive = memory_1.lives.get(liveId);
            let productCount = 0;
            if (memLive) {
                for (const auc of memory_1.auctions.values()) {
                    if (auc.liveId === liveId)
                        productCount++;
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
            if (a.status === 'live' && b.status !== 'live')
                return -1;
            if (a.status !== 'live' && b.status === 'live')
                return 1;
            return b.startedAt - a.startedAt;
        });
        res.json(result);
    }
    catch (err) {
        console.error('[users] GET /:id/lives error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/dashboard-summary — 셀러 대시보드 요약 통계
router.get('/:id/dashboard-summary', async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        // DB에서 전체 경매 집계
        const [auctionRows] = await mysql_1.default.execute(`SELECT
         COUNT(*) AS total_auctions,
         SUM(CASE WHEN status = 'ended' AND top_bidder_id IS NOT NULL THEN 1 ELSE 0 END) AS total_sold,
         SUM(CASE WHEN status = 'ended' AND top_bidder_id IS NOT NULL THEN current_price ELSE 0 END) AS total_revenue
       FROM auctions
       WHERE seller_id = ?`, [userId]);
        const dbStats = auctionRows[0] ?? { total_auctions: 0, total_sold: 0, total_revenue: 0 };
        // DB에서 라이브 카운트 집계 (서버 재시작 후에도 정확)
        const [liveRows] = await mysql_1.default.execute(`SELECT
         COUNT(*) AS live_count,
         SUM(CASE WHEN status = 'ended' THEN 1 ELSE 0 END) AS ended_count,
         SUM(CASE WHEN status = 'live'  THEN 1 ELSE 0 END) AS ongoing_count
       FROM lives WHERE seller_id = ?`, [userId]);
        const dbLiveStats = liveRows[0]
            ?? { live_count: 0, ended_count: 0, ongoing_count: 0 };
        const liveCount = Number(dbLiveStats.live_count);
        const endedCount = Number(dbLiveStats.ended_count);
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
    }
    catch (err) {
        console.error('[users] GET /:id/dashboard-summary error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/bids — 입찰 기록
router.get('/:id/bids', async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute(`SELECT
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
       ORDER BY b.created_at DESC`, [userId]);
        const bids = rows;
        const result = bids.map(b => {
            const isWinner = b.top_bidder_id !== null && b.top_bidder_id === b.bidder_id;
            return {
                auctionId: b.auction_id,
                liveId: null,
                productName: b.product_name,
                bidPrice: b.bid_price,
                finalPrice: isWinner ? Number(b.final_price) : null,
                isWinner,
                bidAt: b.bid_at,
            };
        });
        res.json(result);
    }
    catch (err) {
        console.error('[users] GET /:id/bids error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/orders — 낙찰·구매 내역 (auctions 테이블 기준)
router.get('/:id/orders', async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute(`SELECT
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
         s.avatar_url      AS seller_avatar,
         a.shipping_fee,
         a.shipping_fee_status,
         l.title           AS live_title,
         l.created_at      AS live_created_at
       FROM auctions a
       JOIN users s ON s.id = a.seller_id
       LEFT JOIN lives l ON l.id = a.live_id
       WHERE a.top_bidder_id = ?
         AND a.status = 'ended'
       ORDER BY a.ends_at DESC`, [userId]);
        const orders = rows.map(r => ({
            auctionId: r.auction_id,
            productName: r.product_name,
            finalPrice: Number(r.final_price),
            imageUrl: r.image_url ?? null,
            orderAt: r.order_at,
            mode: r.mode ?? null,
            deliveryStatus: r.delivery_status ?? 'payment_complete',
            liveId: r.live_id ?? null,
            sellerId: r.seller_id,
            sellerName: r.seller_name || '알 수 없음',
            sellerAvatar: r.seller_avatar ?? null,
            shippingFee: Number(r.shipping_fee ?? 0),
            shippingFeeStatus: r.shipping_fee_status ?? 'none',
            liveTitle: r.live_title ?? null,
            liveCreatedAt: r.live_created_at ?? null,
        }));
        res.json(orders);
    }
    catch (err) {
        console.error('[users] GET /:id/orders error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/sales — 셀러의 판매 내역
router.get('/:id/sales', async (req, res) => {
    const sellerId = req.params.id;
    if (!sellerId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute(`SELECT
         a.id              AS auction_id,
         a.product_name,
         a.current_price   AS final_price,
         a.mode,
         a.delivery_status,
         a.image_url,
         a.ends_at         AS sold_at,
         a.live_id,
         l.title           AS live_title,
         l.created_at      AS live_started_at,
         b.nickname        AS buyer_name,
         a.top_bidder_id   AS buyer_id
       FROM auctions a
       LEFT JOIN users b ON b.id = a.top_bidder_id
       LEFT JOIN lives l ON l.id = a.live_id
       WHERE a.seller_id = ?
         AND a.status = 'ended'
         AND a.current_price > 0
       ORDER BY a.ends_at DESC`, [sellerId]);
        const sales = rows.map(r => ({
            itemType: 'auction',
            auctionId: r.auction_id,
            dealId: null,
            productName: r.product_name,
            finalPrice: Number(r.final_price),
            mode: r.mode,
            deliveryStatus: r.delivery_status,
            imageUrl: r.image_url ?? null,
            soldAt: r.sold_at,
            liveId: r.live_id ?? null,
            liveTitle: r.live_title ?? null,
            liveStartedAt: r.live_started_at ?? null,
            buyerName: r.buyer_name ?? null,
            buyerId: r.buyer_id ?? null,
        }));
        // 공동판매 내역 추가
        const [gdRows] = await mysql_1.default.execute(`SELECT
         gd.id                                             AS deal_id,
         gd.title                                          AS product_name,
         gd.price_per_unit * COALESCE(gdp.quantity, 1)    AS final_price,
         CASE gd.status
           WHEN 'confirmed'  THEN 'payment_complete'
           WHEN 'shipped'    THEN 'shipped'
           WHEN 'completed'  THEN 'purchase_confirmed'
           ELSE gd.status
         END                                               AS delivery_status,
         gd.image_url,
         gdp.joined_at                                     AS sold_at,
         gd.created_at                                     AS live_started_at,
         gd.title                                          AS live_title,
         b.nickname                                        AS buyer_name,
         gdp.buyer_id                                      AS buyer_id
       FROM group_deals gd
       JOIN group_deal_participants gdp ON gdp.deal_id = gd.id
       LEFT JOIN users b ON b.id = gdp.buyer_id
       WHERE gd.seller_id = ?
         AND gd.status NOT IN ('recruiting', 'cancelled')
       ORDER BY gdp.joined_at DESC`, [sellerId]);
        const gdSales = gdRows.map(r => ({
            itemType: 'group_deal',
            auctionId: null,
            dealId: String(r.deal_id),
            productName: r.product_name,
            finalPrice: Number(r.final_price),
            mode: 'group_deal',
            deliveryStatus: r.delivery_status,
            imageUrl: r.image_url ?? null,
            soldAt: r.sold_at,
            liveId: `gd_${r.deal_id}`,
            liveTitle: r.live_title,
            liveStartedAt: r.live_started_at,
            buyerName: r.buyer_name ?? null,
            buyerId: r.buyer_id ? String(r.buyer_id) : null,
        }));
        res.json([...sales, ...gdSales]);
    }
    catch (err) {
        console.error('[users] GET /:id/sales error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/unshipped — 미발송 주문 목록 (payment_complete)
router.get('/:id/unshipped', async (req, res) => {
    const sellerId = Number(req.params.id);
    if (!sellerId) {
        res.status(400).json({ error: 'seller id required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute(`SELECT
         a.id          AS auction_id,
         a.product_name,
         a.current_price AS final_price,
         a.image_url,
         a.ends_at     AS paid_at,
         a.delivery_status,
         a.shipping_fee,
         a.shipping_fee_status,
         u.id          AS buyer_id,
         u.nickname    AS buyer_name,
         u.avatar_url  AS buyer_avatar
       FROM auctions a
       JOIN users u ON u.id = a.top_bidder_id
       WHERE a.seller_id = ?
         AND a.delivery_status = 'payment_complete'
         AND a.top_bidder_id IS NOT NULL
       ORDER BY a.ends_at ASC`, [sellerId]);
        const list = rows.map((r) => ({
            auctionId: r.auction_id,
            productName: r.product_name,
            finalPrice: r.final_price != null ? Number(r.final_price) : null,
            imageUrl: r.image_url ?? null,
            paidAt: r.paid_at ?? null,
            deliveryStatus: r.delivery_status,
            shippingFee: r.shipping_fee != null ? Number(r.shipping_fee) : 0,
            shippingFeeStatus: r.shipping_fee_status ?? 'none',
            buyerId: r.buyer_id,
            buyerName: r.buyer_name || '알 수 없음',
            buyerAvatar: r.buyer_avatar ?? null,
        }));
        res.json(list);
    }
    catch (err) {
        console.error('[users] GET /:id/unshipped', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/carbon-stats — 탄소발자국 절감 통계
router.get('/:id/carbon-stats', async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        const { calcCarbon } = await Promise.resolve().then(() => __importStar(require('../services/carbon')));
        const [rows] = await mysql_1.default.execute(`SELECT a.id,
              s.farm_zipcode AS seller_farm_zipcode,
              b.delivery_zipcode AS buyer_zipcode
       FROM auctions a
       JOIN users s ON s.id = a.seller_id
       JOIN users b ON b.id = a.top_bidder_id
       WHERE a.top_bidder_id = ?
         AND a.status = 'ended'`, [userId]);
        const orders = rows;
        let totalSavedKm = 0;
        let totalSavedCo2g = 0;
        let savedPctSum = 0;
        let validCount = 0;
        for (const order of orders) {
            if (!order.seller_farm_zipcode || !order.buyer_zipcode)
                continue;
            const result = calcCarbon(order.seller_farm_zipcode, order.buyer_zipcode);
            if (!result)
                continue;
            totalSavedKm += result.savedKm;
            totalSavedCo2g += result.savedCo2g;
            savedPctSum += result.savedPct;
            validCount++;
        }
        res.json({
            totalOrders: orders.length,
            totalSavedKm,
            totalSavedCo2g,
            avgSavedPct: validCount > 0 ? Math.round(savedPctSum / validCount) : 0,
        });
    }
    catch (err) {
        console.error('[users] GET /:id/carbon-stats error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/carbon-summary — 누적 탄소 절감량 집계
router.get('/:id/carbon-summary', async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
        res.status(400).json({ error: 'user id is required' });
        return;
    }
    try {
        const { calcCarbon, TREE_CO2G } = await Promise.resolve().then(() => __importStar(require('../utils/carbon')));
        const [rows] = await mysql_1.default.execute(`SELECT a.id,
              s.farm_zipcode     AS seller_farm_zipcode,
              b.delivery_zipcode AS buyer_zipcode
       FROM auctions a
       JOIN users s ON s.id = a.seller_id
       JOIN users b ON b.id = a.top_bidder_id
       WHERE a.top_bidder_id = ?
         AND a.status = 'ended'`, [userId]);
        const orders = rows;
        let totalSavedKm = 0;
        let totalSavedCo2g = 0;
        let savedCount = 0;
        for (const order of orders) {
            if (!order.seller_farm_zipcode || !order.buyer_zipcode)
                continue;
            const result = calcCarbon(order.seller_farm_zipcode, order.buyer_zipcode);
            if (!result)
                continue;
            totalSavedKm += result.savedKm;
            totalSavedCo2g += result.savedCo2g;
            savedCount++;
        }
        res.json({
            orderCount: orders.length,
            savedCount,
            totalSavedKm,
            totalSavedCo2g,
            treeEquiv: Math.round(totalSavedCo2g / TREE_CO2G),
        });
    }
    catch (err) {
        console.error('[users] GET /:id/carbon-summary error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// POST /api/users/:id/bank/request — 1원 인증 요청
router.post('/:id/bank/request', auth_1.requireAuth, async (req, res) => {
    const userId = Number(req.params.id);
    if (req.user.userId !== userId) {
        res.status(403).json({ error: 'forbidden' });
        return;
    }
    const { bankName, accountNumber, holderName } = req.body;
    if (!bankName || !accountNumber || !holderName) {
        res.status(400).json({ error: 'bankName, accountNumber, holderName required' });
        return;
    }
    const code = String(Math.floor(1000 + Math.random() * 9000));
    pendingBankVerify.set(userId, {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000,
        bankName,
        accountNumber,
        holderName,
    });
    res.json({ message: '1원을 송금했습니다. 입금자명의 숫자 4자리를 입력하세요.' });
});
// POST /api/users/:id/bank/confirm — 코드 확인 → 인증 완료
router.post('/:id/bank/confirm', auth_1.requireAuth, async (req, res) => {
    const userId = Number(req.params.id);
    if (req.user.userId !== userId) {
        res.status(403).json({ error: 'forbidden' });
        return;
    }
    const { code } = req.body;
    const pending = pendingBankVerify.get(userId);
    if (!pending) {
        res.status(400).json({ error: '인증 요청이 없습니다. 다시 시도해주세요.' });
        return;
    }
    if (Date.now() > pending.expiresAt) {
        pendingBankVerify.delete(userId);
        res.status(400).json({ error: '인증 시간이 만료됐습니다. 다시 시도해주세요.' });
        return;
    }
    if (pending.code !== code) {
        res.status(400).json({ error: '인증번호가 맞지 않습니다.' });
        return;
    }
    const isNhMember = pending.bankName.includes('농협') ? 1 : 0;
    await mysql_1.default.execute(`UPDATE users SET bank_name = ?, bank_account = ?, bank_holder = ?,
                      bank_verified_at = NOW(), is_nh_member = ?
     WHERE id = ?`, [pending.bankName, pending.accountNumber, pending.holderName, isNhMember, userId]);
    pendingBankVerify.delete(userId);
    res.json({ success: true, isNhMember: !!isNhMember });
});
// PATCH /api/users/:id/delivery-option
router.patch('/:id/delivery-option', async (req, res) => {
    const userId = req.params.id;
    const { deliveryOption, hanaroMartName, hanaroMartAddr } = req.body;
    if (!deliveryOption || !['standard', 'hanaro'].includes(deliveryOption)) {
        res.status(400).json({ error: 'deliveryOption must be standard or hanaro' });
        return;
    }
    if (deliveryOption === 'hanaro' && (!hanaroMartName || !hanaroMartAddr)) {
        res.status(400).json({ error: 'hanaroMartName and hanaroMartAddr required for hanaro option' });
        return;
    }
    try {
        await mysql_1.default.execute('UPDATE users SET delivery_option = ?, hanaro_mart_name = ?, hanaro_mart_addr = ? WHERE id = ?', [deliveryOption, hanaroMartName ?? null, hanaroMartAddr ?? null, userId]);
        res.json({ ok: true });
    }
    catch (err) {
        console.error('[users] PATCH /:id/delivery-option error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// POST /api/users/:id/subscribe — 단골 등록 (:id = seller)
router.post('/:id/subscribe', auth_1.requireAuth, async (req, res) => {
    const sellerId = Number(req.params.id);
    const subscriberId = req.user.userId;
    if (subscriberId === sellerId)
        return res.status(400).json({ error: 'cannot subscribe yourself' });
    try {
        await mysql_1.default.execute(`INSERT INTO subscriptions (subscriber_id, seller_id, status)
       VALUES (?, ?, 'active')
       ON DUPLICATE KEY UPDATE status = 'active'`, [subscriberId, sellerId]);
        // 자동 팔로우 (중복이면 무시)
        await mysql_1.default.execute('INSERT IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)', [subscriberId, sellerId]);
        res.json({ ok: true });
    }
    catch (err) {
        console.error('[users] POST /:id/subscribe', err);
        res.status(500).json({ error: 'database error' });
    }
});
// DELETE /api/users/:id/subscribe — 단골 해제 (소프트)
router.delete('/:id/subscribe', auth_1.requireAuth, async (req, res) => {
    const sellerId = Number(req.params.id);
    const subscriberId = req.user.userId;
    try {
        await mysql_1.default.execute(`UPDATE subscriptions SET status = 'cancelled'
       WHERE subscriber_id = ? AND seller_id = ?`, [subscriberId, sellerId]);
        res.json({ ok: true });
    }
    catch (err) {
        console.error('[users] DELETE /:id/subscribe', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/subscriptions — 내가 단골인 농부 목록 (:id = subscriber)
router.get('/:id/subscriptions', auth_1.requireAuth, async (req, res) => {
    const subscriberId = Number(req.params.id);
    if (!subscriberId)
        return res.status(400).json({ error: 'user id required' });
    if (subscriberId !== req.user.userId)
        return res.status(403).json({ error: 'forbidden' });
    try {
        const [rows] = await mysql_1.default.execute(`SELECT u.id AS seller_id, u.nickname, u.avatar_url
       FROM subscriptions s
       JOIN users u ON u.id = s.seller_id
       WHERE s.subscriber_id = ? AND s.status = 'active'
       ORDER BY s.created_at DESC`, [subscriberId]);
        res.json(rows.map((r) => ({
            sellerId: r.seller_id,
            nickname: r.nickname ?? '사용자',
            avatarUrl: r.avatar_url ?? null,
        })));
    }
    catch (err) {
        console.error('[users] GET /:id/subscriptions', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/users/:id/subscriber-count — 단골 수 (:id = seller)
router.get('/:id/subscriber-count', async (req, res) => {
    const sellerId = Number(req.params.id);
    if (!sellerId)
        return res.status(400).json({ error: 'user id required' });
    try {
        const [rows] = await mysql_1.default.execute('SELECT COUNT(*) AS cnt FROM subscriptions WHERE seller_id = ? AND status = \'active\'', [sellerId]);
        res.json({ count: Number(rows[0]?.cnt ?? 0) });
    }
    catch (err) {
        console.error('[users] GET /:id/subscriber-count', err);
        res.status(500).json({ error: 'database error' });
    }
});
exports.default = router;
