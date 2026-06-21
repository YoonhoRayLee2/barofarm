import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import pool from '../db/mysql';
import { getBuyerTier, getSellerTier, calcBuyerDiscount, calcSellerFee } from '../services/tier';
import { createNotificationsBulk } from '../services/notifications';

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'products');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, _file, cb) => cb(null, `tmp_${Date.now()}.jpg`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('이미지 파일만 허용됩니다.'));
  },
});

const uploadFields = upload.fields([
  { name: 'image',  maxCount: 1 },
  { name: 'images', maxCount: 9 },
]);

type UploadedFiles = { image?: Express.Multer.File[]; images?: Express.Multer.File[] };

function unlockTmpFiles(files: UploadedFiles) {
  (files.image  ?? []).forEach(f => fs.unlink(f.path, () => {}));
  (files.images ?? []).forEach(f => fs.unlink(f.path, () => {}));
}

interface ProductRow {
  id: number;
  seller_id: number;
  name: string;
  description: string | null;
  price: number;
  category: string;
  image_url: string | null;
  stock: number;
  features: string | null;
  attributes: string | null;
  status: string;
  created_at: string;
  seller_nickname?: string | null;
  is_seasonal_bundle?: number;
  subscriber_price?: number | null;
  season_label?: string | null;
}

interface ProductImageRow {
  id: number;
  product_id: number;
  image_url: string;
  sort_order: number;
}

interface InsertResult {
  insertId: number;
  affectedRows: number;
}

function formatProduct(row: ProductRow, extraImages: string[] = [], viewerIsSubscriber = false) {
  return {
    id:                row.id,
    sellerId:          row.seller_id,
    sellerName:        row.seller_nickname ?? null,
    name:              row.name,
    description:       row.description,
    price:             row.price,
    category:          row.category,
    imageUrl:          row.image_url,
    features:          row.features,
    attributes:        row.attributes,
    status:            row.status,
    createdAt:         row.created_at,
    images:            extraImages,
    isSeasonalBundle:  (row.is_seasonal_bundle ?? 0) === 1,
    subscriberPrice:   viewerIsSubscriber ? (row.subscriber_price ?? null) : null,
    seasonLabel:       row.season_label ?? null,
  };
}

const router = Router();

