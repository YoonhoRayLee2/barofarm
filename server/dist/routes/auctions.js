"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mysql_1 = __importDefault(require("../db/mysql"));
const router = (0, express_1.Router)();
const AUCTION_QUERY = `
  SELECT
    a.id, a.product_name, a.start_price, a.current_price, a.mode,
    a.delivery_status, a.status, a.image_url, a.ends_at,
    a.seller_id, s.nickname AS seller_name, s.farm_zipcode AS seller_farm_zipcode,
    a.top_bidder_id, b.nickname AS buyer_name,
    b.delivery_name, b.delivery_phone, b.delivery_address, b.delivery_detail, b.delivery_zipcode,
    b.delivery_option, b.hanaro_mart_name, b.hanaro_mart_addr,
    a.tracking_company, a.tracking_number,
    a.buyer_tier, a.buyer_discount_rate, a.buyer_discount_amt, a.seller_fee_rate, a.seller_fee_amt,
    a.shipping_fee, a.shipping_fee_status
  FROM auctions a
  LEFT JOIN users s ON s.id = a.seller_id
  LEFT JOIN users b ON b.id = a.top_bidder_id
  WHERE a.id = ?
`;
function formatAuction(row) {
    return {
        auctionId: row.id,
        productName: row.product_name,
        startPrice: Number(row.start_price),
        finalPrice: Number(row.current_price),
        mode: row.mode,
        deliveryStatus: row.delivery_status,
        status: row.status,
        imageUrl: row.image_url ?? null,
        endsAt: row.ends_at,
        sellerId: row.seller_id,
        sellerName: row.seller_name ?? null,
        sellerFarmZipcode: row.seller_farm_zipcode ?? null,
        buyerId: row.top_bidder_id ?? null,
        buyerName: row.buyer_name ?? null,
        trackingCompany: row.tracking_company ?? null,
        trackingNumber: row.tracking_number ?? null,
        buyerDelivery: row.top_bidder_id ? {
            name: row.delivery_name ?? null,
            phone: row.delivery_phone ?? null,
            address: row.delivery_address ?? null,
            detail: row.delivery_detail ?? null,
            zipcode: row.delivery_zipcode ?? null,
            option: row.delivery_option ?? 'standard',
            hanaroMartName: row.hanaro_mart_name ?? null,
            hanaroMartAddr: row.hanaro_mart_addr ?? null,
        } : null,
        buyerTier: row.buyer_tier,
        buyerDiscountRate: Number(row.buyer_discount_rate),
        buyerDiscountAmt: Number(row.buyer_discount_amt),
        sellerFeeRate: Number(row.seller_fee_rate),
        sellerFeeAmt: Number(row.seller_fee_amt),
        shippingFee: Number(row.shipping_fee ?? 0),
        shippingFeeStatus: row.shipping_fee_status ?? 'none',
    };
}
// POST /api/auctions/batch-ship — 합배송 처리 (판매자: 구매자별 payment_complete 주문 일괄 shipping_fee_pending 전환)
router.post('/batch-ship', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: '인증이 필요합니다' });
        return;
    }
    let sellerId;
    try {
        const token = authHeader.slice(7);
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        sellerId = decoded.userId;
    }
    catch {
        res.status(401).json({ error: '인증이 필요합니다' });
        return;
    }
    const { buyerId, auctionIds } = req.body;
    if (!buyerId || !Array.isArray(auctionIds) || auctionIds.length === 0) {
        res.status(400).json({ error: 'buyerId, auctionIds required' });
        return;
    }
    try {
        const placeholders = auctionIds.map(() => '?').join(',');
        const [rows] = await mysql_1.default.execute(`SELECT id, seller_id, top_bidder_id, delivery_status, shipping_fee_status FROM auctions WHERE id IN (${placeholders})`, auctionIds);
        const list = rows;
        for (const a of list) {
            if (String(a.seller_id) !== String(sellerId)) {
                res.status(403).json({ error: `auction ${a.id} does not belong to seller` });
                return;
            }
            if (String(a.top_bidder_id) !== String(buyerId)) {
                res.status(400).json({ error: `auction ${a.id} buyer mismatch` });
                return;
            }
            if (a.delivery_status !== 'payment_complete' || a.shipping_fee_status !== 'none') {
                res.status(400).json({ error: `auction ${a.id} is not eligible for batch-ship (must be payment_complete with no shipping fee)` });
                return;
            }
        }
        const [userRows] = await mysql_1.default.execute('SELECT seller_shipping_fee FROM users WHERE id = ?', [sellerId]);
        const shippingFee = userRows[0]?.seller_shipping_fee ?? 3000;
        await mysql_1.default.execute(`UPDATE auctions SET shipping_fee_status='pending', shipping_fee=? WHERE id IN (${placeholders})`, [shippingFee, ...auctionIds]);
        res.json({ ok: true, shippingFee, count: auctionIds.length });
    }
    catch (err) {
        console.error('[auctions] POST /batch-ship error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// PATCH /api/auctions/:id/pay-shipping-fee — 구매자 배송비 결제
router.patch('/:id/pay-shipping-fee', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;
    if (!userId) {
        res.status(400).json({ error: 'userId required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute(AUCTION_QUERY, [id]);
        const row = rows[0];
        if (!row) {
            res.status(404).json({ error: 'auction not found' });
            return;
        }
        if (String(row.top_bidder_id) !== String(userId)) {
            res.status(403).json({ error: '구매자만 배송비를 결제할 수 있습니다' });
            return;
        }
        if (row.shipping_fee_status !== 'pending') {
            res.status(400).json({ error: `shipping_fee_status is not pending (current: ${row.shipping_fee_status})` });
            return;
        }
        await mysql_1.default.execute('UPDATE auctions SET shipping_fee_status = ? WHERE id = ?', ['paid', id]);
        const [updated] = await mysql_1.default.execute(AUCTION_QUERY, [id]);
        res.json(formatAuction(updated[0]));
    }
    catch (err) {
        console.error('[auctions] PATCH /:id/pay-shipping-fee error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// GET /api/auctions/:id
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await mysql_1.default.execute(AUCTION_QUERY, [id]);
        const row = rows[0];
        if (!row) {
            res.status(404).json({ error: 'auction not found' });
            return;
        }
        res.json(formatAuction(row));
    }
    catch (err) {
        console.error('[auctions] GET /:id error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
// PATCH /api/auctions/:id/delivery-status
router.patch('/:id/delivery-status', async (req, res) => {
    const { id } = req.params;
    const { status, userId, trackingCompany, trackingNumber } = req.body;
    if (!status || !userId) {
        res.status(400).json({ error: 'status and userId are required' });
        return;
    }
    try {
        const [rows] = await mysql_1.default.execute(AUCTION_QUERY, [id]);
        const row = rows[0];
        if (!row) {
            res.status(404).json({ error: 'auction not found' });
            return;
        }
        const current = row.delivery_status;
        const next = status;
        // 전환 규칙 검증
        const allowed = (current === 'payment_complete' && next === 'shipped' && String(userId) === String(row.seller_id)) ||
            (current === 'shipped' && next === 'purchase_confirmed' && String(userId) === String(row.top_bidder_id)) ||
            (current === 'purchase_confirmed' && next === 'settlement_complete' && String(userId) === String(row.seller_id));
        if (!allowed) {
            res.status(400).json({ error: '상태 전환이 불가합니다' });
            return;
        }
        // payment_complete → shipped 전환 시 배송비 결제 및 운송장 필수 검증
        if (next === 'shipped') {
            if (row.shipping_fee > 0 && row.shipping_fee_status !== 'paid') {
                res.status(400).json({ error: '배송비 결제가 완료되지 않았습니다' });
                return;
            }
            if (!trackingCompany || !trackingCompany.trim()) {
                res.status(400).json({ error: '택배사를 선택해주세요' });
                return;
            }
            if (!trackingNumber || !trackingNumber.trim()) {
                res.status(400).json({ error: '운송장 번호를 입력해주세요' });
                return;
            }
            await mysql_1.default.execute('UPDATE auctions SET delivery_status = ?, tracking_company = ?, tracking_number = ? WHERE id = ?', [next, trackingCompany.trim(), trackingNumber.trim(), id]);
        }
        else {
            await mysql_1.default.execute('UPDATE auctions SET delivery_status = ? WHERE id = ?', [next, id]);
        }
        // 업데이트 후 최신 row 재조회
        const [updated] = await mysql_1.default.execute(AUCTION_QUERY, [id]);
        res.json(formatAuction(updated[0]));
    }
    catch (err) {
        console.error('[auctions] PATCH /:id/delivery-status error:', err);
        res.status(500).json({ error: 'database error' });
    }
});
exports.default = router;
