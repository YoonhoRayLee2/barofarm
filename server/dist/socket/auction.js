"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = registerAuctionSocket;
const memory_1 = require("../store/memory");
const livekit_service_1 = require("../services/livekit-service");
const viewerCounts = new Map();
function registerAuctionSocket(io) {
    io.on('connection', (socket) => {
        // join: { liveId } — 라이브 방 입장
        socket.on('join', ({ liveId }) => {
            socket.join(liveId);
            if (!viewerCounts.has(liveId))
                viewerCounts.set(liveId, new Set());
            viewerCounts.get(liveId).add(socket.id);
            io.to(liveId).emit('viewer:count', { count: viewerCounts.get(liveId).size });
            // 현재 진행 중인 경매 상태 즉시 전송
            const live = memory_1.lives.get(liveId);
            if (live?.currentAuctionId) {
                const auction = memory_1.auctions.get(live.currentAuctionId);
                if (auction)
                    socket.emit('auction:update', auction);
            }
        });
        // bid: { liveId, auctionId, price, userId, userName? } — 일반경매 입찰
        socket.on('bid', ({ liveId, auctionId, price, userId, userName }) => {
            try {
                const live = memory_1.lives.get(liveId);
                if (!live || live.status !== 'live')
                    return;
                const auction = memory_1.auctions.get(auctionId);
                if (!auction || auction.liveId !== liveId)
                    return;
                if (auction.status !== 'live')
                    return;
                if (auction.mode !== 'normal')
                    return;
                if (userId === auction.sellerId)
                    return;
                if (price <= auction.currentPrice)
                    return;
                auction.currentPrice = price;
                auction.topBidder = userId;
                if (userName)
                    auction.topBidderName = userName;
                // 10초 연장: 잔여 시간이 10초 이하이면 +10초
                if (auction.timeLeft <= 10)
                    auction.timeLeft += 10;
                io.to(liveId).emit('auction:update', auction);
            }
            catch (err) {
                socket.emit('error', { message: err.message });
            }
        });
        // bid:blind: { liveId, auctionId, userId, userName?, price } — 블라인드 경매 비공개 입찰
        socket.on('bid:blind', ({ liveId, auctionId, userId, userName, price }) => {
            try {
                const live = memory_1.lives.get(liveId);
                if (!live || live.status !== 'live') {
                    socket.emit('bid:blind:ack', { ok: false, error: 'live not found' });
                    return;
                }
                const auction = memory_1.auctions.get(auctionId);
                if (!auction || auction.liveId !== liveId) {
                    socket.emit('bid:blind:ack', { ok: false, error: 'auction not found' });
                    return;
                }
                if (auction.mode !== 'blind') {
                    socket.emit('bid:blind:ack', { ok: false, error: 'not a blind auction' });
                    return;
                }
                if (auction.status !== 'live') {
                    socket.emit('bid:blind:ack', { ok: false, error: 'auction not live' });
                    return;
                }
                if (userId === auction.sellerId) {
                    socket.emit('bid:blind:ack', { ok: false, error: 'seller cannot bid' });
                    return;
                }
                if (!price || price <= 0) {
                    socket.emit('bid:blind:ack', { ok: false, error: 'invalid price' });
                    return;
                }
                if (!auction.blindBids)
                    auction.blindBids = [];
                // 동일 userId 기존 입찰 제거 후 push (마지막 제출만 유효)
                auction.blindBids = auction.blindBids.filter(b => b.userId !== userId);
                auction.blindBids.push({ userId, userName, price, ts: Date.now() });
                // 본인에게만 응답 — 다른 사용자에게 emit 금지
                socket.emit('bid:blind:ack', { ok: true });
            }
            catch (err) {
                socket.emit('error', { message: err.message });
            }
        });
        // purchase: { liveId, auctionId, userId, userName? } — 선착순 구매
        socket.on('purchase', ({ liveId, auctionId, userId, userName }) => {
            try {
                const live = memory_1.lives.get(liveId);
                if (!live || live.status !== 'live') {
                    socket.emit('error', { message: 'live not found' });
                    return;
                }
                const auction = memory_1.auctions.get(auctionId);
                if (!auction || auction.liveId !== liveId) {
                    socket.emit('error', { message: 'auction not found' });
                    return;
                }
                if (auction.mode !== 'fcfs') {
                    socket.emit('error', { message: 'not a fcfs auction' });
                    return;
                }
                if (auction.status !== 'live') {
                    socket.emit('error', { message: 'auction not live' });
                    return;
                }
                if ((auction.stockSold ?? 0) >= (auction.stockTotal ?? 0)) {
                    socket.emit('error', { message: '매진되었습니다.' });
                    return;
                }
                auction.stockSold = (auction.stockSold ?? 0) + 1;
                const soldIndex = auction.stockSold;
                // 구매자를 topBidder로 갱신 (대표 낙찰자)
                auction.topBidder = userId;
                if (userName)
                    auction.topBidderName = userName;
                const ts = Date.now();
                io.to(liveId).emit('purchase:made', { userId, userName, soldIndex, ts });
                // 매진 시 즉시 종료
                if (auction.stockSold >= (auction.stockTotal ?? 0)) {
                    (0, memory_1.endFcfsAuction)(auctionId, io, async (state) => {
                        await (0, livekit_service_1.endAuction)(state);
                    });
                }
            }
            catch (err) {
                socket.emit('error', { message: err.message });
            }
        });
        // chat: { liveId, message, userId, userName? }
        socket.on('chat', ({ liveId, message, userId, userName }) => {
            try {
                io.to(liveId).emit('chat:message', { userId, userName, message, ts: Date.now() });
            }
            catch (err) {
                socket.emit('error', { message: err.message });
            }
        });
        socket.on('disconnect', () => {
            viewerCounts.forEach((sockets, liveId) => {
                if (sockets.has(socket.id)) {
                    sockets.delete(socket.id);
                    io.to(liveId).emit('viewer:count', { count: sockets.size });
                    if (sockets.size === 0)
                        viewerCounts.delete(liveId);
                }
            });
        });
    });
}
