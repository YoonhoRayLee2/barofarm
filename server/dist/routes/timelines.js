"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mysql_1 = __importDefault(require("../db/mysql"));
const UPLOADS_DIR = path_1.default.join(__dirname, '..', '..', 'public', 'uploads', 'timelines');
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
const VALID_STAGES = ['harvest', 'packing', 'departed', 'arrived'];
const router = (0, express_1.Router)();
// POST /api/timelines
router.post('/', upload.single('photo'), async (req, res) => {
    const { auction_id, stage, farmer_note, userId } = req.body;
    const tmpFile = req.file;
    const cleanup = () => {
        if (tmpFile)
            fs_1.default.unlink(tmpFile.path, () => { });
    };
    if (!VALID_STAGES.includes(stage)) {
        cleanup();
        return res.status(400).json({ error: 'stage 값이 올바르지 않습니다.' });
    }
    if (!auction_id) {
        cleanup();
        return res.status(400).json({ error: 'auction_id가 필요합니다.' });
    }
    try {
        const [rows] = await mysql_1.default.execute('SELECT seller_id FROM auctions WHERE id = ?', [auction_id]);
        if (!rows.length) {
            cleanup();
            return res.status(404).json({ error: '경매를 찾을 수 없습니다.' });
        }
        const { seller_id } = rows[0];
        if (String(userId) !== String(seller_id)) {
            cleanup();
            return res.status(403).json({ error: '판매자만 업로드할 수 있습니다.' });
        }
        if (!tmpFile && !farmer_note) {
            cleanup();
            return res.status(400).json({ error: '사진 또는 한마디가 필요합니다.' });
        }
        let photo_url = null;
        if (tmpFile) {
            const filename = `${auction_id}_${stage}_${Date.now()}.jpg`;
            const dest = path_1.default.join(UPLOADS_DIR, filename);
            fs_1.default.renameSync(tmpFile.path, dest);
            photo_url = `/uploads/timelines/${filename}`;
        }
        const [result] = await mysql_1.default.execute('INSERT INTO delivery_timeline (auction_id, stage, photo_url, farmer_note) VALUES (?, ?, ?, ?)', [auction_id, stage, photo_url, farmer_note ?? null]);
        const insertId = result.insertId;
        const [newRows] = await mysql_1.default.execute('SELECT id, stage, photo_url, farmer_note, created_at FROM delivery_timeline WHERE id = ?', [insertId]);
        const row = newRows[0];
        return res.status(201).json({
            id: row.id,
            stage: row.stage,
            photoUrl: row.photo_url,
            farmerNote: row.farmer_note,
            createdAt: row.created_at,
        });
    }
    catch (err) {
        cleanup();
        console.error('[timelines] POST error:', err);
        return res.status(500).json({ error: '서버 오류' });
    }
});
// GET /api/timelines/:auctionId
router.get('/:auctionId', async (req, res) => {
    const { auctionId } = req.params;
    const { userId } = req.query;
    try {
        const [rows] = await mysql_1.default.execute('SELECT seller_id, top_bidder_id FROM auctions WHERE id = ?', [auctionId]);
        if (!rows.length) {
            return res.status(404).json({ error: '경매를 찾을 수 없습니다.' });
        }
        const { seller_id, top_bidder_id } = rows[0];
        const uid = String(userId ?? '');
        if (uid !== String(seller_id) && uid !== String(top_bidder_id)) {
            return res.status(403).json({ error: '조회 권한이 없습니다.' });
        }
        const [items] = await mysql_1.default.execute('SELECT id, stage, photo_url, farmer_note, created_at FROM delivery_timeline WHERE auction_id = ? ORDER BY created_at ASC', [auctionId]);
        return res.json({
            items: items.map(r => ({
                id: r.id,
                stage: r.stage,
                photoUrl: r.photo_url,
                farmerNote: r.farmer_note,
                createdAt: r.created_at,
            })),
        });
    }
    catch (err) {
        console.error('[timelines] GET error:', err);
        return res.status(500).json({ error: '서버 오류' });
    }
});
exports.default = router;
