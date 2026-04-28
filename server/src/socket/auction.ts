import { Server } from 'socket.io';
import { lives, auctions } from '../store/memory';

const viewerCounts = new Map<string, Set<string>>();

export default function registerAuctionSocket(io: Server): void {
  io.on('connection', (socket) => {

    // join: { liveId } — 라이브 방 입장
    socket.on('join', ({ liveId }: { liveId: string }) => {
      socket.join(liveId);
      if (!viewerCounts.has(liveId)) viewerCounts.set(liveId, new Set());
      viewerCounts.get(liveId)!.add(socket.id);
      io.to(liveId).emit('viewer:count', { count: viewerCounts.get(liveId)!.size });

      // 현재 진행 중인 경매 상태 즉시 전송
      const live = lives.get(liveId);
      if (live?.currentAuctionId) {
        const auction = auctions.get(live.currentAuctionId);
        if (auction) socket.emit('auction:update', auction);
      }
    });

    // bid: { liveId, auctionId, price, userId, userName? }
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
        if (userId === auction.sellerId) return;
        if (price <= auction.currentPrice) return;

        auction.currentPrice = price;
        auction.topBidder = userId;
        if (userName) auction.topBidderName = userName;
        if (auction.timeLeft <= 10) auction.timeLeft += 10;

        io.to(liveId).emit('auction:update', auction);
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

    socket.on('disconnect', () => {
      viewerCounts.forEach((sockets, liveId) => {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          io.to(liveId).emit('viewer:count', { count: sockets.size });
          if (sockets.size === 0) viewerCounts.delete(liveId);
        }
      });
    });
  });
}
