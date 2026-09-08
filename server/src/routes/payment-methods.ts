import { Router, Request, Response } from 'express';
import pool from '../db/mysql';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

type PmType = 'card' | 'easy' | 'account';
const VALID_TYPES: PmType[] = ['card', 'easy', 'account'];

function serialize(r: any) {
  return {
    id: r.id,
    type: r.type as PmType,
    label: r.label,
    cardBrand: r.card_brand ?? null,
    cardLast4: r.card_last4 ?? null,
    cardExpiry: r.card_expiry ?? null,
    cardHolder: r.card_holder ?? null,
    easyProvider: r.easy_provider ?? null,
    bankName: r.bank_name ?? null,
    accountLast4: r.account_last4 ?? null,
    accountHolder: r.account_holder ?? null,
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at,
  };
}

// GET /api/payment-methods
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const [rows] = await pool.query<any[]>(
      'SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
      [userId],
    );
    res.json(rows.map(serialize));
  } catch (err) {
    console.error('[payment-methods] GET /', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/payment-methods
// body: { userId, type, label?, ...type별 필드 }
// 카드: { cardNumber, cardExpiry, cardHolder, cardBrand? } — 전체번호는 저장 안 하고 끝 4자리만 보관
// 간편결제: { easyProvider }
// 계좌: { bankName, accountNumber, accountHolder } — 전체계좌번호는 저장 안 하고 끝 4자리만 보관
router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { type } = req.body;
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'valid type required' });
  }

  let label = String(req.body.label ?? '').trim();
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  let cardExpiry: string | null = null;
  let cardHolder: string | null = null;
  let easyProvider: string | null = null;
  let bankName: string | null = null;
  let accountLast4: string | null = null;
  let accountHolder: string | null = null;

  if (type === 'card') {
    const digits = String(req.body.cardNumber ?? '').replace(/\D/g, '');
    if (digits.length < 12) return res.status(400).json({ error: 'invalid card number' });
    if (!req.body.cardExpiry || !req.body.cardHolder) {
      return res.status(400).json({ error: 'card expiry and holder required' });
    }
    cardLast4 = digits.slice(-4);
    cardExpiry = String(req.body.cardExpiry).trim();
    cardHolder = String(req.body.cardHolder).trim();
    cardBrand = req.body.cardBrand ? String(req.body.cardBrand).trim() : null;
    if (!label) label = `${cardBrand || '카드'} ****${cardLast4}`;
  } else if (type === 'easy') {
    easyProvider = String(req.body.easyProvider ?? '').trim();
    if (!easyProvider) return res.status(400).json({ error: 'easyProvider required' });
    if (!label) label = easyProvider;
  } else if (type === 'account') {
    const digits = String(req.body.accountNumber ?? '').replace(/\D/g, '');
    if (digits.length < 6) return res.status(400).json({ error: 'invalid account number' });
    if (!req.body.bankName || !req.body.accountHolder) {
      return res.status(400).json({ error: 'bankName and accountHolder required' });
    }
    accountLast4 = digits.slice(-4);
    bankName = String(req.body.bankName).trim();
    accountHolder = String(req.body.accountHolder).trim();
    if (!label) label = `${bankName} ****${accountLast4}`;
  }

  try {
    const [existing] = await pool.query<any[]>(
      'SELECT COUNT(*) AS cnt FROM payment_methods WHERE user_id = ?',
      [userId],
    );
    const isDefault = existing[0].cnt === 0 ? 1 : 0;

    const [result] = await pool.query<any>(
      `INSERT INTO payment_methods
         (user_id, type, label, card_brand, card_last4, card_expiry, card_holder, easy_provider,
          bank_name, account_last4, account_holder, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, label, cardBrand, cardLast4, cardExpiry, cardHolder, easyProvider,
       bankName, accountLast4, accountHolder, isDefault],
    );

    res.status(201).json({ id: result.insertId, isDefault: Boolean(isDefault) });
  } catch (err) {
    console.error('[payment-methods] POST /', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/payment-methods/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const userId = req.user!.userId;

  try {
    const [rows] = await pool.query<any[]>(
      'SELECT is_default FROM payment_methods WHERE id=? AND user_id=?',
      [id, userId],
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    const wasDefault = Boolean(rows[0].is_default);

    await pool.query('DELETE FROM payment_methods WHERE id=? AND user_id=?', [id, userId]);

    // 기본 결제수단 삭제 시 가장 최근 등록 건을 기본으로 승격
    if (wasDefault) {
      const [remaining] = await pool.query<any[]>(
        'SELECT id FROM payment_methods WHERE user_id=? ORDER BY created_at DESC LIMIT 1',
        [userId],
      );
      if (remaining.length) {
        await pool.query('UPDATE payment_methods SET is_default=1 WHERE id=?', [remaining[0].id]);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[payment-methods] DELETE /:id', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// PATCH /api/payment-methods/:id/set-default
router.patch('/:id/set-default', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const userId = req.user!.userId;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE payment_methods SET is_default=0 WHERE user_id=?', [userId]);
    const [result] = await conn.query<any>(
      'UPDATE payment_methods SET is_default=1 WHERE id=? AND user_id=?',
      [id, userId],
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not_found' });
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('[payment-methods] PATCH /:id/set-default', err);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    conn.release();
  }
});

export default router;
