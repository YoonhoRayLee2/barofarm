import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import pool from '../db/mysql';

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

const router = Router();

// POST /api/products — 상품 등록
router.post('/', uploadFields, async (req: Request, res: Response) => {
  const { sellerId, name, description, price, category, features, attributes } = req.body;
  const files = (req.files ?? {}) as UploadedFiles;

  if (!sellerId || !name || !price) {
    unlockTmpFiles(files);
    res.status(400).json({ error: 'sellerId, name, price는 필수입니다.' });
    return;
  }

  try {
    const [result]: any = await pool.query(
      `INSERT INTO products (seller_id, name, description, price, category, features, attributes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sellerId, name, description ?? null, Number(price), category ?? null, features ?? null, attributes ?? null],
    );

    const productId: number = result.insertId;
    let imageUrl: string | null = null;

    // 대표이미지
    if (files.image?.[0]) {
      const f = files.image[0];
      const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
      const dest = path.join(UPLOADS_DIR, `${productId}${ext}`);
      fs.renameSync(f.path, dest);
      imageUrl = `/uploads/products/${productId}${ext}`;
      await pool.query('UPDATE products SET image_url = ? WHERE id = ?', [imageUrl, productId]);
    }

    // 추가이미지
    if (files.images && files.images.length > 0) {
      for (let i = 0; i < files.images.length; i++) {
        const f = files.images[i];
        const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
        const dest = path.join(UPLOADS_DIR, `${productId}_extra_${i}${ext}`);
        fs.renameSync(f.path, dest);
        const url = `/uploads/products/${productId}_extra_${i}${ext}`;
        await pool.query(
          'INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)',
          [productId, url, i],
        );
      }
    }

    const [[product]]: any = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
    const [imgRows]: any = await pool.query(
      'SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order',
      [productId],
    );
    res.status(201).json(toResponse(product, imgRows.map((r: any) => r.image_url)));
  } catch (err: any) {
    unlockTmpFiles(files);
    console.error('[products] POST error:', err);
    res.status(500).json({ error: '상품 등록에 실패했습니다.' });
  }
});

// GET /api/products — 상품 목록
router.get('/', async (req: Request, res: Response) => {
  const { sellerId, category } = req.query;

  let conditions: string[];
  let params: any[];

  if (sellerId) {
    conditions = ['p.seller_id = ?'];
    params = [Number(sellerId)];
    if (category) { conditions.push('p.category = ?'); params.push(category); }
  } else {
    conditions = ['p.status = ?'];
    params = ['active'];
    if (category) { conditions.push('p.category = ?'); params.push(category); }
  }

  try {
    const [rows]: any = await pool.query(
      `SELECT p.*, u.nickname AS seller_nickname FROM products p LEFT JOIN users u ON u.id = p.seller_id WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC`,
      params,
    );

    let extraMap: Record<number, string[]> = {};
    if (rows.length > 0) {
      const ids = rows.map((r: any) => r.id);
      const [imgRows]: any = await pool.query(
        'SELECT product_id, image_url FROM product_images WHERE product_id IN (?) ORDER BY sort_order',
        [ids],
      );
      imgRows.forEach((r: any) => {
        if (!extraMap[r.product_id]) extraMap[r.product_id] = [];
        extraMap[r.product_id].push(r.image_url);
      });
    }

    res.json(rows.map((r: any) => toResponse(r, extraMap[r.id] ?? [])));
  } catch (err: any) {
    console.error('[products] GET error:', err);
    res.status(500).json({ error: '목록 조회에 실패했습니다.' });
  }
});

// GET /api/products/:id — 상품 상세
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [[product]]: any = await pool.query(
      'SELECT * FROM products WHERE id = ?',
      [Number(req.params.id)],
    );
    if (!product) { res.status(404).json({ error: '상품을 찾을 수 없습니다.' }); return; }

    const [imgRows]: any = await pool.query(
      'SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order',
      [product.id],
    );
    res.json(toResponse(product, imgRows.map((r: any) => r.image_url)));
  } catch (err: any) {
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
    const [[existing]]: any = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
    if (!existing) {
      unlockTmpFiles(files);
      res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
      return;
    }

    const setClauses: string[] = [];
    const params: any[] = [];

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
      await pool.query(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`, params);
    }

    // 추가이미지 교체 (새 파일이 있을 때만)
    if (files.images && files.images.length > 0) {
      // 기존 파일 삭제
      const [oldImgRows]: any = await pool.query(
        'SELECT image_url FROM product_images WHERE product_id = ?',
        [productId],
      );
      oldImgRows.forEach((r: any) => {
        const oldPath = path.join(__dirname, '..', '..', 'public', r.image_url);
        fs.unlink(oldPath, () => {});
      });
      await pool.query('DELETE FROM product_images WHERE product_id = ?', [productId]);

      // 새 파일 저장
      for (let i = 0; i < files.images.length; i++) {
        const f = files.images[i];
        const ext = path.extname(f.originalname).toLowerCase() || '.jpg';
        const dest = path.join(UPLOADS_DIR, `${productId}_extra_${i}${ext}`);
        fs.renameSync(f.path, dest);
        const url = `/uploads/products/${productId}_extra_${i}${ext}`;
        await pool.query(
          'INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)',
          [productId, url, i],
        );
      }
    }

    const [[updated]]: any = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
    const [imgRows]: any = await pool.query(
      'SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order',
      [productId],
    );
    res.json(toResponse(updated, imgRows.map((r: any) => r.image_url)));
  } catch (err: any) {
    unlockTmpFiles(files);
    console.error('[products] PATCH error:', err);
    res.status(500).json({ error: '상품 수정에 실패했습니다.' });
  }
});

// DELETE /api/products/:id — 소프트 삭제 (status='hidden')
router.delete('/:id', async (req: Request, res: Response) => {
  const productId = Number(req.params.id);

  try {
    const [result]: any = await pool.query(
      "UPDATE products SET status = 'hidden' WHERE id = ?",
      [productId],
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: '상품을 찾을 수 없습니다.' });
      return;
    }
    res.status(204).send();
  } catch (err: any) {
    console.error('[products] DELETE error:', err);
    res.status(500).json({ error: '상품 삭제에 실패했습니다.' });
  }
});

function toResponse(p: any, extraImages: string[] = []) {
  return {
    id:          p.id,
    sellerId:    p.seller_id,
    sellerName:  p.seller_nickname ?? null,
    name:        p.name,
    description: p.description,
    price:       p.price,
    category:    p.category,
    imageUrl:    p.image_url,
    features:    p.features,
    attributes:  p.attributes,
    status:      p.status,
    createdAt:   p.created_at,
    images:      extraImages,
  };
}

export default router;
