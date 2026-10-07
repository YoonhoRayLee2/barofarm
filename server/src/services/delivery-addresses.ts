import pool from '../db/mysql';

export interface DeliveryAddressInput {
  name: string;
  phone: string;
  zipcode: string;
  address: string;
  detail?: string | null;
}

export interface DeliveryAddressRow {
  id: number;
  name: string;
  phone: string;
  zipcode: string;
  address: string;
  detail: string | null;
  isDefault: boolean;
  createdAt: string;
}

async function syncDefaultToUsers(
  userId: number,
  addr: { name: string; phone: string; zipcode: string; address: string; detail: string | null },
): Promise<void> {
  await pool.query(
    'UPDATE users SET delivery_name=?, delivery_phone=?, delivery_zipcode=?, delivery_address=?, delivery_detail=? WHERE id=?',
    [addr.name, addr.phone, addr.zipcode, addr.address, addr.detail ?? null, userId],
  );
}

function mapRow(r: any): DeliveryAddressRow {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    zipcode: r.zipcode,
    address: r.address,
    detail: r.detail,
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at,
  };
}

export async function listAddresses(userId: number): Promise<DeliveryAddressRow[]> {
  const [rows] = await pool.query<any[]>(
    'SELECT id, name, phone, zipcode, address, detail, is_default, created_at FROM delivery_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
    [userId],
  );
  return rows.map(mapRow);
}

/** addrId가 userId 소유가 아니면 null. */
export async function getAddress(userId: number, addrId: number): Promise<DeliveryAddressRow | null> {
  const [rows] = await pool.query<any[]>(
    'SELECT id, name, phone, zipcode, address, detail, is_default, created_at FROM delivery_addresses WHERE id = ? AND user_id = ?',
    [addrId, userId],
  );
  if (!rows.length) return null;
  return mapRow(rows[0]);
}

export async function createAddress(
  userId: number,
  body: DeliveryAddressInput,
): Promise<{ id: number; isDefault: boolean }> {
  const { name, phone, zipcode, address, detail } = body;

  const [existing] = await pool.query<any[]>(
    'SELECT COUNT(*) AS cnt FROM delivery_addresses WHERE user_id = ?',
    [userId],
  );
  const isDefault = existing[0].cnt === 0 ? 1 : 0;

  const [result] = await pool.query<any>(
    'INSERT INTO delivery_addresses (user_id, name, phone, zipcode, address, detail, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, name, phone, zipcode, address, detail ?? null, isDefault],
  );

  if (isDefault) {
    await syncDefaultToUsers(userId, { name, phone, zipcode, address, detail: detail ?? null });
  }

  return { id: result.insertId, isDefault: Boolean(isDefault) };
}

/** addrId가 userId 소유가 아니면 null. */
export async function updateAddress(
  userId: number,
  addrId: number,
  body: DeliveryAddressInput,
): Promise<{ ok: true } | null> {
  const { name, phone, zipcode, address, detail } = body;

  const [result] = await pool.query<any>(
    'UPDATE delivery_addresses SET name=?, phone=?, zipcode=?, address=?, detail=? WHERE id=? AND user_id=?',
    [name, phone, zipcode, address, detail ?? null, addrId, userId],
  );
  if (result.affectedRows === 0) return null;

  const [rows] = await pool.query<any[]>(
    'SELECT is_default FROM delivery_addresses WHERE id=?',
    [addrId],
  );
  if (rows.length && rows[0].is_default) {
    await syncDefaultToUsers(userId, { name, phone, zipcode, address, detail: detail ?? null });
  }

  return { ok: true };
}

/** addrId가 userId 소유가 아니면 null. */
export async function deleteAddress(userId: number, addrId: number): Promise<{ ok: true } | null> {
  const [rows] = await pool.query<any[]>(
    'SELECT is_default FROM delivery_addresses WHERE id=? AND user_id=?',
    [addrId, userId],
  );
  if (!rows.length) return null;
  const wasDefault = Boolean(rows[0].is_default);

  await pool.query('DELETE FROM delivery_addresses WHERE id=? AND user_id=?', [addrId, userId]);

  if (wasDefault) {
    const [remaining] = await pool.query<any[]>(
      'SELECT id, name, phone, zipcode, address, detail FROM delivery_addresses WHERE user_id=? ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    if (remaining.length) {
      await pool.query('UPDATE delivery_addresses SET is_default=1 WHERE id=?', [remaining[0].id]);
      await syncDefaultToUsers(userId, remaining[0]);
    } else {
      await pool.query(
        'UPDATE users SET delivery_name=NULL, delivery_phone=NULL, delivery_zipcode=NULL, delivery_address=NULL, delivery_detail=NULL WHERE id=?',
        [userId],
      );
    }
  }

  return { ok: true };
}

/** addrId가 userId 소유가 아니면 null. */
export async function setDefaultAddress(userId: number, addrId: number): Promise<{ ok: true } | null> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE delivery_addresses SET is_default=0 WHERE user_id=?', [userId]);
    const [result] = await conn.query<any>(
      'UPDATE delivery_addresses SET is_default=1 WHERE id=? AND user_id=?',
      [addrId, userId],
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return null;
    }
    const [rows] = await conn.query<any[]>(
      'SELECT name, phone, zipcode, address, detail FROM delivery_addresses WHERE id=?',
      [addrId],
    );
    await conn.commit();

    await syncDefaultToUsers(userId, rows[0]);
    return { ok: true };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
