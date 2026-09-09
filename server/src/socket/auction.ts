import { Server } from 'socket.io';
import crypto from 'crypto';
import { lives, auctions, endFcfsAuction } from '../store/memory';
import { endAuction } from '../services/livekit-service';
import { getBuyerTier, getSellerTier, calcBuyerDiscount, calcSellerFee } from '../services/tier';
import { createNotification } from '../services/notifications';
import pool from '../db/mysql';

// liveId → Map<socketId, { userName: string; avatarUrl: string | null }>
const viewerCounts = new Map<string, Map<string, { userName: string; avatarUrl: string | null }>>();

// socket.data.userId → is_admin 여부. admin 전용 이벤트마다 DB 조회를 피하기 위한 짧은 캐시.
const adminCheckCache = new Map<number, { isAdmin: boolean; expiresAt: number }>();
const ADMIN_CACHE_TTL_MS = 60 * 1000;

// handshake JWT로 인증된 socket.data.userId가 실제 관리자인지 DB로 확인한다.
// payload는 신뢰하지 않고(사칭 방지) socket.data.userId만 사용한다.
async function verifyIsAdmin(userId: number | undefined): Promise<boolean> {
  if (!userId) return false;
  const cached = adminCheckCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.isAdmin;
  try {
    const [rows] = await pool.query<any[]>('SELECT is_admin FROM users WHERE id = ? LIMIT 1', [userId]);
    const isAdmin = !!rows[0]?.is_admin;
    adminCheckCache.set(userId, { isAdmin, expiresAt: Date.now() + ADMIN_CACHE_TTL_MS });
    return isAdmin;
  } catch (err) {
    console.error('[auction] verifyIsAdmin 조회 실패:', (err as Error).message);
    return false;
  }
}

// liveId → admin 소켓 id 집합. admin:live:subscribe로 join한 소켓은 viewer 카운트/목록에서 항상 제외한다.
const adminSockets = new Map<string, Set<string>>();

