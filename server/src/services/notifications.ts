import type { Server } from 'socket.io';
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

// 관심 카테고리(users.interests, 콤마 구분) 등록 사용자 조회 — 공백 저장 대비 REPLACE
export async function getUsersByInterest(category: string): Promise<number[]> {
  const [rows] = await pool.execute(
    "SELECT id FROM users WHERE FIND_IN_SET(?, REPLACE(interests, ' ', ''))",
    [category],
  ) as [Array<{ id: number }>, unknown];
  return rows.map(r => Number(r.id));
}

// DB bulk 저장 + 소켓 push(notif:new) 조합 fan-out
export async function notifyUsers(io: Server, userIds: number[], payload: NotificationPayload): Promise<void> {
  if (userIds.length === 0) return;
  await createNotificationsBulk(userIds, payload);
  for (const uid of userIds) {
    io.to(`user:${uid}`).emit('notif:new', payload);
  }
}
