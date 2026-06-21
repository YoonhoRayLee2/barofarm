import pool from '../db/mysql';

interface NotificationPayload {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

export async function createNotification(userId: number, payload: NotificationPayload): Promise<void> {
  await pool.execute(
    'INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)',
    [userId, payload.type, payload.title, payload.body ?? null, payload.link ?? null],
  );
}

export async function createNotificationsBulk(userIds: number[], payload: NotificationPayload): Promise<void> {
  if (userIds.length === 0) return;
  const placeholders = userIds.map(() => '(?, ?, ?, ?, ?)').join(', ');
  const params: (number | string | null)[] = [];
  for (const uid of userIds) {
    params.push(uid, payload.type, payload.title, payload.body ?? null, payload.link ?? null);
  }
  await pool.execute(
    `INSERT INTO notifications (user_id, type, title, body, link) VALUES ${placeholders}`,
    params,
  );
}
