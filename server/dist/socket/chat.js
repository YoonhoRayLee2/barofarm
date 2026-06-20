"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = registerChatSocket;
const mysql_1 = __importDefault(require("../db/mysql"));
function registerChatSocket(io) {
    io.on('connection', (socket) => {
        // cr:join { roomId, userId, userName }
        socket.on('cr:join', ({ roomId, userId, userName }) => {
            socket.join(`cr_${roomId}`);
            const memberCount = io.sockets.adapter.rooms.get(`cr_${roomId}`)?.size ?? 0;
            io.to(`cr_${roomId}`).emit('cr:member_count', { roomId, memberCount });
        });
        // cr:send { roomId, userId, message }
        socket.on('cr:send', async ({ roomId, userId, message }) => {
            try {
                const [result] = await mysql_1.default.query('INSERT INTO chat_messages (room_id, user_id, message) VALUES (?, ?, ?)', [roomId, userId, message]);
                const msgId = result.insertId;
                const [rows] = await mysql_1.default.query('SELECT nickname, avatar_url FROM users WHERE id = ?', [userId]);
                const user = rows[0] ?? { nickname: '알 수 없음', avatar_url: null };
                const [tsRows] = await mysql_1.default.query('SELECT created_at FROM chat_messages WHERE id = ?', [msgId]);
                io.to(`cr_${roomId}`).emit('cr:message', {
                    id: msgId,
                    roomId,
                    userId,
                    userName: user.nickname,
                    avatarUrl: user.avatar_url,
                    message,
                    createdAt: tsRows[0]?.created_at ?? new Date(),
                });
            }
            catch (err) {
                console.error('[chat-socket] cr:send error', err);
                socket.emit('cr:error', { message: 'Failed to send message' });
            }
        });
        // cr:leave { roomId }
        socket.on('cr:leave', ({ roomId }) => {
            socket.leave(`cr_${roomId}`);
        });
    });
}
