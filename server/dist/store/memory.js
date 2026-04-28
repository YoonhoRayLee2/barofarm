"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auctions = exports.lives = void 0;
exports.createLive = createLive;
exports.endLive = endLive;
exports.createAuction = createAuction;
exports.startTimer = startTimer;
exports.stopTimer = stopTimer;
exports.lives = new Map();
exports.auctions = new Map();
const timers = new Map();
function createLive(id, { sellerId, title }) {
    const state = {
        id,
        sellerId,
        title,
        status: 'live',
        viewerCount: 0,
        currentAuctionId: null,
        createdAt: Date.now(),
    };
    exports.lives.set(id, state);
    return state;
}
function endLive(id) {
    const live = exports.lives.get(id);
    if (live) {
        live.status = 'ended';
    }
}
function createAuction(id, { liveId, productName, startPrice, sellerId }) {
    exports.auctions.set(id, {
        id,
        liveId,
        productName,
        sellerId,
        currentPrice: startPrice,
        topBidder: null,
        timeLeft: 30,
        status: 'pending',
    });
}
function startTimer(id, io, onEnd) {
    stopTimer(id); // 중복 방지
    const auction = exports.auctions.get(id);
    if (auction) {
        auction.status = 'live';
        // Live의 currentAuctionId 업데이트
        const live = exports.lives.get(auction.liveId);
        if (live)
            live.currentAuctionId = id;
    }
    const timer = setInterval(() => {
        const auc = exports.auctions.get(id);
        if (!auc || auc.status !== 'live') {
            stopTimer(id);
            return;
        }
        auc.timeLeft -= 1;
        if (auc.timeLeft <= 0) {
            auc.timeLeft = 0;
            auc.status = 'ended';
            io.to(auc.liveId).emit('auction:update', auc);
            io.to(auc.liveId).emit('auction:ended', { id, winner: auc.topBidder, winnerName: auc.topBidderName, price: auc.currentPrice });
            // Live의 currentAuctionId를 null로 초기화
            const live = exports.lives.get(auc.liveId);
            if (live)
                live.currentAuctionId = null;
            io.emit('lobby:live:updated', live ?? { id: auc.liveId });
            stopTimer(id);
            onEnd?.(auc);
            exports.auctions.delete(id);
        }
        else {
            io.to(auc.liveId).emit('auction:update', auc);
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
