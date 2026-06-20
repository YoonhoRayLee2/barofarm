"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = registerAuctionSocket;
const memory_1 = require("../store/memory");
const livekit_service_1 = require("../services/livekit-service");
// liveId → Map<socketId, userName>
const viewerCounts = new Map();
function registerAuctionSocket(io) {
    io.on('connection', (socket) => {
        // join: { liveId, userId?, userName?, role? } — 라이브 방 입장
        socket.on('join', ({ liveId, userId, userName, role }) => {
            socket.join(liveId);
            if (!viewerCounts.has(liveId))
                viewerCounts.set(liveId, new Map());
            const room = viewerCounts.get(liveId);
            // 판매자 본인은 시청자 카운트/목록에서 제외
            // role 플래그가 명시적으로 'seller'이거나, lives 맵에서 sellerId 일치 시 제외
            const live = memory_1.lives.get(liveId);
            const isSeller = role === 'seller' || (live && userId && String(live.sellerId) === String(userId));
            if (!isSeller) {
                room.set(socket.id, userName || '시청자');
            }
            const viewers = Array.from(room.values());
            io.to(liveId).emit('viewer:count', { count: room.size });
            io.to(liveId).emit('viewer:list', { viewers });
            if (!isSeller && userName) {
                io.to(liveId).emit('viewer:join', { userName });
            }
            // 현재 진행 중인 경매 상태 즉시 전송
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
                // 본인에게만 응답
                socket.emit('bid:blind:ack', { ok: true, price, bidCount: auction.blindBids.length });
                // 룸 전체에 참여자 수 브로드캐스트 (가격 비공개)
                io.to(liveId).emit('blind:bid:count', { auctionId, count: auction.blindBids.length });
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
                io.to(liveId).emit('purchase:made', { userId, userName, soldIndex, price: auction.currentPrice, ts });
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
        // giveaway:join: { liveId, auctionId, userId, userName } — 무료나눔 참여
        socket.on('giveaway:join', ({ liveId, auctionId, userId, userName }) => {
            try {
                const live = memory_1.lives.get(liveId);
                if (!live || live.status !== 'live') {
                    socket.emit('giveaway:join:ack', { ok: false, error: 'live not found' });
                    return;
                }
                const auction = memory_1.auctions.get(auctionId);
                if (!auction || auction.liveId !== liveId) {
                    socket.emit('giveaway:join:ack', { ok: false, error: 'auction not found' });
                    return;
                }
                if (auction.mode !== 'giveaway') {
                    socket.emit('giveaway:join:ack', { ok: false, error: 'not a giveaway' });
                    return;
                }
                if (auction.status !== 'live') {
                    socket.emit('giveaway:join:ack', { ok: false, error: 'giveaway ended' });
                    return;
                }
                if (userId === auction.sellerId) {
                    socket.emit('giveaway:join:ack', { ok: false, error: 'seller cannot join' });
                    return;
                }
                if (!auction.giveawayParticipants)
                    auction.giveawayParticipants = [];
                // 중복 참여 방지
                const alreadyJoined = auction.giveawayParticipants.some(p => p.userId === userId);
                if (alreadyJoined) {
                    socket.emit('giveaway:join:ack', { ok: true, alreadyJoined: true, count: auction.giveawayParticipants.length });
                    return;
                }
                auction.giveawayParticipants.push({ userId, userName: userName || '익명' });
                const count = auction.giveawayParticipants.length;
                const participants = auction.giveawayParticipants;
                socket.emit('giveaway:join:ack', { ok: true, count });
                io.to(liveId).emit('giveaway:count', { auctionId, count, participants });
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
        // emoji:react: { liveId, emoji, userId, userName } — 이모지 반응 브로드캐스트
        socket.on('emoji:react', ({ liveId, emoji, userId, userName }) => {
            const ALLOWED = ['❤️', '🔥', '👍', '😂', '🎉', '😱'];
            if (!ALLOWED.includes(emoji))
                return;
            io.to(liveId).emit('emoji:reaction', { emoji, userId, userName });
        });
        // viewer:list:get — 현재 시청자 목록을 요청 소켓에만 전송
        socket.on('viewer:list:get', ({ liveId }) => {
            const room = viewerCounts.get(liveId);
            const viewers = room ? Array.from(room.values()) : [];
            socket.emit('viewer:list', { viewers });
        });
        socket.on('user:identify', ({ userId }) => {
            if (userId)
                socket.join(`user:${userId}`);
        });
        socket.on('disconnect', () => {
            viewerCounts.forEach((room, liveId) => {
                if (room.has(socket.id)) {
                    room.delete(socket.id);
                    const viewers = Array.from(room.values());
                    io.to(liveId).emit('viewer:count', { count: room.size });
                    io.to(liveId).emit('viewer:list', { viewers });
                    if (room.size === 0)
                        viewerCounts.delete(liveId);
                }
            });
        });
    });
}
