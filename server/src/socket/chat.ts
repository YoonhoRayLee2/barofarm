import { Server } from 'socket.io';
import pool from '../db/mysql';

// 유저 닉네임·아바타 캐시 (userId → {nickname, avatarUrl})
// cr:join / user:identify 시 1회 조회, cr:send 시 캐시 우선 사용
const userCache = new Map<number, { nickname: string; avatarUrl: string | null }>();
const USER_CACHE_MAX = 5000;

// 캐시에 엔트리를 추가하고, 상한 초과 시 가장 오래 삽입된 엔트리를 제거한다 (FIFO — Map은 삽입 순서를 보존).
function setCachedUser(userId: number, value: { nickname: string; avatarUrl: string | null }): void {
  userCache.delete(userId); // 이미 있으면 갱신을 위해 재삽입(최신 위치로 이동)
  userCache.set(userId, value);
  if (userCache.size > USER_CACHE_MAX) {
    const oldestKey = userCache.keys().next().value;
    if (oldestKey !== undefined) userCache.delete(oldestKey);
  }
}

// routes/users.ts PATCH /:id (닉네임·아바타 변경) 성공 시 호출 — 다음 조회에서 최신 정보를 다시 가져오게 한다.
export function invalidateUserCache(userId: number): void {
  userCache.delete(userId);
}

export default function registerChatSocket(io: Server): void {
  io.on('connection', (socket) => {

    // user:identify { userId } — personal room join for cr:unread push
    socket.on('user:identify', ({ userId }: { userId: number }) => {
      socket.join(`user:${userId}`);
    });

    // cr:join { roomId, userId, userName }
    socket.on('cr:join', async ({ roomId, userId }: { roomId: number; userId: number; userName: string }) => {
      try {
        socket.join(`cr_${roomId}`);
        const memberCount = io.sockets.adapter.rooms.get(`cr_${roomId}`)?.size ?? 0;
        const [[{ total: memberTotal }]] = await pool.query<any[]>(
          'SELECT COUNT(*) AS total FROM chat_room_members WHERE room_id = ?',
          [roomId],
        );
        io.to(`cr_${roomId}`).emit('cr:member_count', { roomId, memberCount, memberTotal });

        // 캐시 미스 시에만 DB 조회
        if (!userCache.has(userId)) {
          const [rows] = await pool.query<any[]>(
            'SELECT nickname, avatar_url FROM users WHERE id = ?',
            [userId],
          );
          const row = rows[0];
          if (row) {
            setCachedUser(userId, { nickname: row.nickname, avatarUrl: row.avatar_url });
          }
        }
      } catch (err) {
        console.error('[chat-socket] cr:join error', err);
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
          if (row) setCachedUser(userId, cached);
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
      try {
        socket.leave(`cr_${roomId}`);
        const memberCount = io.sockets.adapter.rooms.get(`cr_${roomId}`)?.size ?? 0;
        const [[{ total: memberTotal }]] = await pool.query<any[]>(
          'SELECT COUNT(*) AS total FROM chat_room_members WHERE room_id = ?',
          [roomId],
        );
        io.to(`cr_${roomId}`).emit('cr:member_count', { roomId, memberCount, memberTotal });
      } catch (err) {
        console.error('[chat-socket] cr:leave error', err);
      }
    });

    // 비정상 종료(네트워크 끊김 등) 시 접속자 수를 갱신 — cr:leave가 안 온 경우 대비.
    // disconnecting 시점엔 socket.rooms에 아직 참여 중인 cr_* 방이 남아있다.
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (!room.startsWith('cr_')) continue;
        const roomId = Number(room.slice(3));
        // 이 소켓이 곧 나가므로 현재 크기에서 1을 뺀 값이 잔여 접속자 수.
        const memberCount = Math.max(0, (io.sockets.adapter.rooms.get(room)?.size ?? 1) - 1);
        io.to(room).emit('cr:member_count', { roomId, memberCount });
      }
    });

  });
}
