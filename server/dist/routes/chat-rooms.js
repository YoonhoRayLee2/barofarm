"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mysql_1 = __importDefault(require("../db/mysql"));
const router = (0, express_1.Router)();
// GET /api/chat-rooms?search= — 그룹 채팅방만 (is_dm=0)
router.get('/', async (req, res) => {
    try {
        const search = typeof req.query.search === 'string' ? req.query.search : '';
        const params = [];
        let whereClause = 'WHERE cr.is_dm = 0';
        if (search.length >= 2) {
            whereClause += ' AND cr.name LIKE ?';
            params.push(`%${search}%`);
        }
        const [rows] = await mysql_1.default.query(`SELECT
         cr.id,
         cr.name,
         cr.description,
         cr.avatar_url,
         cr.created_at,
         u.avatar_url AS creator_avatar_url,
         (SELECT COUNT(*) FROM chat_room_members m WHERE m.room_id = cr.id) AS member_count,
         (SELECT cm.message FROM chat_messages cm WHERE cm.room_id = cr.id ORDER BY cm.id DESC LIMIT 1) AS last_message,
         (SELECT cm.created_at FROM chat_messages cm WHERE cm.room_id = cr.id ORDER BY cm.id DESC LIMIT 1) AS last_message_at
       FROM chat_rooms cr
       JOIN users u ON u.id = cr.created_by
       ${whereClause}
       ORDER BY last_message_at DESC`, params);
        res.json(rows.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            avatarUrl: r.creator_avatar_url ?? r.avatar_url ?? null,
            memberCount: Number(r.member_count),
            lastMessage: r.last_message ?? null,
            lastMessageAt: r.last_message_at ?? null,
            createdAt: r.created_at,
        })));
    }
    catch (err) {
        console.error('[chat-rooms] GET /', err);
        res.status(500).json({ error: 'internal_error' });
    }
});
// GET /api/chat-rooms/mine?userId=&type=group|dm
router.get('/mine', async (req, res) => {
    const userId = Number(req.query.userId);
    if (!userId)
        return res.status(400).json({ error: 'userId required' });
    const type = req.query.type === 'dm' ? 'dm' : 'group';
    try {
        let rows;
        if (type === 'group') {
            [rows] = await mysql_1.default.query(`SELECT cr.id, cr.name, cr.is_dm, cr.avatar_url, cr.created_at,
                u.avatar_url AS creator_avatar_url,
                m.last_read_at,
                (SELECT COUNT(*) FROM chat_room_members m2 WHERE m2.room_id = cr.id) AS member_count,
                (SELECT cm.message FROM chat_messages cm WHERE cm.room_id = cr.id ORDER BY cm.id DESC LIMIT 1) AS last_message,
                (SELECT cm.created_at FROM chat_messages cm WHERE cm.room_id = cr.id ORDER BY cm.id DESC LIMIT 1) AS last_message_at,
                (SELECT COUNT(*) FROM chat_messages cm
                 WHERE cm.room_id = cr.id AND cm.created_at > m.last_read_at AND cm.user_id != ?) AS unread_count
         FROM chat_rooms cr
         JOIN users u ON u.id = cr.created_by
         JOIN chat_room_members m ON m.room_id = cr.id AND m.user_id = ?
         WHERE cr.is_dm = 0
         ORDER BY last_message_at DESC`, [userId, userId]);
        }
        else {
            [rows] = await mysql_1.default.query(`SELECT cr.id, cr.name, cr.is_dm, cr.avatar_url, cr.created_at,
                u.avatar_url AS creator_avatar_url,
                m.last_read_at,
                dm_m.user_id AS dm_partner_id,
                dm_u.nickname AS dm_partner_name,
                dm_u.avatar_url AS dm_partner_avatar,
                (SELECT COUNT(*) FROM chat_room_members m2 WHERE m2.room_id = cr.id) AS member_count,
                (SELECT cm.message FROM chat_messages cm WHERE cm.room_id = cr.id ORDER BY cm.id DESC LIMIT 1) AS last_message,
                (SELECT cm.created_at FROM chat_messages cm WHERE cm.room_id = cr.id ORDER BY cm.id DESC LIMIT 1) AS last_message_at,
                (SELECT COUNT(*) FROM chat_messages cm
                 WHERE cm.room_id = cr.id AND cm.created_at > m.last_read_at AND cm.user_id != ?) AS unread_count
         FROM chat_rooms cr
         JOIN users u ON u.id = cr.created_by
         JOIN chat_room_members m ON m.room_id = cr.id AND m.user_id = ?
         LEFT JOIN chat_room_members dm_m ON dm_m.room_id = cr.id AND cr.is_dm = 1 AND dm_m.user_id != ?
         LEFT JOIN users dm_u ON dm_u.id = dm_m.user_id
         WHERE cr.is_dm = 1
         ORDER BY last_message_at DESC`, [userId, userId, userId]);
        }
        res.json(rows.map((r) => {
            const isDm = Boolean(r.is_dm);
            return {
                id: r.id,
                isDm,
                name: isDm ? (r.dm_partner_name || '알 수 없는 사용자') : r.name,
                avatarUrl: isDm ? (r.dm_partner_avatar ?? null) : (r.creator_avatar_url ?? r.avatar_url ?? null),
                dmPartnerId: isDm ? r.dm_partner_id : null,
                memberCount: Number(r.member_count),
                lastMessage: r.last_message ?? null,
                lastMessageAt: r.last_message_at ?? null,
                unreadCount: Number(r.unread_count),
            };
        }));
    }
    catch (err) {
        console.error('[chat-rooms] GET /mine', err);
        res.status(500).json({ error: 'internal_error' });
    }
});
// POST /api/chat-rooms — 그룹 채팅방 생성
router.post('/', async (req, res) => {
    const { name, description, avatarUrl, createdBy } = req.body;
    if (!name || !createdBy)
        return res.status(400).json({ error: 'name and createdBy required' });
    const conn = await mysql_1.default.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.query('INSERT INTO chat_rooms (name, description, avatar_url, created_by) VALUES (?, ?, ?, ?)', [name, description ?? null, avatarUrl ?? null, createdBy]);
        const roomId = result.insertId;
        await conn.query('INSERT INTO chat_room_members (room_id, user_id) VALUES (?, ?)', [roomId, createdBy]);
        await conn.commit();
        const [rows] = await conn.query('SELECT * FROM chat_rooms WHERE id = ?', [roomId]);
        res.status(201).json({
            id: rows[0].id,
            name: rows[0].name,
            description: rows[0].description,
            avatarUrl: rows[0].avatar_url,
            createdBy: rows[0].created_by,
            createdAt: rows[0].created_at,
        });
    }
    catch (err) {
        await conn.rollback();
        console.error('[chat-rooms] POST /', err);
        res.status(500).json({ error: 'internal_error' });
    }
    finally {
        conn.release();
    }
});
// POST /api/chat-rooms/dm — DM 룸 찾기 or 생성
router.post('/dm', async (req, res) => {
    const { userId, partnerId } = req.body;
    if (!userId || !partnerId)
        return res.status(400).json({ error: 'userId and partnerId required' });
    if (Number(userId) === Number(partnerId))
        return res.status(400).json({ error: 'cannot DM yourself' });
    // 1. 기존 DM 룸 탐색
    const [existing] = await mysql_1.default.query(`SELECT cr.id FROM chat_rooms cr
     JOIN chat_room_members m1 ON m1.room_id = cr.id AND m1.user_id = ?
     JOIN chat_room_members m2 ON m2.room_id = cr.id AND m2.user_id = ?
     WHERE cr.is_dm = 1
     LIMIT 1`, [userId, partnerId]);
    if (existing.length > 0)
        return res.json({ roomId: existing[0].id });
    // 2. 새 DM 룸 생성 (트랜잭션)
    const conn = await mysql_1.default.getConnection();
    try {
        await conn.beginTransaction();
        const [result] = await conn.query('INSERT INTO chat_rooms (name, is_dm, created_by) VALUES (?, 1, ?)', ['dm', userId]);
        const roomId = result.insertId;
        await conn.query('INSERT INTO chat_room_members (room_id, user_id) VALUES (?, ?)', [roomId, userId]);
        await conn.query('INSERT INTO chat_room_members (room_id, user_id) VALUES (?, ?)', [roomId, partnerId]);
        await conn.commit();
        res.status(201).json({ roomId });
    }
    catch (err) {
        await conn.rollback();
        console.error('[chat-rooms] POST /dm', err);
        res.status(500).json({ error: 'internal_error' });
    }
    finally {
        conn.release();
    }
});
// GET /api/chat-rooms/:id/members — 멤버 목록
router.get('/:id/members', async (req, res) => {
    const roomId = Number(req.params.id);
    const [rows] = await mysql_1.default.query(`SELECT crm.user_id, u.nickname, u.avatar_url, cr.created_by
     FROM chat_room_members crm
     JOIN users u ON u.id = crm.user_id
     JOIN chat_rooms cr ON cr.id = crm.room_id
     WHERE crm.room_id = ?
     ORDER BY crm.joined_at ASC`, [roomId]);
    res.json(rows.map((r) => ({
        userId: r.user_id,
        displayName: r.nickname || '익명',
        avatarUrl: r.avatar_url ?? null,
        isCreator: r.user_id === r.created_by,
    })));
});
// GET /api/chat-rooms/:id?viewerId= — 단일 방 메타
router.get('/:id', async (req, res) => {
    const roomId = Number(req.params.id);
    const viewerId = Number(req.query.viewerId) || 0;
    const [rows] = await mysql_1.default.query(`SELECT cr.id, cr.name, cr.is_dm, cr.avatar_url, cr.created_at, cr.created_by,
            u.avatar_url AS creator_avatar_url,
            (SELECT COUNT(*) FROM chat_room_members m WHERE m.room_id = cr.id) AS member_count,
            dm_m.user_id AS dm_partner_id,
            dm_u.nickname AS dm_partner_name,
            dm_u.avatar_url AS dm_partner_avatar
     FROM chat_rooms cr
     JOIN users u ON u.id = cr.created_by
     LEFT JOIN chat_room_members dm_m
       ON dm_m.room_id = cr.id AND cr.is_dm = 1 AND dm_m.user_id != ?
     LEFT JOIN users dm_u ON dm_u.id = dm_m.user_id
     WHERE cr.id = ?`, [viewerId || -1, roomId]);
    if (!rows.length)
        return res.status(404).json({ error: 'not_found' });
    const r = rows[0];
    const isDm = Boolean(r.is_dm);
    res.json({
        id: r.id,
        name: isDm ? (r.dm_partner_name || '알 수 없는 사용자') : r.name,
        isDm,
        avatarUrl: isDm ? (r.dm_partner_avatar ?? null) : (r.creator_avatar_url ?? r.avatar_url ?? null),
        memberCount: Number(r.member_count),
        createdAt: r.created_at,
        createdBy: r.created_by,
        dmPartnerId: isDm ? r.dm_partner_id : null,
        dmPartnerName: isDm ? (r.dm_partner_name || null) : null,
        dmPartnerAvatarUrl: isDm ? (r.dm_partner_avatar || null) : null,
    });
});
// POST /api/chat-rooms/:id/join
router.post('/:id/join', async (req, res) => {
    const roomId = Number(req.params.id);
    const { userId } = req.body;
    if (!userId)
        return res.status(400).json({ error: 'userId required' });
    try {
        await mysql_1.default.query('INSERT INTO chat_room_members (room_id, user_id) VALUES (?, ?)', [roomId, userId]);
        res.json({ ok: true });
    }
    catch (err) {
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ error: 'already_joined' });
        console.error('[chat-rooms] POST /:id/join', err);
        res.status(500).json({ error: 'internal_error' });
    }
});
// DELETE /api/chat-rooms/:id/leave
router.delete('/:id/leave', async (req, res) => {
    const roomId = Number(req.params.id);
    const { userId } = req.body;
    if (!userId)
        return res.status(400).json({ error: 'userId required' });
    try {
        await mysql_1.default.query('DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?', [roomId, userId]);
        res.json({ ok: true });
    }
    catch (err) {
        console.error('[chat-rooms] DELETE /:id/leave', err);
        res.status(500).json({ error: 'internal_error' });
    }
});
// GET /api/chat-rooms/:id/messages?before=&limit=50
router.get('/:id/messages', async (req, res) => {
    const roomId = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before ? Number(req.query.before) : null;
    try {
        const params = [roomId];
        let beforeClause = '';
        if (before) {
            beforeClause = 'AND cm.id < ?';
            params.push(before);
        }
        params.push(limit);
        const [rows] = await mysql_1.default.query(`SELECT
         cm.id,
         cm.room_id,
         cm.user_id,
         u.nickname AS user_name,
         u.avatar_url,
         cm.message,
         cm.created_at
       FROM chat_messages cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.room_id = ? ${beforeClause}
       ORDER BY cm.id DESC
       LIMIT ?`, params);
        // Reverse to return oldest-first for display
        res.json(rows.reverse().map((r) => ({
            id: r.id,
            roomId: r.room_id,
            userId: r.user_id,
            userName: r.user_name,
            avatarUrl: r.avatar_url,
            message: r.message,
            createdAt: r.created_at,
        })));
    }
    catch (err) {
        console.error('[chat-rooms] GET /:id/messages', err);
        res.status(500).json({ error: 'internal_error' });
    }
});
// PATCH /api/chat-rooms/:id/read
router.patch('/:id/read', async (req, res) => {
    const roomId = Number(req.params.id);
    const { userId } = req.body;
    if (!userId)
        return res.status(400).json({ error: 'userId required' });
    try {
        await mysql_1.default.query('UPDATE chat_room_members SET last_read_at = NOW() WHERE room_id = ? AND user_id = ?', [roomId, userId]);
        res.json({ ok: true });
    }
    catch (err) {
        console.error('[chat-rooms] PATCH /:id/read', err);
        res.status(500).json({ error: 'internal_error' });
    }
});
exports.default = router;
