import type { Server } from 'socket.io';
import { getAuctionEndRecommendations } from '../utils/productRecommender';

export interface LiveState {
  id: string;          // UUID, LiveKit roomName
  sellerId: string;
  sellerName?: string;
  title: string;
  thumbnailUrl?: string;
  category?: string;
  status: 'live' | 'ended' | 'upcoming';
  scheduledAt?: number;
  memo?: string | null;
  memoImages?: string[];
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

// normal 경매 입찰 이력 — 경매 종료 시 낙찰자/패찰자 구분(개인화 추천용)에 사용.
export interface BidRecord {
  userId: string;
  userName?: string;
  price: number;
  ts: number;
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
  // 일반(normal) 경매 입찰 이력 — 낙찰자/패찰자 구분(개인화 추천용)
  bidHistory?: BidRecord[];
  // 무료나눔(giveaway) 전용
  giveawayParticipants?: GiveawayParticipant[];
  // 상품 이미지
  imageUrl?: string;
  // 단위 수량·단위명
  unitCount: number;
  unitLabel: string;
  // 판매자 합배송비
  sellerShippingFee: number;
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
  memo?: string | null;
  memoImages?: string[];
}

export function createLive(id: string, { sellerId, sellerName, title, thumbnailUrl, category, scheduledAt, memo, memoImages }: CreateLiveParams): LiveState {
  const state: LiveState = {
    id,
    sellerId,
    sellerName,
    title,
    thumbnailUrl,
    category,
    status: scheduledAt ? 'upcoming' : 'live',
    scheduledAt,
    memo: memo ?? null,
    memoImages: memoImages ?? [],
    viewerCount: 0,
    currentAuctionId: null,
    createdAt: Date.now(),
  };
  lives.set(id, state);
  return state;
}

// 종료된 라이브를 lives Map에서 지연 삭제하기까지의 유예 시간.
// GET /api/lives/:id, favorites 등이 종료 직후 라이브를 조회해도 메모리 상태를 그대로 반환할 수 있게
// 짧은 유예를 두고, 그 이후엔 DB 조회로 자연히 fallback되므로(live.ts, favorites.ts 모두 DB fallback 보유) 안전하다.
const LIVE_CLEANUP_DELAY_MS = 5 * 60 * 1000;

export function endLive(id: string): void {
  const live = lives.get(id);
  // 이미 ended면 재호출로 인한 cleanup 타이머 중복 등록을 막는다.
  if (live && live.status !== 'ended') {
    live.status = 'ended';
    setTimeout(() => {
      const current = lives.get(id);
      if (current && current.status === 'ended') lives.delete(id);
    }, LIVE_CLEANUP_DELAY_MS);
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
  sellerShippingFee?: number;
}

export function createAuction(
  id: string,
  { liveId, productName, startPrice, sellerId, mode = 'normal', durationSec = 30, stockTotal, imageUrl, unitCount, unitLabel, sellerShippingFee }: CreateAuctionParams,
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
    sellerShippingFee: sellerShippingFee ?? 3000,
  };

  if (mode === 'normal') {
    state.bidHistory = [];
  }

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

// 경매 종료 시 참여자(낙찰자/패찰자) 목록을 모드별로 계산한다.
// fcfs는 구매 즉시 개별 낙찰이 이미 발생하고 패찰 개념이 약해 스킵한다(빈 배열 반환).
function getAuctionParticipants(auc: AuctionState): string[] {
  if (auc.mode === 'normal') {
    return Array.from(new Set((auc.bidHistory ?? []).map((b) => b.userId)));
  }
  if (auc.mode === 'blind') {
    return Array.from(new Set((auc.blindBids ?? []).map((b) => b.userId)));
  }
  if (auc.mode === 'giveaway') {
    return Array.from(new Set((auc.giveawayParticipants ?? []).map((p) => p.userId)));
  }
  return [];
}

// 경매 종료 후 낙찰자/패찰자 전원에게 개인화 추천 상품을 emit한다.
// 종료 응답(auction:ended)을 막지 않도록 setImmediate로 비동기 처리하며, 에러는 삼킨다.
function emitAuctionEndRecommendations(auc: AuctionState, io: Server): void {
  const participants = getAuctionParticipants(auc);
  if (participants.length === 0) return;

  const live = lives.get(auc.liveId);
  const category = live?.category;

  setImmediate(async () => {
    await Promise.all(participants.map(async (userId) => {
      try {
        const recommendations = await getAuctionEndRecommendations({
          category,
          productName: auc.productName,
          priceRange: auc.currentPrice,
          userId,
        });
        const isWinner = userId === auc.topBidder;
        io.to(`user:${userId}`).emit('auction:recommendation', {
          auctionId: auc.id,
          liveId: auc.liveId,
          productName: auc.productName,
          category: category ?? null,
          isWinner,
          recommendations,
        });
      } catch (err) {
        console.error(`[memory] emitAuctionEndRecommendations 실패 (auction=${auc.id}, user=${userId}):`, (err as Error).message);
      }
    }));
  });
}

export async function endAuctionState(
  auc: AuctionState,
  io: Server,
  onEnd?: (state: AuctionState) => Promise<void> | void,
): Promise<void> {
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

  emitAuctionEndRecommendations(auc, io);

  stopTimer(auc.id);

  // DB 저장(onEnd)이 성공한 경우에만 메모리에서 삭제 — 실패 시 상태를 보존해 재시도/수동 복구가 가능하도록 한다.
  try {
    await onEnd?.(auc);
    auctions.delete(auc.id);
  } catch (err) {
    console.error(`[memory] endAuctionState: onEnd 실패, auction ${auc.id} 메모리 보존:`, (err as Error).message);
  }
}

export function startTimer(
  id: string,
  io: Server,
  onEnd?: (state: AuctionState) => Promise<void> | void,
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
      endAuctionState(auc, io, onEnd).catch((err) => {
        console.error(`[memory] startTimer: endAuctionState rejected for ${id}:`, (err as Error).message);
      });
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
 * 반환된 boolean은 종료 "시작" 성공 여부이며, DB 저장(onEnd) 완료를 기다리지 않는다 —
 * 호출부에서 저장 완료까지 기다릴 필요가 없으면 결과를 무시해도 안전하다(내부에서 rejection을 처리함).
 */
export function endFcfsAuction(
  id: string,
  io: Server,
  onEnd?: (state: AuctionState) => Promise<void> | void,
): boolean {
  const auc = auctions.get(id);
  if (!auc || auc.mode !== 'fcfs' || auc.status !== 'live') return false;
  stopTimer(id);
  endAuctionState(auc, io, onEnd).catch((err) => {
    console.error(`[memory] endFcfsAuction: endAuctionState rejected for ${id}:`, (err as Error).message);
  });
  return true;
}
