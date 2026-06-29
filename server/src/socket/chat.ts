import { Server } from 'socket.io';
import pool from '../db/mysql';

export default function registerChatSocket(io: Server): void {
  io.on('connection', (socket) => {

    // user:identify { userId } — personal room join for cr:unread push
    socket.on('user:identify', ({ userId }: { userId: number }) => {
      socket.join(`user:${userId}`);
    });

    // cr:join { roomId, userId, userName }
    socket.on('cr:join', ({ roomId, userId, userName }: { roomId: number; userId: number; userName: string }) => {
      socket.join(`cr_${roomId}`);
      const memberCount = io.sockets.adapter.rooms.get(`cr_${roomId}`)?.size ?? 0;
      io.to(`cr_${roomId}`).emit('cr:member_count', { roomId, memberCount });
    });

    // cr:send { roomId, userId, message }
    socket.on('cr:send', async ({ roomId, userId, message }: { roomId: number; userId: number; message: string }) => {
      try {
        const [result] = await pool.query<any>(
          'INSERT INTO chat_messages (room_id, user_id, message) VALUES (?, ?, ?)',
          [roomId, userId, message],
        );
        const msgId: number = result.insertId;

        const [rows] = await pool.query<any[]>(
          'SELECT nickname, avatar_url FROM users WHERE id = ?',
          [userId],
        );
        const user = rows[0] ?? { nickname: '알 수 없음', avatar_url: null };

        const [tsRows] = await pool.query<any[]>(
          'SELECT created_at FROM chat_messages WHERE id = ?',
          [msgId],
        );

        io.to(`cr_${roomId}`).emit('cr:message', {
          id: msgId,
          roomId,
          userId,
          userName: user.nickname,
          avatarUrl: user.avatar_url,
          message,
          createdAt: tsRows[0]?.created_at ?? new Date(),
        });

        // push cr:unread to all members except sender
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
    socket.on('cr:leave', ({ roomId }: { roomId: number }) => {
      socket.leave(`cr_${roomId}`);
    });

  });
}
