"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mysql_1 = __importDefault(require("../db/mysql"));
const tier_1 = require("../services/tier");
const notifications_1 = require("../services/notifications");
const UPLOADS_DIR = path_1.default.join(__dirname, '..', '..', 'public', 'uploads', 'products');
fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
        filename: (_req, _file, cb) => cb(null, `tmp_${Date.now()}.jpg`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/'))
            cb(null, true);
        else
            cb(new Error('이미지 파일만 허용됩니다.'));
    },
});
const uploadFields = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'images', maxCount: 9 },
]);
function unlockTmpFiles(files) {
    (files.image ?? []).forEach(f => fs_1.default.unlink(f.path, () => { }));
    (files.images ?? []).forEach(f => fs_1.default.unlink(f.path, () => { }));
}
function formatProduct(row, extraImages = [], viewerIsSubscriber = false) {
    return {
        id: row.id,
        sellerId: row.seller_id,
        sellerName: row.seller_nickname ?? null,
        name: row.name,
        description: row.description,
        price: row.price,
        category: row.category,
        imageUrl: row.image_url,
        features: row.features,
        attributes: row.attributes,
        status: row.status,
        createdAt: row.created_at,
        images: extraImages,
        isSeasonalBundle: (row.is_seasonal_bundle ?? 0) === 1,
        subscriberPrice: viewerIsSubscriber ? (row.subscriber_price ?? null) : null,
        seasonLabel: row.season_label ?? null,
    };
}
const router = (0, express_1.Router)();
// POST /api/products — 상품 등록
router.post('/', uploadFields, async (req, res) => {
    const { sellerId, name, description, price, category, features, attributes, isSeasonalBundle, subscriberPrice, seasonLabel } = req.body;
    const files = (req.files ?? {});
    if (!sellerId || !name || !price) {
        unlockTmpFiles(files);
        res.status(400).json({ error: 'sellerId, name, price는 필수입니다.' });
        return;
    }
    const isBundleVal = isSeasonalBundle ? 1 : 0;
    const subPriceVal = subscriberPrice != null ? Number(subscriberPrice) : null;
    const seasonLabelVal = seasonLabel ?? null;
    try {
        const [result] = await mysql_1.default.execute(`INSERT INTO products (seller_id, name, description, price, category, features, attributes, is_seasonal_bundle, subscriber_price, season_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [sellerId, name, description ?? null, Number(price), category ?? null, features ?? null, attributes ?? null, isBundleVal, subPriceVal, seasonLabelVal]);
        const productId = result.insertId;
        let imageUrl = null;
        // 대표이미지
        if (files.image?.[0]) {
            const f = files.image[0];
            const ext = path_1.default.extname(f.originalname).toLowerCase() || '.jpg';
            const dest = path_1.default.join(UPLOADS_DIR, `${productId}${ext}`);
            fs_1.default.renameSync(f.path, dest);
            imageUrl = `/uploads/products/${productId}${ext}`;
            await mysql_1.default.execute('UPDATE products SET image_url = ? WHERE id = ?', [imageUrl, productId]);
        }
        // 추가이미지
        if (files.images && files.images.length > 0) {
            for (let i = 0; i < files.images.length; i++) {
                const f = files.images[i];
                const ext = path_1.default.extname(f.originalname).toLowerCase() || '.jpg';
                const dest = path_1.default.join(UPLOADS_DIR, `${productId}_extra_${i}${ext}`);
                fs_1.default.renameSync(f.path, dest);
                const url = `/uploads/products/${productId}_extra_${i}${ext}`;
                await mysql_1.default.execute('INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)', [productId, url, i]);
            }
        }
        const [productRows] = await mysql_1.default.execute('SELECT * FROM products WHERE id = ?', [productId]);
        const [imgRows] = await mysql_1.default.execute('SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order', [productId]);
        // 제철 꾸러미 등록 시 단골 fan-out 알림
        if (isBundleVal === 1) {
            const [subRows] = await mysql_1.default.execute('SELECT subscriber_id FROM subscriptions WHERE seller_id = ? AND status = \'active\'', [sellerId]);
            const subscriberIds = subRows.map((r) => r.subscriber_id);
            if (subscriberIds.length > 0) {
                (0, notifications_1.createNotificationsBulk)(subscriberIds, {
                    type: 'seasonal_bundle',
                    title: '단골 농부의 제철 꾸러미가 열렸어요',
                    body: seasonLabelVal || name,
                    link: `/app/product-detail/${productId}`,
                }).catch((err) => console.error('[products] fan-out notification error:', err));
            }
        }
        res.status(201).json(formatProduct(productRows[0], imgRows.map(r => r.image_url)));
    }
    catch (err) {
        unlockTmpFiles(files);
        console.error('[products] POST error:', err);
        res.status(500).json({ error: '상품 등록에 실패했습니다.' });
    }
});
// GET /api/products — 상품 목록
router.get('/', async (req, res) => {
    const { sellerId, category } = req.query;
    const conditions = [];
    const params = [];
    if (sellerId) {
        conditions.push('p.seller_id = ?');
        params.push(Number(sellerId));
        if (category) {
            conditions.push('p.category = ?');
            params.push(String(category));
        }
    }
    else {
        conditions.push('p.status = ?');
        params.push('active');
        if (category) {
            conditions.push('p.category = ?');
            params.push(String(category));
        }
    }
    try {
        const [rows] = await mysql_1.default.execute(`SELECT p.*, u.nickname AS seller_nickname FROM products p LEFT JOIN users u ON u.id = p.seller_id WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC`, params);
        const extraMap = {};
        if (rows.length > 0) {
            const ids = rows.map(r => r.id);
            // IN (?) 리스트는 pool.execute가 배열을 지원하지 않으므로 pool.query 사용
            const [imgRows] = await mysql_1.default.query('SELECT product_id, image_url FROM product_images WHERE product_id IN (?) ORDER BY sort_order', [ids]);
            imgRows.forEach(r => {
                if (!extraMap[r.product_id])
                    extraMap[r.product_id] = [];
                extraMap[r.product_id].push(r.image_url);
            });
        }
        res.json(rows.map(r => formatProduct(r, extraMap[r.id] ?? [])));
    }
    catch (err) {
        console.error('[products] GET error:', err);
        res.status(500).json({ error: '목록 조회에 실패했습니다.' });
    }
});
// GET /api/products/:id — 상품 상세
router.get('/:id', async (req, res) => {
    const viewerId = Number(req.query.viewerId) || 0;
    try {
        const [productRows] = await mysql_1.default.execute('SELECT * FROM products WHERE id = ?', [Number(req.params.id)]);
        const product = productRows[0];
        if (!product) {
            res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
            return;
        }
        const [imgRows] = await mysql_1.default.execute('SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order', [product.id]);
        let viewerIsSubscriber = false;
        if (viewerId && product.is_seasonal_bundle) {
            const [subCheck] = await mysql_1.default.execute('SELECT 1 FROM subscriptions WHERE subscriber_id = ? AND seller_id = ? AND status = \'active\' LIMIT 1', [viewerId, product.seller_id]);
            viewerIsSubscriber = subCheck.length > 0;
        }
        res.json(formatProduct(product, imgRows.map(r => r.image_url), viewerIsSubscriber));
    }
    catch (err) {
        console.error('[products] GET/:id error:', err);
        res.status(500).json({ error: '상품 조회에 실패했습니다.' });
    }
});
// PATCH /api/products/:id — 상품 수정
router.patch('/:id', uploadFields, async (req, res) => {
    const productId = Number(req.params.id);
    const { name, description, price, category, features, attributes, status } = req.body;
    const files = (req.files ?? {});
    try {
        const [existingRows] = await mysql_1.default.execute('SELECT * FROM products WHERE id = ?', [productId]);
        const existing = existingRows[0];
        if (!existing) {
            unlockTmpFiles(files);
            res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
            return;
        }
        const setClauses = [];
        const params = [];
        if (name !== undefined) {
            setClauses.push('name = ?');
            params.push(name);
        }
        if (description !== undefined) {
            setClauses.push('description = ?');
            params.push(description);
        }
        if (price !== undefined) {
            setClauses.push('price = ?');
            params.push(Number(price));
        }
        if (category !== undefined) {
            setClauses.push('category = ?');
            params.push(category);
        }
        if (features !== undefined) {
            setClauses.push('features = ?');
            params.push(features);
        }
        if (attributes !== undefined) {
            setClauses.push('attributes = ?');
            params.push(attributes);
        }
        if (status !== undefined) {
            setClauses.push('status = ?');
            params.push(status);
        }
        // 대표이미지 교체
        if (files.image?.[0]) {
            if (existing.image_url) {
                const oldPath = path_1.default.join(__dirname, '..', '..', 'public', existing.image_url);
                fs_1.default.unlink(oldPath, () => { });
            }
            const f = files.image[0];
            const ext = path_1.default.extname(f.originalname).toLowerCase() || '.jpg';
            const dest = path_1.default.join(UPLOADS_DIR, `${productId}${ext}`);
            fs_1.default.renameSync(f.path, dest);
            const imageUrl = `/uploads/products/${productId}${ext}`;
            setClauses.push('image_url = ?');
            params.push(imageUrl);
        }
        if (setClauses.length > 0) {
            params.push(productId);
            await mysql_1.default.execute(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`, params);
        }
        // 추가이미지 교체 (새 파일이 있을 때만)
        if (files.images && files.images.length > 0) {
            // 기존 파일 삭제
            const [oldImgRows] = await mysql_1.default.execute('SELECT image_url FROM product_images WHERE product_id = ?', [productId]);
            oldImgRows.forEach(r => {
                const oldPath = path_1.default.join(__dirname, '..', '..', 'public', r.image_url);
                fs_1.default.unlink(oldPath, () => { });
            });
            await mysql_1.default.execute('DELETE FROM product_images WHERE product_id = ?', [productId]);
            // 새 파일 저장
            for (let i = 0; i < files.images.length; i++) {
                const f = files.images[i];
                const ext = path_1.default.extname(f.originalname).toLowerCase() || '.jpg';
                const dest = path_1.default.join(UPLOADS_DIR, `${productId}_extra_${i}${ext}`);
                fs_1.default.renameSync(f.path, dest);
                const url = `/uploads/products/${productId}_extra_${i}${ext}`;
                await mysql_1.default.execute('INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)', [productId, url, i]);
            }
        }
        const [updatedRows] = await mysql_1.default.execute('SELECT * FROM products WHERE id = ?', [productId]);
        const [imgRows] = await mysql_1.default.execute('SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order', [productId]);
        res.json(formatProduct(updatedRows[0], imgRows.map(r => r.image_url)));
    }
    catch (err) {
        unlockTmpFiles(files);
        console.error('[products] PATCH error:', err);
        res.status(500).json({ error: '상품 수정에 실패했습니다.' });
    }
});
// DELETE /api/products/:id — 소프트 삭제 (status='hidden')
router.delete('/:id', async (req, res) => {
    const productId = Number(req.params.id);
    try {
        const [result] = await mysql_1.default.execute("UPDATE products SET status = 'hidden' WHERE id = ?", [productId]);
        if (result.affectedRows === 0) {
            res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
            return;
        }
        res.status(204).send();
    }
    catch (err) {
        console.error('[products] DELETE error:', err);
        res.status(500).json({ error: '상품 삭제에 실패했습니다.' });
    }
});
// POST /api/products/:id/purchase — 즉시 구매
router.post('/:id/purchase', async (req, res) => {
    const productId = Number(req.params.id);
    const buyerId = Number(req.body.buyerId);
    if (!productId || !buyerId) {
        res.status(400).json({ error: 'invalid params' });
        return;
    }
    try {
        // 1. 상품 조회
        const [productRows] = await mysql_1.default.execute('SELECT id, seller_id, name, price, image_url, status FROM products WHERE id = ?', [productId]);
        const product = productRows[0];
        if (!product) {
            res.status(404).json({ error: 'product not found' });
            return;
        }
        if (product.status !== 'active') {
            res.status(409).json({ error: 'not available' });
            return;
        }
        if (product.seller_id === buyerId) {
            res.status(400).json({ error: 'cannot buy own product' });
            return;
        }
        // 2. 구매자 배송지 확인
        const [buyerRows] = await mysql_1.default.execute('SELECT delivery_address FROM users WHERE id = ?', [buyerId]);
        const buyer = buyerRows[0];
        if (!buyer || !buyer.delivery_address) {
            res.status(400).json({ error: 'delivery address required' });
            return;
        }
        // 3. 구매 처리 — auctions row 생성 + product sold 처리
        const [buyerTier, sellerTier] = await Promise.all([
            (0, tier_1.getBuyerTier)(buyerId),
            (0, tier_1.getSellerTier)(product.seller_id),
        ]);
        const { discountAmt, buyerDiscountRate } = (0, tier_1.calcBuyerDiscount)(product.price, buyerTier);
        const { feeAmt, sellerFeeRate } = (0, tier_1.calcSellerFee)(product.price, sellerTier);
        const orderId = crypto.randomUUID();
        await mysql_1.default.execute(`INSERT INTO auctions
         (id, seller_id, product_name, start_price, current_price, mode, image_url, status, top_bidder_id, ends_at,
          buyer_tier, buyer_discount_rate, buyer_discount_amt, seller_fee_rate, seller_fee_amt)
       VALUES (?, ?, ?, ?, ?, 'direct', ?, 'ended', ?, NOW(), ?, ?, ?, ?, ?)`, [
            orderId, product.seller_id, product.name, product.price, product.price,
            product.image_url ?? null, buyerId,
            buyerTier, buyerDiscountRate, discountAmt, sellerFeeRate, feeAmt,
        ]);
        await mysql_1.default.execute('UPDATE products SET status = ? WHERE id = ?', ['sold', productId]);
        res.json({ orderId });
    }
    catch (err) {
        console.error('[products] POST /:id/purchase error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다' });
    }
});
exports.default = router;
