import type { Server } from 'socket.io';

export interface LiveState {
  id: string;          // UUID, LiveKit roomName
  sellerId: string;
  sellerName?: string;
  title: string;
  thumbnailUrl?: string;
  category?: string;
  status: 'live' | 'ended' | 'upcoming';
  scheduledAt?: number;
  viewerCount: number;
  currentAuctionId: string | null;
  createdAt: number;
}

export interface BlindBid {
  userId: string;
  userName?: string;
  price: number;
  ts: number;
}

export interface GiveawayParticipant {
  userId: string;
  userName: string;
}

export interface AuctionState {
  id: string;
  liveId: string;
  productName: string;
  sellerId: string;
  startPrice: number;
  currentPrice: number;
  topBidder: string | null;
  topBidderName?: string;
  timeLeft: number;
  status: 'pending' | 'live' | 'ended';
  // 경매 모드
  mode: 'normal' | 'fcfs' | 'blind' | 'giveaway';
  durationSec: number;
  // 선착순(fcfs) 전용
  stockTotal?: number;
  stockSold?: number;
  // 블라인드(blind) 전용
  blindBids?: BlindBid[];
  revealAt?: number;
  // 무료나눔(giveaway) 전용
  giveawayParticipants?: GiveawayParticipant[];
  // 상품 이미지
  imageUrl?: string;
  // 단위 수량·단위명
  unitCount: number;
  unitLabel: string;
}

export const lives = new Map<string, LiveState>();
export const auctions = new Map<string, AuctionState>();
const timers = new Map<string, NodeJS.Timeout>();

// 블라인드 경매 종료 후 blindBids를 30분간 보관하는 Map
export const endedBlindBids = new Map<string, BlindBid[]>();

interface CreateLiveParams {
  sellerId: string;
  sellerName?: string;
  title: string;
  thumbnailUrl?: string;
  category?: string;
  scheduledAt?: number;
}

export function createLive(id: string, { sellerId, sellerName, title, thumbnailUrl, category, scheduledAt }: CreateLiveParams): LiveState {
  const state: LiveState = {
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
  mode?: 'normal' | 'fcfs' | 'blind' | 'giveaway';
  durationSec?: number;
  stockTotal?: number;
  imageUrl?: string;
  unitCount?: number;
  unitLabel?: string;
}

export function createAuction(
  id: string,
  { liveId, productName, startPrice, sellerId, mode = 'normal', durationSec = 30, stockTotal, imageUrl, unitCount, unitLabel }: CreateAuctionParams,
): void {
  const state: AuctionState = {
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
    unitCount: unitCount ?? 1,
    unitLabel: unitLabel ?? '',
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

  auctions.set(id, state);
}

function endAuctionState(
  auc: AuctionState,
  io: Server,
  onEnd?: (state: AuctionState) => void,
): void {
  auc.timeLeft = 0;
  auc.status = 'ended';

  if (auc.mode === 'blind' && auc.blindBids && auc.blindBids.length > 0) {
    // 정렬: price DESC, ts ASC
    const sorted = [...auc.blindBids].sort((a, b) =>
      b.price !== a.price ? b.price - a.price : a.ts - b.ts,
    );
    const winner = sorted[0];
    auc.topBidder = winner.userId;
    auc.topBidderName = winner.userName;
    auc.currentPrice = winner.price;
    auc.revealAt = Date.now();

    // blindBids를 endedBlindBids에 보관 (TTL 30분)
    endedBlindBids.set(auc.id, sorted);
    setTimeout(() => endedBlindBids.delete(auc.id), 30 * 60 * 1000);
  }

  if (auc.mode === 'giveaway' && auc.giveawayParticipants && auc.giveawayParticipants.length > 0) {
    const idx = Math.floor(Math.random() * auc.giveawayParticipants.length);
    const winner = auc.giveawayParticipants[idx];
    auc.topBidder = winner.userId;
    auc.topBidderName = winner.userName;
    auc.currentPrice = 0;
  }

  const live = lives.get(auc.liveId);
  if (live) live.currentAuctionId = null;

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
    unitCount: auc.unitCount,
    unitLabel: auc.unitLabel,
    participants: auc.mode === 'giveaway' ? (auc.giveawayParticipants ?? []) : undefined,
  });

  stopTimer(auc.id);
  onEnd?.(auc);

  // 블라인드는 endedBlindBids에 복사 후 삭제
  auctions.delete(auc.id);
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
      endAuctionState(auc, io, onEnd);
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

/**
 * 선착순(fcfs) 경매를 즉시 종료한다.
 * endAuctionState를 호출하고 onEnd 콜백을 트리거한다.
 */
export function endFcfsAuction(
  id: string,
  io: Server,
  onEnd?: (state: AuctionState) => void,
): boolean {
  const auc = auctions.get(id);
  if (!auc || auc.mode !== 'fcfs' || auc.status !== 'live') return false;
  stopTimer(id);
  endAuctionState(auc, io, onEnd);
  return true;
}
