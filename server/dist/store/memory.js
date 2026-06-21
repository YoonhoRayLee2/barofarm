"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.endedBlindBids = exports.auctions = exports.lives = void 0;
exports.createLive = createLive;
exports.endLive = endLive;
exports.createAuction = createAuction;
exports.startTimer = startTimer;
exports.stopTimer = stopTimer;
exports.endFcfsAuction = endFcfsAuction;
exports.lives = new Map();
exports.auctions = new Map();
const timers = new Map();
// 블라인드 경매 종료 후 blindBids를 30분간 보관하는 Map
exports.endedBlindBids = new Map();
function createLive(id, { sellerId, sellerName, title, thumbnailUrl, category, scheduledAt }) {
    const state = {
        id,
        sellerId,
        sellerName,
        title,
        thumbnailUrl,
        category,
        status: scheduledAt ? 'upcoming' : 'live',
        scheduledAt,
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
function createAuction(id, { liveId, productName, startPrice, sellerId, mode = 'normal', durationSec = 30, stockTotal, imageUrl }) {
    const state = {
        id,
        liveId,
        productName,
        sellerId,
        startPrice,
        currentPrice: startPrice,
        topBidder: null,
        timeLeft: durationSec,
        status: 'pending',
        mode,
        durationSec,
        imageUrl,
    };
    if (mode === 'fcfs') {
        state.stockTotal = stockTotal ?? 1;
        state.stockSold = 0;
    }
    if (mode === 'blind') {
        state.blindBids = [];
    }
    if (mode === 'giveaway') {
        state.giveawayParticipants = [];
        state.currentPrice = 0;
    }
    exports.auctions.set(id, state);
}
function endAuctionState(auc, io, onEnd) {
    auc.timeLeft = 0;
    auc.status = 'ended';
    if (auc.mode === 'blind' && auc.blindBids && auc.blindBids.length > 0) {
        // 정렬: price DESC, ts ASC
        const sorted = [...auc.blindBids].sort((a, b) => b.price !== a.price ? b.price - a.price : a.ts - b.ts);
        const winner = sorted[0];
        auc.topBidder = winner.userId;
        auc.topBidderName = winner.userName;
        auc.currentPrice = winner.price;
        auc.revealAt = Date.now();
        // blindBids를 endedBlindBids에 보관 (TTL 30분)
        exports.endedBlindBids.set(auc.id, sorted);
        setTimeout(() => exports.endedBlindBids.delete(auc.id), 30 * 60 * 1000);
    }
    if (auc.mode === 'giveaway' && auc.giveawayParticipants && auc.giveawayParticipants.length > 0) {
        const idx = Math.floor(Math.random() * auc.giveawayParticipants.length);
        const winner = auc.giveawayParticipants[idx];
        auc.topBidder = winner.userId;
        auc.topBidderName = winner.userName;
        auc.currentPrice = 0;
    }
    const live = exports.lives.get(auc.liveId);
    if (live)
        live.currentAuctionId = null;
    io.to(auc.liveId).emit('auction:update', auc);
    const isVoid = !auc.topBidder; // 입찰/구매자가 없으면 유찰
    io.to(auc.liveId).emit('auction:ended', {
        id: auc.id,
        liveId: auc.liveId,
        productName: auc.productName,
        winner: auc.topBidder,
        winnerName: auc.topBidderName,
        price: auc.currentPrice,
        currentPrice: auc.currentPrice,
        finalPrice: auc.currentPrice,
        mode: auc.mode,
        void: isVoid,
        endedAt: Date.now(),
        imageUrl: auc.imageUrl ?? null,
        participants: auc.mode === 'giveaway' ? (auc.giveawayParticipants ?? []) : undefined,
    });
    stopTimer(auc.id);
    onEnd?.(auc);
    // 블라인드는 endedBlindBids에 복사 후 삭제
    exports.auctions.delete(auc.id);
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
            endAuctionState(auc, io, onEnd);
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
/**
 * 선착순(fcfs) 경매를 즉시 종료한다.
 * endAuctionState를 호출하고 onEnd 콜백을 트리거한다.
 */
function endFcfsAuction(id, io, onEnd) {
    const auc = exports.auctions.get(id);
    if (!auc || auc.mode !== 'fcfs' || auc.status !== 'live')
        return false;
    stopTimer(id);
    endAuctionState(auc, io, onEnd);
    return true;
}