// FCFS(선착순) 경매: 구매 시점마다 개별 주문(auctions row + bids row)을 즉시 영속화한다.
// 하나의 auction id에 여러 구매자가 존재할 수 있으므로 매 구매마다 새 UUID를 발급해 별도 row로 저장한다.
async function persistFcfsPurchase(
  auction: import('../store/memory').AuctionState,
  buyerId: string,
): Promise<void> {
  const buyerIdNum = Number(buyerId);
  const [buyerTier, sellerTier] = await Promise.all([
    getBuyerTier(buyerIdNum),
    getSellerTier(Number(auction.sellerId)),
  ]);
  const unitPrice = auction.currentPrice;
  const totalPrice = unitPrice * (auction.unitCount || 1);
  const { discountAmt, buyerDiscountRate } = calcBuyerDiscount(totalPrice, buyerTier);
  const { feeAmt, sellerFeeRate }          = calcSellerFee(totalPrice, sellerTier);
  const orderId = crypto.randomUUID();

  await pool.execute(
    `INSERT INTO auctions
       (id, seller_id, live_id, product_name, start_price, current_price, mode, image_url, status, delivery_status, top_bidder_id, ends_at,
        buyer_tier, buyer_discount_rate, buyer_discount_amt, seller_fee_rate, seller_fee_amt, unit_count, unit_label)
     VALUES (?, ?, ?, ?, ?, ?, 'fcfs', ?, 'ended', 'payment_complete', ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId, Number(auction.sellerId), auction.liveId, auction.productName,
      auction.startPrice, totalPrice, auction.imageUrl ?? null, buyerIdNum,
      buyerTier, buyerDiscountRate, discountAmt, sellerFeeRate, feeAmt,
      auction.unitCount, auction.unitLabel,
    ],
  );
  await pool.execute(
    'INSERT IGNORE INTO bids (auction_id, bidder_id, price) VALUES (?, ?, ?)',
    [orderId, buyerIdNum, auction.currentPrice],
  );

  try {
    await createNotification(buyerIdNum, {
      type: 'auction_won',
      title: '구매가 완료되었어요',
      body: `${auction.productName} 상품을 ${auction.currentPrice.toLocaleString()}원에 구매했습니다.`,
      link: `/app/order-detail/${orderId}`,
    });
  } catch (notifErr) {
    console.error('[auction] FCFS purchase notification failed:', notifErr);
  }
}

export default function registerAuctionSocket(io: Server): void {
  io.on('connection', (socket) => {

    // join: { liveId, userId?, userName?, role? } — 라이브 방 입장
    socket.on('join', ({ liveId, userId, userName, avatarUrl, role }: { liveId: string; userId?: string; userName?: string; avatarUrl?: string; role?: string }) => {
      socket.join(liveId);
      if (!viewerCounts.has(liveId)) viewerCounts.set(liveId, new Map());
      const room = viewerCounts.get(liveId)!;

      // 판매자 본인은 시청자 카운트/목록에서 제외
      // role 플래그가 명시적으로 'seller'이거나, lives 맵에서 sellerId 일치 시 제외
      const live = lives.get(liveId);
      const isSeller = role === 'seller' || (live && userId && String(live.sellerId) === String(userId));
      if (!isSeller) {
        room.set(socket.id, { userName: userName || '시청자', avatarUrl: avatarUrl || null });
      }

      const viewers = Array.from(room.values());
      io.to(liveId).emit('viewer:count', { count: room.size });
      io.to(liveId).emit('viewer:list', { viewers });
      if (!isSeller && userName) {
        io.to(liveId).emit('viewer:join', { userName });
      }

      // 현재 진행 중인 경매 상태 즉시 전송
      if (live?.currentAuctionId) {
        const auction = auctions.get(live.currentAuctionId);
        if (auction) socket.emit('auction:update', auction);
      }
    });

    // bid: { liveId, auctionId, price, userId, userName? } — 일반경매 입찰
    socket.on('bid', ({ liveId, auctionId, price, userId, userName }: {
      liveId: string;
      auctionId: string;
      price: number;
      userId: string;
      userName?: string;
    }) => {
      try {
        const live = lives.get(liveId);
        if (!live || live.status !== 'live') return;

        const auction = auctions.get(auctionId);
        if (!auction || auction.liveId !== liveId) return;
        if (auction.status !== 'live') return;
        if (auction.mode !== 'normal') return;
        if (userId === auction.sellerId) return;
        if (price <= auction.currentPrice) return;

        auction.currentPrice = price;
        auction.topBidder = userId;
        if (userName) auction.topBidderName = userName;
        // 10초 연장: 잔여 시간이 10초 이하이면 +10초
        if (auction.timeLeft <= 10) auction.timeLeft += 10;

        // 입찰 이력 기록 — 경매 종료 시 낙찰자/패찰자 구분(개인화 추천용)
        if (!auction.bidHistory) auction.bidHistory = [];
        auction.bidHistory.push({ userId, userName, price, ts: Date.now() });

        io.to(liveId).emit('auction:update', auction);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // bid:blind: { liveId, auctionId, userId, userName?, price } — 블라인드 경매 비공개 입찰
    socket.on('bid:blind', ({ liveId, auctionId, userId, userName, price }: {
      liveId: string;
      auctionId: string;
      userId: string;
      userName?: string;
      price: number;
    }) => {
      try {
        const live = lives.get(liveId);
        if (!live || live.status !== 'live') {
          socket.emit('bid:blind:ack', { ok: false, error: 'live not found' });
          return;
        }

        const auction = auctions.get(auctionId);
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

        if (!auction.blindBids) auction.blindBids = [];

        // 동일 userId 기존 입찰 제거 후 push (마지막 제출만 유효)
        auction.blindBids = auction.blindBids.filter(b => b.userId !== userId);
        auction.blindBids.push({ userId, userName, price, ts: Date.now() });

        // 본인에게만 응답
        socket.emit('bid:blind:ack', { ok: true, price, bidCount: auction.blindBids.length });
        // 룸 전체에 참여자 수 브로드캐스트 (가격 비공개)
        io.to(liveId).emit('blind:bid:count', { auctionId, count: auction.blindBids.length });
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // purchase: { liveId, auctionId, userId, userName? } — 선착순 구매
    socket.on('purchase', ({ liveId, auctionId, userId, userName }: {
      liveId: string;
      auctionId: string;
      userId: string;
      userName?: string;
    }) => {
      try {
        const live = lives.get(liveId);
        if (!live || live.status !== 'live') {
          socket.emit('error', { message: 'live not found' });
          return;
        }

        const auction = auctions.get(auctionId);
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

        // 재고 차감은 동기적으로 즉시 수행 — await 이전에 처리해 동시 purchase 이벤트 간 경쟁을 차단한다.
        auction.stockSold = (auction.stockSold ?? 0) + 1;
        const soldIndex = auction.stockSold;

        // 구매자를 topBidder로 갱신 (대표/최종 낙찰자 표시용 — 실제 주문은 개별 저장됨)
        auction.topBidder = userId;
        if (userName) auction.topBidderName = userName;
        // fcfs는 구매자가 여럿일 수 있으므로 전원을 기록해 경매종료 추천 emit 시 전원을 낙찰자로 처리한다.
        if (!auction.fcfsBuyers) auction.fcfsBuyers = [];
        auction.fcfsBuyers.push(userId);

        const ts = Date.now();
        io.to(liveId).emit('purchase:made', { userId, userName, soldIndex, price: auction.currentPrice, ts });

        // FCFS는 다수 구매자가 존재할 수 있으므로, 구매 시점마다 개별 주문을 즉시 DB에 영속화한다.
        // (종료 시점까지 미루면 endAuction이 topBidder 1명만 저장해 나머지 구매자의 주문이 유실된다.)
        void persistFcfsPurchase(auction, userId).catch((err) => {
          console.error(`[auction] FCFS 개별 주문 저장 실패 (auction=${auctionId}, buyer=${userId}):`, (err as Error).message);
          socket.emit('error', { message: '주문 저장 중 오류가 발생했습니다. 고객센터에 문의해주세요.' });
        });

        // 매진 시 즉시 종료
        if (auction.stockSold >= (auction.stockTotal ?? 0)) {
          endFcfsAuction(auctionId, io, async (state) => {
            await endAuction(state);
          });
        }
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // giveaway:join: { liveId, auctionId, userId, userName } — 무료나눔 참여
    socket.on('giveaway:join', ({ liveId, auctionId, userId, userName }: {
      liveId: string;
      auctionId: string;
      userId: string;
      userName?: string;
    }) => {
      try {
        const live = lives.get(liveId);
        if (!live || live.status !== 'live') {
          socket.emit('giveaway:join:ack', { ok: false, error: 'live not found' });
          return;
        }
        const auction = auctions.get(auctionId);
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

        if (!auction.giveawayParticipants) auction.giveawayParticipants = [];
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
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // chat: { liveId, message, userId, userName? }
    socket.on('chat', ({ liveId, message, userId, userName }: { liveId: string; message: string; userId: string; userName?: string }) => {
      try {
        io.to(liveId).emit('chat:message', { userId, userName, message, ts: Date.now() });
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // emoji:react: { liveId, emoji, userId, userName } — 이모지 반응 브로드캐스트
    socket.on('emoji:react', ({ liveId, emoji, userId, userName }: {
      liveId: string; emoji: string; userId: string; userName: string;
    }) => {
      const ALLOWED = ['❤️', '🔥', '👍', '😂', '🎉', '😱'];
      if (!ALLOWED.includes(emoji)) return;
      io.to(liveId).emit('emoji:reaction', { emoji, userId, userName });
    });

    // viewer:list:get — 현재 시청자 목록을 요청 소켓에만 전송
    socket.on('viewer:list:get', ({ liveId }: { liveId: string }) => {
      const room = viewerCounts.get(liveId);
      const viewers = room ? Array.from(room.values()) : [];
      socket.emit('viewer:list', { viewers });
    });

    // payload의 userId는 신뢰하지 않는다(사칭 방지) — handshake JWT로 인증된 socket.data.userId만 사용.
    socket.on('user:identify', () => {
      const authedUserId = socket.data.userId;
      if (authedUserId) socket.join(`user:${authedUserId}`);
    });

    // admin:live:subscribe: { liveId } — 관리자 전용 관제 구독. viewer 카운트/목록에 영향 없음.
    socket.on('admin:live:subscribe', async ({ liveId }: { liveId: string }) => {
      if (!liveId) return;
      const isAdmin = await verifyIsAdmin(socket.data.userId);
      if (!isAdmin) return; // 비admin은 조용히 무시
      socket.join(liveId);
      if (!adminSockets.has(liveId)) adminSockets.set(liveId, new Set());
      adminSockets.get(liveId)!.add(socket.id);

      // 현재 상태 즉시 전송 (viewer count, 진행중 경매)
      const room = viewerCounts.get(liveId);
      socket.emit('viewer:count', { count: room ? room.size : 0 });
      const live = lives.get(liveId);
      if (live?.currentAuctionId) {
        const auction = auctions.get(live.currentAuctionId);
        if (auction) socket.emit('auction:update', auction);
      }
    });

    // admin:live:unsubscribe: { liveId } — 관제 구독 해제
    socket.on('admin:live:unsubscribe', ({ liveId }: { liveId: string }) => {
      if (!liveId) return;
      socket.leave(liveId);
      adminSockets.get(liveId)?.delete(socket.id);
    });

    // admin:chat:delete: { liveId, ts } — 관리자 채팅 삭제(모더레이션). 라이브 채팅은 비영속이므로 ts 기반 식별.
    socket.on('admin:chat:delete', async ({ liveId, ts }: { liveId: string; ts: number }) => {
      if (!liveId || !ts) return;
      const isAdmin = await verifyIsAdmin(socket.data.userId);
      if (!isAdmin) return;
      io.to(liveId).emit('chat:deleted', { ts });
    });

    // admin:live:kick: { liveId, userId } — 관리자가 특정 사용자를 라이브에서 강퇴
    socket.on('admin:live:kick', async ({ liveId, userId }: { liveId: string; userId: string }) => {
      if (!liveId || !userId) return;
      const isAdmin = await verifyIsAdmin(socket.data.userId);
      if (!isAdmin) return;

      const room = viewerCounts.get(liveId);
      if (!room) return;
      for (const [socketId, viewer] of room) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket && String(targetSocket.data.userId) === String(userId)) {
          targetSocket.emit('kicked', { liveId });
          targetSocket.leave(liveId);
          room.delete(socketId);
        }
      }
      const viewers = Array.from(room.values());
      io.to(liveId).emit('viewer:count', { count: room.size });
      io.to(liveId).emit('viewer:list', { viewers });
    });

    socket.on('disconnect', () => {
      viewerCounts.forEach((room, liveId) => {
        if (room.has(socket.id)) {
          room.delete(socket.id);
          const viewers = Array.from(room.values());
          io.to(liveId).emit('viewer:count', { count: room.size });
          io.to(liveId).emit('viewer:list', { viewers });
          if (room.size === 0) viewerCounts.delete(liveId);
        }
      });
      adminSockets.forEach((set, liveId) => {
        if (set.delete(socket.id) && set.size === 0) adminSockets.delete(liveId);
      });
    });
  });
}