// POST /api/products — 상품 등록
router.post('/', uploadFields, async (req: Request, res: Response) => {
  const { sellerId, name, description, price, category, features, attributes, isSeasonalBundle, subscriberPrice, seasonLabel } = req.body;
  const files = (req.files ?? {}) as UploadedFiles;

  if (!sellerId || !name || !price) {
    unlockTmpFiles(files);
    res.status(400).json({ error: 'sellerId, name, price는 필수입니다.' });
    return;
  }

  const isBundleVal = isSeasonalBundle ? 1 : 0;
  const subPriceVal = subscriberPrice != null ? Number(subscriberPrice) : null;
  const seasonLabelVal = seasonLabel ?? null;

  try {
    const [result] = await pool.execute(
      `INSERT INTO products (seller_id, name, description, price, category, features, attributes, is_seasonal_bundle, subscriber_price, season_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sellerId, name, description ?? null, Number(price), category ?? null, features ?? null, attributes ?? null, isBundleVal, subPriceVal, seasonLabelVal],
    ) as [InsertResult, unknown];

    const productId: number = result.insertId;
    let imageUrl: string | null = null;

    // 대표이미지
    if (files.image?.[0]) {
      const f = files.image[0];
      const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
      const dest = path.join(UPLOADS_DIR, `${productId}${ext}`);
      fs.renameSync(f.path, dest);
      imageUrl = `/uploads/products/${productId}${ext}`;
      await pool.execute('UPDATE products SET image_url = ? WHERE id = ?', [imageUrl, productId]);
    }

    // 추가이미지
    if (files.images && files.images.length > 0) {
      for (let i = 0; i < files.images.length; i++) {
        const f = files.images[i];
        const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
        const dest = path.join(UPLOADS_DIR, `${productId}_extra_${i}${ext}`);
        fs.renameSync(f.path, dest);
        const url = `/uploads/products/${productId}_extra_${i}${ext}`;
        await pool.execute(
          'INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)',
          [productId, url, i],
        );
      }
    }

    const [productRows] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [productId],
    ) as [ProductRow[], unknown];
    const [imgRows] = await pool.execute(
      'SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order',
      [productId],
    ) as [ProductImageRow[], unknown];

    // 제철 꾸러미 등록 시 단골 fan-out 알림
    if (isBundleVal === 1) {
      const [subRows]: any = await pool.execute(
        'SELECT subscriber_id FROM subscriptions WHERE seller_id = ? AND status = \'active\'',
        [sellerId],
      );
      const subscriberIds: number[] = subRows.map((r: any) => r.subscriber_id);
      if (subscriberIds.length > 0) {
        createNotificationsBulk(subscriberIds, {
          type:  'seasonal_bundle',
          title: '단골 농부의 제철 꾸러미가 열렸어요',
          body:  seasonLabelVal || name,
          link:  `/app/product-detail/${productId}`,
        }).catch((err: unknown) => console.error('[products] fan-out notification error:', err));
      }
    }

    res.status(201).json(formatProduct(productRows[0], imgRows.map(r => r.image_url)));
  } catch (err) {
    unlockTmpFiles(files);
    console.error('[products] POST error:', err);
    res.status(500).json({ error: '상품 등록에 실패했습니다.' });
  }
});

// GET /api/products — 상품 목록
router.get('/', async (req: Request, res: Response) => {
  const { sellerId, category } = req.query;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (sellerId) {
    conditions.push('p.seller_id = ?');
    params.push(Number(sellerId));
    if (category) { conditions.push('p.category = ?'); params.push(String(category)); }
  } else {
    conditions.push('p.status = ?');
    params.push('active');
    if (category) { conditions.push('p.category = ?'); params.push(String(category)); }
  }

  try {
    const [rows] = await pool.execute(
      `SELECT p.*, u.nickname AS seller_nickname FROM products p LEFT JOIN users u ON u.id = p.seller_id WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC`,
      params,
    ) as [ProductRow[], unknown];

    const extraMap: Record<number, string[]> = {};
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      // IN (?) 리스트는 pool.execute가 배열을 지원하지 않으므로 pool.query 사용
      const [imgRows] = await pool.query(
        'SELECT product_id, image_url FROM product_images WHERE product_id IN (?) ORDER BY sort_order',
        [ids],
      ) as [ProductImageRow[], unknown];
      imgRows.forEach(r => {
        if (!extraMap[r.product_id]) extraMap[r.product_id] = [];
        extraMap[r.product_id].push(r.image_url);
      });
    }

    res.json(rows.map(r => formatProduct(r, extraMap[r.id] ?? [])));
  } catch (err) {
    console.error('[products] GET error:', err);
    res.status(500).json({ error: '목록 조회에 실패했습니다.' });
  }
});

// GET /api/products/:id — 상품 상세
router.get('/:id', async (req: Request, res: Response) => {
  const viewerId = Number(req.query.viewerId as string) || 0;
  try {
    const [productRows] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [Number(req.params.id)],
    ) as [ProductRow[], unknown];
    const product = productRows[0];
    if (!product) { res.status(404).json({ error: '상품을 찾을 수 없습니다.' }); return; }

    const [imgRows] = await pool.execute(
      'SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order',
      [product.id],
    ) as [ProductImageRow[], unknown];

    let viewerIsSubscriber = false;
    if (viewerId && product.is_seasonal_bundle) {
      const [subCheck]: any = await pool.execute(
        'SELECT 1 FROM subscriptions WHERE subscriber_id = ? AND seller_id = ? AND status = \'active\' LIMIT 1',
        [viewerId, product.seller_id],
      );
      viewerIsSubscriber = subCheck.length > 0;
    }

    res.json(formatProduct(product, imgRows.map(r => r.image_url), viewerIsSubscriber));
  } catch (err) {
    console.error('[products] GET/:id error:', err);
    res.status(500).json({ error: '상품 조회에 실패했습니다.' });
  }
});

// PATCH /api/products/:id — 상품 수정
router.patch('/:id', uploadFields, async (req: Request, res: Response) => {
  const productId = Number(req.params.id);
  const { name, description, price, category, features, attributes, status } = req.body;
  const files = (req.files ?? {}) as UploadedFiles;

  try {
    const [existingRows] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [productId],
    ) as [ProductRow[], unknown];
    const existing = existingRows[0];
    if (!existing) {
      unlockTmpFiles(files);
      res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
      return;
    }

    const setClauses: string[] = [];
    const params: (string | number | null)[] = [];

    if (name        !== undefined) { setClauses.push('name = ?');        params.push(name); }
    if (description !== undefined) { setClauses.push('description = ?'); params.push(description); }
    if (price       !== undefined) { setClauses.push('price = ?');       params.push(Number(price)); }
    if (category    !== undefined) { setClauses.push('category = ?');    params.push(category); }
    if (features    !== undefined) { setClauses.push('features = ?');    params.push(features); }
    if (attributes  !== undefined) { setClauses.push('attributes = ?');  params.push(attributes); }
    if (status      !== undefined) { setClauses.push('status = ?');      params.push(status); }

    // 대표이미지 교체
    if (files.image?.[0]) {
      if (existing.image_url) {
        const oldPath = path.join(__dirname, '..', '..', 'public', existing.image_url);
        fs.unlink(oldPath, () => {});
      }
      const f = files.image[0];
      const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
      const dest = path.join(UPLOADS_DIR, `${productId}${ext}`);
      fs.renameSync(f.path, dest);
      const imageUrl = `/uploads/products/${productId}${ext}`;
      setClauses.push('image_url = ?');
      params.push(imageUrl);
    }

    if (setClauses.length > 0) {
      params.push(productId);
      await pool.execute(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`, params);
    }

    // 추가이미지 교체 (새 파일이 있을 때만)
    if (files.images && files.images.length > 0) {
      // 기존 파일 삭제
      const [oldImgRows] = await pool.execute(
        'SELECT image_url FROM product_images WHERE product_id = ?',
        [productId],
      ) as [ProductImageRow[], unknown];
      oldImgRows.forEach(r => {
        const oldPath = path.join(__dirname, '..', '..', 'public', r.image_url);
        fs.unlink(oldPath, () => {});
      });
      await pool.execute('DELETE FROM product_images WHERE product_id = ?', [productId]);

      // 새 파일 저장
      for (let i = 0; i < files.images.length; i++) {
        const f = files.images[i];
        const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
        const dest = path.join(UPLOADS_DIR, `${productId}_extra_${i}${ext}`);
        fs.renameSync(f.path, dest);
        const url = `/uploads/products/${productId}_extra_${i}${ext}`;
        await pool.execute(
          'INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)',
          [productId, url, i],
        );
      }
    }

    const [updatedRows] = await pool.execute(
      'SELECT * FROM products WHERE id = ?',
      [productId],
    ) as [ProductRow[], unknown];
    const [imgRows] = await pool.execute(
      'SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order',
      [productId],
    ) as [ProductImageRow[], unknown];
    res.json(formatProduct(updatedRows[0], imgRows.map(r => r.image_url)));
  } catch (err) {
    unlockTmpFiles(files);
    console.error('[products] PATCH error:', err);
    res.status(500).json({ error: '상품 수정에 실패했습니다.' });
  }
});

