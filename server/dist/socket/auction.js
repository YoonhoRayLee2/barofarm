"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = registerAuctionSocket;
const memory_1 = require("../store/memory");
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
        // bid: { liveId, auctionId, price, userId, userName? }
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
                if (userId === auction.sellerId)
                    return;
                if (price <= auction.currentPrice)
                    return;
                auction.currentPrice = price;
                auction.topBidder = userId;
                if (userName)
                    auction.topBidderName = userName;
                if (auction.timeLeft <= 10)
                    auction.timeLeft += 10;
                io.to(liveId).emit('auction:update', auction);
            }
            catch (err) {
                socket.emit('error', { message: err.message });
            }
        });
        // chat: { liveId, message, userId }
        socket.on('chat', ({ liveId, message, userId }) => {
            try {
                io.to(liveId).emit('chat:message', { userId, message, ts: Date.now() });
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
