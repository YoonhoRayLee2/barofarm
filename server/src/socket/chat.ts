import { Server } from 'socket.io';
import pool from '../db/mysql';

// 유저 닉네임·아바타 캐시 (userId → {nickname, avatarUrl})
// cr:join / user:identify 시 1회 조회, cr:send 시 캐시 우선 사용
const userCache = new Map<number, { nickname: string; avatarUrl: string | null }>();

export default function registerChatSocket(io: Server): void {
  io.on('connection', (socket) => {

    // user:identify { userId } — personal room join for cr:unread push
    socket.on('user:identify', ({ userId }: { userId: number }) => {
      socket.join(`user:${userId}`);
    });

    // cr:join { roomId, userId, userName }
    socket.on('cr:join', async ({ roomId, userId }: { roomId: number; userId: number; userName: string }) => {
      socket.join(`cr_${roomId}`);
      const memberCount = io.sockets.adapter.rooms.get(`cr_${roomId}`)?.size ?? 0;
      const [[{ total: memberTotal }]] = await pool.query<any[]>(
        'SELECT COUNT(*) AS total FROM chat_room_members WHERE room_id = ?',
        [roomId],
      );
      io.to(`cr_${roomId}`).emit('cr:member_count', { roomId, memberCount, memberTotal });

      // 캐시 미스 시에만 DB 조회
      if (!userCache.has(userId)) {
        try {
          const [rows] = await pool.query<any[]>(
            'SELECT nickname, avatar_url FROM users WHERE id = ?',
            [userId],
          );
          const row = rows[0];
          if (row) {
            userCache.set(userId, { nickname: row.nickname, avatarUrl: row.avatar_url });
          }
        } catch {
          // 캐시 실패는 무시 — cr:send에서 fallback 처리
        }
      }
    });

    // cr:send { roomId, userId, message }
    socket.on('cr:send', async ({ roomId, userId, message }: { roomId: number; userId: number; message: string }) => {
      try {
        const createdAt = new Date();

        const [result] = await pool.query<any>(
          'INSERT INTO chat_messages (room_id, user_id, message, created_at) VALUES (?, ?, ?, ?)',
          [roomId, userId, message, createdAt],
        );
        const msgId: number = result.insertId;

        // 캐시 우선 사용, 미스 시 DB 조회
        let cached = userCache.get(userId);
        if (!cached) {
          const [rows] = await pool.query<any[]>(
            'SELECT nickname, avatar_url FROM users WHERE id = ?',
            [userId],
          );
          const row = rows[0];
          cached = row
            ? { nickname: row.nickname, avatarUrl: row.avatar_url }
            : { nickname: '알 수 없음', avatarUrl: null };
          if (row) userCache.set(userId, cached);
        }

        // 브로드캐스트 즉시 수행 (추가 SELECT 없음)
        io.to(`cr_${roomId}`).emit('cr:message', {
          id: msgId,
          roomId,
          userId,
          userName: cached.nickname,
          avatarUrl: cached.avatarUrl,
          message,
          createdAt,
        });

        // 브로드캐스트 이후 unread push (체감 지연 무관)
        const [members] = await pool.query<any[]>(
          'SELECT user_id FROM chat_room_members WHERE room_id = ? AND user_id != ?',
          [roomId, userId],
        );
        for (const m of members) {
          io.to(`user:${m.user_id}`).emit('cr:unread', { roomId });
        }
      } catch (err) {
        console.error('[chat-socket] cr:send error', err);
        socket.emit('cr:error', { message: 'Failed to send message' });
      }
    });

    // cr:leave { roomId }
    socket.on('cr:leave', async ({ roomId }: { roomId: number }) => {
      socket.leave(`cr_${roomId}`);
      const memberCount = io.sockets.adapter.rooms.get(`cr_${roomId}`)?.size ?? 0;
      const [[{ total: memberTotal }]] = await pool.query<any[]>(
        'SELECT COUNT(*) AS total FROM chat_room_members WHERE room_id = ?',
        [roomId],
      );
      io.to(`cr_${roomId}`).emit('cr:member_count', { roomId, memberCount, memberTotal });
    });

  });
}