// DELETE /api/products/:id — 소프트 삭제 (status='hidden')
router.delete('/:id', async (req: Request, res: Response) => {
  const productId = Number(req.params.id);

  try {
    const [result] = await pool.execute(
      "UPDATE products SET status = 'hidden' WHERE id = ?",
      [productId],
    ) as [InsertResult, unknown];
    if (result.affectedRows === 0) {
      res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error('[products] DELETE error:', err);
    res.status(500).json({ error: '상품 삭제에 실패했습니다.' });
  }
});

// POST /api/products/:id/purchase — 즉시 구매
router.post('/:id/purchase', async (req: Request, res: Response) => {
  const productId = Number(req.params.id);
  const buyerId   = Number(req.body.buyerId);
  if (!productId || !buyerId) {
    res.status(400).json({ error: 'invalid params' });
    return;
  }

  try {
    // 1. 상품 조회
    const [productRows] = await pool.execute(
      'SELECT id, seller_id, name, price, image_url, status FROM products WHERE id = ?',
      [productId],
    ) as [unknown[], unknown];
    const product = (productRows as Array<{
      id: number; seller_id: number; name: string; price: number;
      image_url: string | null; status: string;
    }>)[0];
    if (!product) { res.status(404).json({ error: 'product not found' }); return; }
    if (product.status !== 'active') { res.status(409).json({ error: 'not available' }); return; }
    if (product.seller_id === buyerId) { res.status(400).json({ error: 'cannot buy own product' }); return; }

    // 2. 구매자 배송지 확인 (delivery_addresses 테이블 — 기본 배송지 or 첫 번째)
    const [addrRows] = await pool.execute(
      'SELECT address, detail FROM delivery_addresses WHERE user_id = ? ORDER BY is_default DESC, id ASC LIMIT 1',
      [buyerId],
    ) as [unknown[], unknown];
    const addrRow = (addrRows as Array<{ address: string; detail: string | null }>)[0];
    if (!addrRow) {
      res.status(400).json({ error: 'delivery address required' });
      return;
    }

    // 3. 구매 처리 — auctions row 생성 + product sold 처리
    const [buyerTier, sellerTier] = await Promise.all([
      getBuyerTier(buyerId),
      getSellerTier(product.seller_id),
    ]);
    const { discountAmt, buyerDiscountRate } = calcBuyerDiscount(product.price, buyerTier);
    const { feeAmt, sellerFeeRate }           = calcSellerFee(product.price, sellerTier);
    const orderId = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO auctions
         (id, seller_id, product_name, start_price, current_price, mode, image_url, status, top_bidder_id, ends_at,
          buyer_tier, buyer_discount_rate, buyer_discount_amt, seller_fee_rate, seller_fee_amt)
       VALUES (?, ?, ?, ?, ?, 'direct', ?, 'ended', ?, NOW(), ?, ?, ?, ?, ?)`,
      [
        orderId, product.seller_id, product.name, product.price, product.price,
        product.image_url ?? null, buyerId,
        buyerTier, buyerDiscountRate, discountAmt, sellerFeeRate, feeAmt,
      ],
    );
    await pool.execute('UPDATE products SET status = ? WHERE id = ?', ['sold', productId]);

    res.json({ orderId });
  } catch (err) {
    console.error('[products] POST /:id/purchase error:', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다' });
  }
});

export default router;
