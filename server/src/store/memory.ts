import type { Server } from 'socket.io';

export interface LiveState {
  id: string;          // UUID, LiveKit roomName
  sellerId: string;
  title: string;
  status: 'live' | 'ended';
  viewerCount: number;
  currentAuctionId: string | null;
  createdAt: number;
}

export interface AuctionState {
  id: string;
  liveId: string;
  productName: string;
  sellerId: string;
  currentPrice: number;
  topBidder: string | null;
  topBidderName?: string;
  timeLeft: number;
  status: 'pending' | 'live' | 'ended';
}

export const lives = new Map<string, LiveState>();
export const auctions = new Map<string, AuctionState>();
const timers = new Map<string, NodeJS.Timeout>();

interface CreateLiveParams {
  sellerId: string;
  title: string;
}

export function createLive(id: string, { sellerId, title }: CreateLiveParams): LiveState {
  const state: LiveState = {
    id,
    sellerId,
    title,
    status: 'live',
    viewerCount: 0,
    currentAuctionId: null,
    createdAt: Date.now(),
  };
  lives.set(id, state);
  return state;
}

export function endLive(id: string): void {
  const live = lives.get(id);
  if (live) {
    live.status = 'ended';
  }
}

interface CreateAuctionParams {
  liveId: string;
  productName: string;
  startPrice: number;
  sellerId: string;
}

export function createAuction(id: string, { liveId, productName, startPrice, sellerId }: CreateAuctionParams): void {
  auctions.set(id, {
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

export function startTimer(
  id: string,
  io: Server,
  onEnd?: (state: AuctionState) => void,
): void {
  stopTimer(id); // 중복 방지
  const auction = auctions.get(id);
  if (auction) {
    auction.status = 'live';
    // Live의 currentAuctionId 업데이트
    const live = lives.get(auction.liveId);
    if (live) live.currentAuctionId = id;
  }
  const timer = setInterval(() => {
    const auc = auctions.get(id);
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
      const live = lives.get(auc.liveId);
      if (live) live.currentAuctionId = null;
      stopTimer(id);
      onEnd?.(auc);
      auctions.delete(id);
    } else {
      io.to(auc.liveId).emit('auction:update', auc);
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
