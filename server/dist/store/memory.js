"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auctions = void 0;
exports.createAuction = createAuction;
exports.startTimer = startTimer;
exports.stopTimer = stopTimer;
exports.auctions = new Map();
const timers = new Map();
function createAuction(id, { productName, startPrice, sellerId }) {
    exports.auctions.set(id, {
        id,
        productName,
        sellerId,
        currentPrice: startPrice,
        topBidder: null,
        timeLeft: 30,
        status: 'live',
    });
}
function startTimer(id, io, onEnd) {
    stopTimer(id); // 중복 방지
    const timer = setInterval(() => {
        const auction = exports.auctions.get(id);
        if (!auction || auction.status !== 'live') {
            stopTimer(id);
            return;
        }
        auction.timeLeft -= 1;
        if (auction.timeLeft <= 0) {
            auction.timeLeft = 0;
            auction.status = 'ended';
            io.to(id).emit('auction:update', auction);
            io.to(id).emit('auction:ended', { id, winner: auction.topBidder, price: auction.currentPrice });
            stopTimer(id);
            onEnd?.(auction);
            exports.auctions.delete(id);
        }
        else {
            io.to(id).emit('auction:update', auction);
        }
    }, 1000);
    timers.set(id, timer);
}
function stopTimer(id) {
    const timer = timers.get(id);
    if (timer) {
        clearInterval(timer);
        timers.delete(id);
    }
}
