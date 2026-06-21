"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGroupDealsRouter = createGroupDealsRouter;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mysql_1 = __importDefault(require("../db/mysql"));
const UPLOADS_DIR = path_1.default.join(__dirname, '..', '..', 'public', 'uploads', 'group-deals');
fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
        filename: (_req, _file, cb) => cb(null, `tmp_${Date.now()}.jpg`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/'))
            cb(null, true);
        else
            cb(new Error('이미지 파일만 허용됩니다.'));
    },
});
function toCamel(row) {
    return {
        id: row.id,
        sellerId: row.seller_id,
        sellerName: row.seller_name ?? null,
        sellerAvatar: row.seller_avatar ?? null,
        title: row.title,
        description: row.description ?? null,
        imageUrl: row.image_url ?? null,
        category: row.category,
        pricePerUnit: Number(row.price_per_unit),
        unitLabel: row.unit_label,
        minParticipants: Number(row.min_participants),
        maxParticipants: row.max_participants != null ? Number(row.max_participants) : null,
        currentParticipants: Number(row.current_participants),
        status: row.status,
        closesAt: row.closes_at,
        createdAt: row.created_at,
    };
}
function createGroupDealsRouter(io) {
    const r = (0, express_1.Router)();
    // POST / — 공동구매 개설
    r.post('/', upload.single('image'), async (req, res) => {
        const { sellerId, title, description, category, pricePerUnit, unitLabel, minParticipants, maxParticipants, closesAt, } = req.body;
        if (!sellerId || !title || !category || !pricePerUnit || !unitLabel || !minParticipants || !closesAt) {
            if (req.file)
                fs_1.default.unlink(req.file.path, () => { });
            res.status(400).json({ error: 'sellerId, title, category, pricePerUnit, unitLabel, minParticipants, closesAt 은 필수입니다.' });
            return;
        }
        let imageUrl = null;
        if (req.file) {
            const tmpPath = req.file.path;
            // 임시로 저장된 파일을 임시 이름 그대로 유지 — insertId 획득 후 rename
            imageUrl = tmpPath; // placeholder, updated below
        }
        try {
            const [result] = await mysql_1.default.execute(`INSERT INTO group_deals
           (seller_id, title, description, image_url, category, price_per_unit, unit_label,
            min_participants, max_participants, closes_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                Number(sellerId), title, description ?? null, null,
                category, Number(pricePerUnit), unitLabel,
                Number(minParticipants), maxParticipants ? Number(maxParticipants) : null,
                new Date(closesAt).toISOString().slice(0, 19).replace('T', ' '),
            ]);
            const dealId = result.insertId;
            // 이미지 파일이 있으면 dealId 기반 최종 경로로 rename
            if (req.file) {
                const finalName = `${dealId}.jpg`;
                const finalPath = path_1.default.join(UPLOADS_DIR, finalName);
                try {
                    fs_1.default.renameSync(req.file.path, finalPath);
                    imageUrl = `/uploads/group-deals/${finalName}`;
                    await mysql_1.default.execute('UPDATE group_deals SET image_url = ? WHERE id = ?', [imageUrl, dealId]);
                }
                catch (err) {
                    console.error('[group-deals] image rename failed:', err.message);
                    imageUrl = null;
                }
            }
            const [[row]] = await mysql_1.default.execute(`SELECT g.*, u.nickname AS seller_name, u.avatar_url AS seller_avatar
         FROM group_deals g LEFT JOIN users u ON u.id = g.seller_id
         WHERE g.id = ?`, [dealId]);
            res.status(201).json(toCamel(row));
        }
        catch (err) {
            if (req.file)
                fs_1.default.unlink(req.file.path, () => { });
            console.error('[group-deals] POST / error:', err);
            res.status(500).json({ error: '서버 오류가 발생했습니다' });
        }
    });
    // GET / — 목록
    r.get('/', async (req, res) => {
        const { status = 'recruiting', category, limit = '20', offset = '0', mine, } = req.query;
        try {
            const conditions = [];
            const params = [];
            if (mine) {
                if (mine.startsWith('seller:')) {
                    const sellerId = mine.slice('seller:'.length);
                    conditions.push('g.seller_id = ?');
                    params.push(Number(sellerId));
                }
                else if (mine.startsWith('buyer:')) {
                    const buyerId = mine.slice('buyer:'.length);
                    conditions.push('g.id IN (SELECT deal_id FROM group_deal_participants WHERE buyer_id = ?)');
                    params.push(Number(buyerId));
                }
            }
            else {
                conditions.push('g.status = ?');
                params.push(status);
            }
            if (category) {
                conditions.push('g.category = ?');
                params.push(category);
            }
            const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const lim = Math.max(1, parseInt(limit, 10) || 20);
            const off = Math.max(0, parseInt(offset, 10) || 0);
            const [rows] = await mysql_1.default.query(`SELECT g.*, u.nickname AS seller_name, u.avatar_url AS seller_avatar
         FROM group_deals g LEFT JOIN users u ON u.id = g.seller_id
         ${where}
         ORDER BY g.created_at DESC
         LIMIT ${lim} OFFSET ${off}`, params);
            res.json(rows.map(toCamel));
        }
        catch (err) {
            console.error('[group-deals] GET / error:', err);
            res.status(500).json({ error: 'database error' });
        }
    });
    // GET /:id — 상세
    r.get('/:id', async (req, res) => {
        const dealId = Number(req.params.id);
        const { viewerId } = req.query;
        try {
            const [[row]] = await mysql_1.default.execute(`SELECT g.*, u.nickname AS seller_name, u.avatar_url AS seller_avatar
         FROM group_deals g LEFT JOIN users u ON u.id = g.seller_id
         WHERE g.id = ?`, [dealId]);
            if (!row) {
                res.status(404).json({ error: 'deal not found' });
                return;
            }
            let isParticipant = false;
            if (viewerId) {
                const [[p]] = await mysql_1.default.execute('SELECT id FROM group_deal_participants WHERE deal_id = ? AND buyer_id = ?', [dealId, Number(viewerId)]);
                isParticipant = !!p;
            }
            res.json({ ...toCamel(row), isParticipant });
        }
        catch (err) {
            console.error('[group-deals] GET /:id error:', err);
            res.status(500).json({ error: 'database error' });
        }
    });
    // POST /:id/join — 참여
    r.post('/:id/join', async (req, res) => {
        const dealId = Number(req.params.id);
        const { buyerId, quantity = 1 } = req.body;
        if (!buyerId) {
            res.status(400).json({ error: 'buyerId 는 필수입니다.' });
            return;
        }
        try {
            const [[deal]] = await mysql_1.default.execute('SELECT id, status, closes_at, current_participants, max_participants FROM group_deals WHERE id = ?', [dealId]);
            if (!deal) {
                res.status(404).json({ error: 'deal not found' });
                return;
            }
            if (deal.status !== 'recruiting') {
                res.status(409).json({ error: '모집 중인 공동구매만 참여할 수 있습니다.' });
                return;
            }
            if (new Date(deal.closes_at) < new Date()) {
                res.status(409).json({ error: '마감된 공동구매입니다.' });
                return;
            }
            if (deal.max_participants != null && deal.current_participants >= deal.max_participants) {
                res.status(409).json({ error: '최대 참여 인원에 도달했습니다.' });
                return;
            }
            const [insertResult] = await mysql_1.default.execute('INSERT IGNORE INTO group_deal_participants (deal_id, buyer_id, quantity) VALUES (?, ?, ?)', [dealId, Number(buyerId), Number(quantity)]);
            if (insertResult.affectedRows > 0) {
                await mysql_1.default.execute('UPDATE group_deals SET current_participants = current_participants + 1 WHERE id = ?', [dealId]);
            }
            const [[updated]] = await mysql_1.default.execute('SELECT current_participants, status FROM group_deals WHERE id = ?', [dealId]);
            io.emit('group-deal:updated', {
                dealId,
                currentParticipants: updated.current_participants,
                status: updated.status,
            });
            res.json({
                joined: insertResult.affectedRows > 0,
                currentParticipants: updated.current_participants,
            });
        }
        catch (err) {
            console.error('[group-deals] POST /:id/join error:', err);
            res.status(500).json({ error: 'database error' });
        }
    });
    // DELETE /:id/join — 참여 취소
    r.delete('/:id/join', async (req, res) => {
        const dealId = Number(req.params.id);
        const { buyerId } = req.body;
        if (!buyerId) {
            res.status(400).json({ error: 'buyerId 는 필수입니다.' });
            return;
        }
        try {
            const [deleteResult] = await mysql_1.default.execute('DELETE FROM group_deal_participants WHERE deal_id = ? AND buyer_id = ?', [dealId, Number(buyerId)]);
            if (deleteResult.affectedRows > 0) {
                await mysql_1.default.execute('UPDATE group_deals SET current_participants = GREATEST(current_participants - 1, 0) WHERE id = ?', [dealId]);
            }
            const [[updated]] = await mysql_1.default.execute('SELECT current_participants, status FROM group_deals WHERE id = ?', [dealId]);
            if (!updated) {
                res.status(404).json({ error: 'deal not found' });
                return;
            }
            io.emit('group-deal:updated', {
                dealId,
                currentParticipants: updated.current_participants,
                status: updated.status,
            });
            res.json({
                cancelled: deleteResult.affectedRows > 0,
                currentParticipants: updated.current_participants,
            });
        }
        catch (err) {
            console.error('[group-deals] DELETE /:id/join error:', err);
            res.status(500).json({ error: 'database error' });
        }
    });
    // PATCH /:id/confirm — 확정
    r.patch('/:id/confirm', async (req, res) => {
        const dealId = Number(req.params.id);
        const { sellerId } = req.body;
        if (!sellerId) {
            res.status(400).json({ error: 'sellerId 는 필수입니다.' });
            return;
        }
        try {
            const [[deal]] = await mysql_1.default.execute('SELECT id, seller_id, status, current_participants, min_participants FROM group_deals WHERE id = ?', [dealId]);
            if (!deal) {
                res.status(404).json({ error: 'deal not found' });
                return;
            }
            if (String(deal.seller_id) !== String(sellerId)) {
                res.status(403).json({ error: '판매자 권한이 없습니다.' });
                return;
            }
            if (deal.status !== 'recruiting') {
                res.status(409).json({ error: '모집 중인 상태에서만 확정할 수 있습니다.' });
                return;
            }
            if (deal.current_participants < deal.min_participants) {
                res.status(409).json({ error: `최소 참여 인원(${deal.min_participants}명)에 미달합니다.` });
                return;
            }
            await mysql_1.default.execute("UPDATE group_deals SET status = 'confirmed' WHERE id = ?", [dealId]);
            io.emit('group-deal:updated', { dealId, currentParticipants: deal.current_participants, status: 'confirmed' });
            res.json({ success: true, status: 'confirmed' });
        }
        catch (err) {
            console.error('[group-deals] PATCH /:id/confirm error:', err);
            res.status(500).json({ error: 'database error' });
        }
    });
    // PATCH /:id/cancel — 취소
    r.patch('/:id/cancel', async (req, res) => {
        const dealId = Number(req.params.id);
        const { sellerId } = req.body;
        if (!sellerId) {
            res.status(400).json({ error: 'sellerId 는 필수입니다.' });
            return;
        }
        try {
            const [[deal]] = await mysql_1.default.execute('SELECT id, seller_id, status, current_participants FROM group_deals WHERE id = ?', [dealId]);
            if (!deal) {
                res.status(404).json({ error: 'deal not found' });
                return;
            }
            if (String(deal.seller_id) !== String(sellerId)) {
                res.status(403).json({ error: '판매자 권한이 없습니다.' });
                return;
            }
            if (!['recruiting', 'confirmed'].includes(deal.status)) {
                res.status(409).json({ error: '모집 중 또는 확정 상태에서만 취소할 수 있습니다.' });
                return;
            }
            await mysql_1.default.execute("UPDATE group_deals SET status = 'cancelled' WHERE id = ?", [dealId]);
            io.emit('group-deal:updated', { dealId, currentParticipants: deal.current_participants, status: 'cancelled' });
            res.json({ success: true, status: 'cancelled' });
        }
        catch (err) {
            console.error('[group-deals] PATCH /:id/cancel error:', err);
            res.status(500).json({ error: 'database error' });
        }
    });
    // PATCH /:id/ship — 발송
    r.patch('/:id/ship', async (req, res) => {
        const dealId = Number(req.params.id);
        const { sellerId } = req.body;
        if (!sellerId) {
            res.status(400).json({ error: 'sellerId 는 필수입니다.' });
            return;
        }
        try {
            const [[deal]] = await mysql_1.default.execute('SELECT id, seller_id, status, current_participants FROM group_deals WHERE id = ?', [dealId]);
            if (!deal) {
                res.status(404).json({ error: 'deal not found' });
                return;
            }
            if (String(deal.seller_id) !== String(sellerId)) {
                res.status(403).json({ error: '판매자 권한이 없습니다.' });
                return;
            }
            if (deal.status !== 'confirmed') {
                res.status(409).json({ error: '확정 상태에서만 발송할 수 있습니다.' });
                return;
            }
            await mysql_1.default.execute("UPDATE group_deals SET status = 'shipped' WHERE id = ?", [dealId]);
            io.emit('group-deal:updated', { dealId, currentParticipants: deal.current_participants, status: 'shipped' });
            res.json({ success: true, status: 'shipped' });
        }
        catch (err) {
            console.error('[group-deals] PATCH /:id/ship error:', err);
            res.status(500).json({ error: 'database error' });
        }
    });
    return r;
}
