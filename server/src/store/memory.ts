import type { Server } from 'socket.io';

export interface AuctionState {
  id: string;
  productName: string;
  sellerId: string;
  currentPrice: number;
  topBidder: string | null;
  timeLeft: number;
  status: 'live' | 'ended';
}

export const auctions = new Map<string, AuctionState>();
const timers = new Map<string, NodeJS.Timeout>();

interface CreateAuctionParams {
  productName: string;
  startPrice: number;
  sellerId: string;
}

export function createAuction(id: string, { productName, startPrice, sellerId }: CreateAuctionParams): void {
  auctions.set(id, {
    id,
    productName,
    sellerId,
    currentPrice: startPrice,
    topBidder: null,
    timeLeft: 30,
    status: 'live',
  });
}

export function startTimer(
  id: string,
  io: Server,
  onEnd?: (state: AuctionState) => void,
): void {
  stopTimer(id); // 중복 방지
  const timer = setInterval(() => {
    const auction = auctions.get(id);
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
      auctions.delete(id);
    } else {
      io.to(id).emit('auction:update', auction);
    }
  }, 1000);
  timers.set(id, timer);
}

export function stopTimer(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearInterval(timer);
    timers.delete(id);
  }
}
