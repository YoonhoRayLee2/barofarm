"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = registerAuctionSocket;
const memory_1 = require("../store/memory");
function registerAuctionSocket(io) {
    io.on('connection', (socket) => {
        socket.on('join', ({ roomId }) => {
            socket.join(roomId);
            const auction = memory_1.auctions.get(roomId);
            if (auction)
                socket.emit('auction:update', auction);
        });
        socket.on('bid', ({ roomId, price, userId }) => {
            const auction = memory_1.auctions.get(roomId);
            if (!auction || auction.status !== 'live')
                return;
            if (price <= auction.currentPrice)
                return;
            auction.currentPrice = price;
            auction.topBidder = userId;
            // 종료 10초 이내 입찰 시 +10초 자동 연장 (와이스 방식)
            if (auction.timeLeft <= 10)
                auction.timeLeft += 10;
            io.to(roomId).emit('auction:update', auction);
        });
        socket.on('chat', ({ roomId, message, userId }) => {
            io.to(roomId).emit('chat:message', { userId, message, ts: Date.now() });
        });
    });
}
