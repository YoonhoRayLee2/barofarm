/**
 * Live Buyer Page — renew
 * Full-screen buyer viewer UI with bidding controls.
 *
 * LiveKit room.connect() is handled exclusively by livekit.js helpers.
 * This module owns layout, socket events, and bid controls only.
 *
 * @module pages/live-buyer
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace, navigate, setCleanup } from '/app/scripts/router.js';
import * as api from '/app/scripts/api.js';
import * as Sock from '/app/scripts/socket.js';
import { createTimer } from '/app/components/timer.js';
import { createChatOverlay } from '/app/components/chat-overlay.js';
import { createBuyButton } from '/app/components/buy-button.js';
import { createBlindBid } from '/app/components/blind-bid.js';
import { createSlideBid } from '/app/components/slide-bid.js';
import { showToast } from '/app/components/toast.js';
import { personIconSVG } from '/app/scripts/person-icon.js';

// ---- Swipe navigation state (module-level) ----
let _liveList = [];
let _liveIndex = 0;

// Inject page CSS once
const _cssId = 'page-css-live-buyer';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/live-buyer.css';
  document.head.appendChild(link);
}

/**
 * @param {{ liveId: string }} params
 * @returns {Promise<HTMLElement>}
 */
export default async function load(params) {
  const { liveId } = params;

  // ---- Auth guard ----
  const stored = await getSecureItem('user');
  if (!stored) {
    await replace('/app/login');
    return document.createElement('div');
  }
  let user;
  try {
    user = JSON.parse(stored);
  } catch {
    await replace('/app/login');
    return document.createElement('div');
  }

  // live 상태 사전 확인 — ended이면 입장 거부
  let liveInfo = null;
  try {
    const liveRes = await fetch(`/api/lives/${encodeURIComponent(liveId)}`);
    if (liveRes.ok) liveInfo = await liveRes.json();
  } catch (_) {}

  if (!liveInfo || liveInfo.status === 'ended') {
    const endedPage = document.createElement('div');
    endedPage.className = 'live-ended-page';
    endedPage.innerHTML = `
      <div class="live-ended-card">
        <div class="live-ended-icon">📺</div>
        <div class="live-ended-title">종료된 방송입니다</div>
        <div class="live-ended-desc">방송이 이미 종료되었습니다.</div>
        <button class="live-ended-btn" id="lep-home">홈으로 돌아가기</button>
      </div>
    `;
    endedPage.querySelector('#lep-home').addEventListener('click', () => navigate('/app/home'));
    setTimeout(() => navigate('/app/home'), 5000);
    return endedPage;
  }

  // ---- Build page shell ----
  const page = document.createElement('div');
  page.className = 'live-buyer';
  page.dataset.theme = 'light';

  // Video element
  const videoEl = document.createElement('video');
  videoEl.className = 'live-buyer__video';
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.muted = true; // start muted for autoplay; mute button toggles
  page.appendChild(videoEl);

  // ---- Top bar ----
  const topBar = document.createElement('div');
  topBar.className = 'lb-top';
  topBar.innerHTML = `
    <div class="lb-host">
      <div class="lb-avatar" id="lb-seller-avatar"></div>
      <div class="lb-host-info">
        <div class="lb-host-sub" id="lb-seller-sub">라이브 방송 중</div>
        <div class="lb-host-name" id="lb-seller-name">판매자</div>
      </div>
    </div>
    <div class="lb-meta">
      <div class="lb-live-badge"><span class="dot"></span>LIVE</div>
      <button class="lb-glass-btn" id="lb-viewers-btn" aria-label="시청자 목록" title="시청자">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
      <span id="lb-viewer-count" style="display:none">0</span>
      <button class="lb-glass-btn" id="lb-mute-btn" title="음소거">🔇</button>
      <button class="lb-glass-btn" id="lb-back-btn" title="나가기">✕</button>
    </div>
  `;
  page.appendChild(topBar);

  // ---- Mute / HD info row ----
  const muteRow = document.createElement('div');
  muteRow.className = 'lb-mute-row';
  muteRow.id = 'lb-mute-row';
  muteRow.innerHTML = `
    <span>🔇</span>
    <span id="lb-mute-label">음소거</span>
    <span class="divider"></span>
    <span style="font-size:9px;padding:1px 4px;border-radius:3px;border:1px solid rgba(255,255,255,0.4);font-weight:800;">HD</span>
    <span style="opacity:0.8"> 720p</span>
  `;
  page.appendChild(muteRow);

  // ---- Chat overlay wrapper ----
  const chatWrap = document.createElement('div');
  chatWrap.className = 'live-buyer__chat-wrap';
  page.appendChild(chatWrap);

  // ---- Product panel (bottom overlay) ----
  const productPanel = document.createElement('div');
  productPanel.className = 'lb-bottom';
  productPanel.id = 'lb-product-panel';
  productPanel.innerHTML = `
    <div class="lb-mode-chips" id="lb-mode-chips"></div>
    <div class="lb-product" id="lb-product">
      <div class="lb-product__thumb" id="lb-product-thumb"></div>
      <div class="lb-product__info">
        <div class="lb-product__name" id="lb-product-name">경매 대기 중...</div>
        <div class="lb-product__price-row">
          <span class="lb-product__price" id="lb-product-price"></span>
          <span class="lb-product__step" id="lb-price-step" style="display:none"></span>
        </div>
        <div class="lb-product__bidder" id="lb-product-bidder" style="display:none"></div>
      </div>
      <div class="lb-product__timer-slot" id="lb-timer-slot"></div>
    </div>
    <div class="lb-bid-controls" id="lb-bid-controls" style="display:none"></div>
    <div class="lb-no-auction-cta" id="lb-no-auction-cta">
      <span class="lb-waiting-text">라이브 시청 중 — 경매를 기다려보세요</span>
    </div>
  `;
  page.appendChild(productPanel);

  // Timer component — will be appended into #lb-timer-slot
  const timer = createTimer({ initialRemaining: 30 });
  timer.el.style.display = 'none';

  // Bid controls sub-containers (inside lb-bid-controls)
  const bidControls = productPanel.querySelector('#lb-bid-controls');

  // Slide-bid wrapper (normal mode)
  const slideBidWrap = document.createElement('div');
  slideBidWrap.id = 'lb-slide-bid-wrap';
  slideBidWrap.style.display = 'none';
  bidControls.appendChild(slideBidWrap);

  // FCFS mode container
  const fcfsBidWrap = document.createElement('div');
  fcfsBidWrap.className = 'lb-fcfs-wrap';
  fcfsBidWrap.id = 'lb-fcfs-wrap';
  fcfsBidWrap.style.display = 'none';
  bidControls.appendChild(fcfsBidWrap);

  // Blind mode container
  const blindBidWrap = document.createElement('div');
  blindBidWrap.className = 'lb-blind-wrap';
  blindBidWrap.id = 'lb-blind-wrap';
  blindBidWrap.style.display = 'none';
  bidControls.appendChild(blindBidWrap);

  // Giveaway mode container
  const giveawayWrap = document.createElement('div');
  giveawayWrap.className = 'lb-giveaway-area';
  giveawayWrap.id = 'lb-giveaway-wrap';
  giveawayWrap.style.display = 'none';
  giveawayWrap.innerHTML = `
    <div class="lb-giveaway-header">
      <span class="lb-giveaway-badge">🎁 무료나눔</span>
      <span id="lb-giveaway-count" class="lb-giveaway-count">0명 참여 중</span>
    </div>
    <button id="lb-giveaway-btn" class="lb-giveaway-btn" type="button">
      무료나눔 참여하기
    </button>
  `;
  bidControls.appendChild(giveawayWrap);

  // ---- Emoji reaction bar ----
  const emojiBar = document.createElement('div');
  emojiBar.className = 'lb-emoji-bar';
  emojiBar.id = 'lb-emoji-bar';
  emojiBar.innerHTML = `
    <button class="lb-emoji-btn" data-emoji="❤️">❤️</button>
    <button class="lb-emoji-btn" data-emoji="🔥">🔥</button>
    <button class="lb-emoji-btn" data-emoji="👍">👍</button>
    <button class="lb-emoji-btn" data-emoji="😂">😂</button>
    <button class="lb-emoji-btn" data-emoji="🎉">🎉</button>
    <button class="lb-emoji-btn" data-emoji="😱">😱</button>
  `;
  productPanel.appendChild(emojiBar);

  // ---- Actions bar (bottom) ----
  const actionsBar = document.createElement('div');
  actionsBar.className = 'lb-actions';
  actionsBar.innerHTML = `
    <button class="lb-icon-btn" id="lb-products-btn" aria-label="라이브중인 상품" title="상품">📦</button>
    <input class="lb-chat-input" id="lb-chat-input" type="text" placeholder="메시지를 입력해 주세요" maxlength="100" autocomplete="off" />
    <button class="lb-icon-btn" id="lb-heart-btn" title="좋아요">♡</button>
    <button class="lb-icon-btn" id="lb-share-btn2" aria-label="공유" title="공유">↗</button>
  `;
  productPanel.appendChild(actionsBar);

  // ---- Loading overlay ----
  const overlay = document.createElement('div');
  overlay.className = 'live-buyer__overlay';
  overlay.innerHTML = `
    <div class="live-buyer__spinner"></div>
    <div class="live-buyer__overlay-text" id="lb-overlay-text">연결 중...</div>
  `;
  page.appendChild(overlay);

  // ---- Bid state ----
  let basePrice = 0;
  let currentAuctionId = null;
  let currentMode = 'normal';
  let currentAuction = null;
  const endedAuctions = [];
  // 내 구매 내역 (실시간 누적, product-sheet history 탭에 반영)
  const myPurchases = [];

  // ---- Giveaway state ----
  let giveawayParticipants = [];  // 참여자 목록 (슬롯 애니메이션용)
  let giveawayJoined = false;     // 내가 이미 참여했는지

  // ---- Components ----
  const chatOverlay = createChatOverlay();
  chatWrap.appendChild(chatOverlay.el);

  let buyButtonComp = null;
  let buyReenableTimer = null;
  let blindBidComp = null;
  let slideBidComp = null;

  // ---- Helpers ----
  function hideOverlay() {
    overlay.classList.add('is-hidden');
  }

  function setOverlayText(text) {
    const el = page.querySelector('#lb-overlay-text');
    if (el) el.textContent = text;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getTickAmount(price) {
    if (price < 10000) return 500;
    if (price < 50000) return 1000;
    if (price < 100000) return 2000;
    return 3000;
  }

  function updateSlideBid() {
    if (!currentAuctionId || currentMode !== 'normal') {
      slideBidWrap.style.display = 'none';
      if (slideBidComp) { slideBidComp.destroy(); slideBidComp = null; }
      return;
    }
    const tick = getTickAmount(basePrice);
    const bidAmount = basePrice + tick;
    slideBidWrap.style.display = '';
    if (slideBidComp) {
      // 드래그 중이 아닐 때만 라벨 업데이트 (재생성 없이)
      slideBidComp.setAmount(bidAmount);
    } else {
      slideBidComp = createSlideBid({
        amount: bidAmount,
        onConfirm() {
          placeBid(basePrice + getTickAmount(basePrice));
          // basePrice는 곧 소켓 업데이트로 갱신됨; 슬라이드만 리셋
        },
      });
      slideBidWrap.innerHTML = '';
      slideBidWrap.appendChild(slideBidComp.el);
    }
  }

  function placeBid(price) {
    if (!currentAuctionId) {
      showToast('진행 중인 경매가 없습니다', { variant: 'error' });
      return;
    }
    const minPrice = currentAuction?.startPrice || 0;
    if (price < minPrice) {
      showToast(`경매 시작가(${minPrice.toLocaleString()}원) 이상으로 입찰해야 합니다`, { variant: 'error' });
      return;
    }
    Sock.sendBid(socket, liveId, currentAuctionId, price, String(user.id), user.nickname || user.username || '시청자');
    showToast(`${price.toLocaleString()}원 입찰 전송!`, { variant: 'info' });
  }

  const AUCTION_HELP = {
    normal: {
      title: '일반 경매',
      icon: '🔨',
      steps: [
        '현재 최고 입찰가보다 높은 금액을 슬라이드해서 입찰하세요.',
        '누군가 더 높은 금액을 입찰하면 알림 없이 갱신됩니다.',
        '경매 시간이 끝나면 최고 입찰자가 낙찰됩니다.',
        '유찰 시 아무도 낙찰되지 않습니다.',
      ],
    },
    blind: {
      title: '블라인드 경매',
      icon: '🔒',
      steps: [
        '다른 입찰자의 금액이 공개되지 않는 비공개 입찰입니다.',
        '입찰가를 입력하고 입찰 버튼을 누르세요.',
        '같은 경매에서 직전 입찰가보다 높게만 재입찰 가능합니다.',
        '경매 종료 후 가장 높은 금액을 입력한 분이 낙찰됩니다.',
      ],
    },
    fcfs: {
      title: '선착순 구매',
      icon: '⚡',
      steps: [
        '수량이 제한된 상품을 먼저 버튼을 누른 순서대로 구매합니다.',
        '재고가 소진되면 즉시 마감됩니다.',
        '구매 완료 후 주문 내역에서 확인할 수 있습니다.',
      ],
    },
    giveaway: {
      title: '무료 나눔',
      icon: '🎁',
      steps: [
        '참여 버튼을 누르면 추첨 대상이 됩니다.',
        '한 번만 참여할 수 있으며 취소는 불가합니다.',
        '경매 종료 후 판매자가 추첨하여 당첨자를 발표합니다.',
        '당첨자는 채팅창으로 공지됩니다.',
      ],
    },
  };

  function showAuctionHelp(mode) {
    if (page.querySelector('.lb-help-modal')) return;
    const info = AUCTION_HELP[mode] || AUCTION_HELP.normal;
    const modal = document.createElement('div');
    modal.className = 'lb-help-modal';
    modal.innerHTML = `
      <div class="lb-help-modal__card">
        <div class="lb-help-modal__icon">${info.icon}</div>
        <div class="lb-help-modal__title">${info.title} 안내</div>
        <ol class="lb-help-modal__steps">
          ${info.steps.map(s => `<li>${s}</li>`).join('')}
        </ol>
        <button class="lb-help-modal__close">확인</button>
      </div>
    `;
    modal.querySelector('.lb-help-modal__close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    page.appendChild(modal);
  }

  function modeBadgeText(mode) {
    if (mode === 'fcfs') return '선착순';
    if (mode === 'blind') return '블라인드';
    if (mode === 'giveaway') return '무료나눔';
    return '일반 경매';
  }

  function switchBidMode(mode) {
    currentMode = mode;
    const isFcfs = mode === 'fcfs';
    const isBlind = mode === 'blind';
    const isGiveaway = mode === 'giveaway';

    // slide-bid-wrap: updateSlideBid() 가 normal 여부 판단해서 표시/숨김
    slideBidWrap.style.display = 'none';
    fcfsBidWrap.style.display = isFcfs ? '' : 'none';
    blindBidWrap.style.display = isBlind ? '' : 'none';
    giveawayWrap.style.display = isGiveaway ? '' : 'none';

    if (mode !== 'normal' && slideBidComp) { slideBidComp.destroy(); slideBidComp = null; }
    if (!isBlind && blindBidComp) { blindBidComp.destroy(); blindBidComp = null; }

    // 모드 전환 시 giveaway 상태 초기화 (다른 모드로 가면)
    if (!isGiveaway) {
      giveawayJoined = false;
      giveawayParticipants = [];
      const joinBtn = page.querySelector('#lb-giveaway-btn');
      if (joinBtn) {
        joinBtn.disabled = false;
        joinBtn.textContent = '무료나눔 참여하기';
      }
      const countEl = page.querySelector('#lb-giveaway-count');
      if (countEl) countEl.textContent = '0명 참여 중';
    }

    // 모드 칩 + 도움말 버튼 — lb-mode-chips 영역
    const CHIP_META = {
      normal:   { icon: '🔨', label: '일반 경매',   cls: '' },
      blind:    { icon: '🔒', label: '블라인드',     cls: 'lb-mode-chip--blind' },
      fcfs:     { icon: '⚡', label: '선착순 구매',  cls: 'lb-mode-chip--cta' },
      giveaway: { icon: '🎁', label: '무료 나눔',    cls: 'lb-mode-chip--info' },
    };
    const meta = CHIP_META[mode] || CHIP_META.normal;
    const chipsEl = page.querySelector('#lb-mode-chips');
    if (chipsEl) {
      chipsEl.innerHTML = `
        <span class="lb-mode-chip ${meta.cls}">${meta.icon} ${meta.label}</span>
        <button class="lb-help-btn" aria-label="경매 방식 안내">?</button>
      `;
      chipsEl.querySelector('.lb-help-btn').addEventListener('click', () => showAuctionHelp(mode));
    }
  }

  function setupFcfsMode(auction) {
    if (buyButtonComp) { buyButtonComp.destroy(); buyButtonComp = null; }
    fcfsBidWrap.innerHTML = '';
    const total = auction.stockTotal || 0;
    const sold = auction.stockSold || 0;
    buyButtonComp = createBuyButton({
      productName: auction.productName || '',
      productSub: auction.sellerName || '',
      price: auction.currentPrice || auction.startPrice || 0,
      stockTotal: total,
      stockSold: sold,
      thumbUrl: auction.thumbUrl || '',
      onBuy() {
        if (!currentAuctionId) return;
        // 연타 중복 전송 방지: 클릭 즉시 비활성화. 구매 결과(onPurchaseMade)에서
        // update()로 재활성(매진이면 비활성 유지), 결과 미수신 대비 3초 폴백 타이머.
        buyButtonComp.disable('구매 중…');
        clearTimeout(buyReenableTimer);
        buyReenableTimer = setTimeout(() => {
          if (buyButtonComp && currentAuction) {
            buyButtonComp.update(currentAuction.stockTotal || 0, currentAuction.stockSold || 0);
          }
        }, 3000);
        Sock.purchase(socket, {
          liveId,
          auctionId: currentAuctionId,
          userId: String(user.id),
          userName: user.nickname || user.username || '시청자',
        });
      },
    });
    fcfsBidWrap.appendChild(buyButtonComp.el);
  }

  function setupBlindMode() {
    if (blindBidComp) { blindBidComp.destroy(); blindBidComp = null; }
    blindBidWrap.innerHTML = '';
    blindBidComp = createBlindBid({
      onSubmit(price) {
        if (!currentAuctionId) return;
        Sock.bidBlind(socket, {
          liveId,
          auctionId: currentAuctionId,
          userId: String(user.id),
          userName: user.nickname || user.username || '시청자',
          price,
        });
      },
    });
    blindBidWrap.appendChild(blindBidComp.el);
  }

  function updateAuctionUI(auction) {
    currentAuction = auction;

    const productNameEl = page.querySelector('#lb-product-name');
    const productPriceEl = page.querySelector('#lb-product-price');
    const productThumbEl = page.querySelector('#lb-product-thumb');
    const timerSlot = page.querySelector('#lb-timer-slot');
    const bidControlsEl = page.querySelector('#lb-bid-controls');
    const noAuctionCtaEl = page.querySelector('#lb-no-auction-cta');

    if (!auction) {
      if (productNameEl) productNameEl.textContent = '경매 대기 중...';
      if (productPriceEl) productPriceEl.textContent = '';
      if (productThumbEl) productThumbEl.innerHTML = '';
      if (bidControlsEl) bidControlsEl.style.display = 'none';
      if (noAuctionCtaEl) noAuctionCtaEl.style.display = '';
      timer.el.style.display = 'none';
      basePrice = 0;
      currentAuctionId = null;
      if (slideBidComp) { slideBidComp.destroy(); slideBidComp = null; }
      slideBidWrap.style.display = 'none';
      switchBidMode('normal');
      // giveaway 상태 리셋은 switchBidMode('normal')에서 처리됨
      return;
    }

    // Auction active: show bid controls, hide no-auction CTA
    if (bidControlsEl) bidControlsEl.style.display = '';
    if (noAuctionCtaEl) noAuctionCtaEl.style.display = 'none';

    currentAuctionId = auction.id || auction.auctionId || currentAuctionId;
    basePrice = auction.currentPrice || auction.startPrice || 0;

    if (productNameEl) productNameEl.textContent = auction.productName || '';
    const priceStepEl = page.querySelector('#lb-price-step');
    if (priceStepEl) {
      const tick = getTickAmount(basePrice);
      priceStepEl.textContent = `+${tick.toLocaleString()}원`;
    }

    // Thumbnail
    if (productThumbEl) {
      const imgUrl = auction.imageUrl || auction.thumbUrl || '';
      if (imgUrl) {
        productThumbEl.innerHTML = `<img src="${escapeHtml(imgUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />`;
      } else {
        productThumbEl.innerHTML = '';
      }
    }

    const mode = auction.mode || 'normal';
    if (mode !== currentMode) switchBidMode(mode);

    if (mode === 'normal') {
      if (productPriceEl) productPriceEl.textContent = basePrice.toLocaleString() + '원';
      updateSlideBid();
    } else if (mode === 'fcfs') {
      if (productPriceEl) productPriceEl.textContent = (auction.currentPrice || auction.startPrice || 0).toLocaleString() + '원';
      const total = auction.stockTotal || 0;
      const sold = auction.stockSold || 0;
      if (!buyButtonComp) {
        setupFcfsMode(auction);
      } else {
        buyButtonComp.setProduct({
          productName: auction.productName,
          productSub: auction.sellerName,
          price: auction.currentPrice || auction.startPrice || 0,
        });
        buyButtonComp.update(total, sold);
        if (sold >= total) buyButtonComp.disable('매진');
      }
    } else if (mode === 'blind') {
      if (productPriceEl) productPriceEl.textContent = '비공개 입찰';
      if (!blindBidComp) setupBlindMode();
    } else if (mode === 'giveaway') {
      if (productPriceEl) productPriceEl.textContent = '🎁 무료나눔';
    }

    // 현재 최고 응찰자
    const bidderEl = page.querySelector('#lb-product-bidder');
    if (bidderEl) {
      const name = auction.topBidderName || '';
      if (name && mode === 'normal') {
        bidderEl.style.display = '';
        bidderEl.textContent = `👤 ${name} 응찰 중`;
      } else {
        bidderEl.style.display = 'none';
      }
    }

    // Timer
    const remaining = auction.timeLeft != null ? auction.timeLeft : auction.remaining;
    if (remaining != null) {
      if (mode === 'fcfs') {
        timer.el.style.display = 'none';
        if (buyButtonComp) buyButtonComp.tick(remaining);
      } else {
        if (timerSlot && !timerSlot.contains(timer.el)) {
          timerSlot.appendChild(timer.el);
        }
        timer.el.style.display = '';
        timer.update(remaining);
      }
    }
  }

  function spawnFloatingEmoji(emoji) {
    const el = document.createElement('span');
    el.className = 'lb-floating-emoji';
    el.textContent = emoji;
    el.style.left = (10 + Math.random() * 70) + '%';
    page.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  function spawnConfetti(container) {
    const colors = ['var(--color-cta)', 'var(--color-accent)', 'var(--color-ink)'];
    for (let i = 0; i < 10; i++) {
      const dot = document.createElement('div');
      dot.className = 'won-confetti';
      dot.style.left = `${Math.random() * 100}%`;
      dot.style.top = `${Math.random() * 30}%`;
      dot.style.background = colors[Math.floor(Math.random() * colors.length)];
      dot.style.animationDelay = `${Math.random() * 0.4}s`;
      dot.style.animationDuration = `${0.9 + Math.random() * 0.8}s`;
      dot.addEventListener('animationend', () => dot.remove());
      container.appendChild(dot);
    }
  }

  function showWonOverlay(auction) {
    const backdrop = document.createElement('div');
    backdrop.className = 'won-overlay';

    // Giveaway 모드: 슬롯 머신 애니메이션
    if (auction.mode === 'giveaway') {
      if (auction.void || !auction.winnerName) {
        backdrop.innerHTML = `
          <div class="won-card">
            <div class="won-card__emoji">📭</div>
            <div class="won-card__title">무효</div>
            <div class="won-card__price">참여자가 없습니다</div>
            <button class="won-card__confirm-btn" id="won-confirm-btn">확인</button>
          </div>
        `;
      } else {
        backdrop.innerHTML = `
          <div class="won-card won-card--giveaway">
            <div class="won-card__emoji">🎁</div>
            <div class="won-slot" id="won-slot-names">
              <div class="won-slot__name" id="won-slot-display">...</div>
            </div>
            <div class="won-card__winner-msg" id="won-winner-msg" style="display:none;"></div>
          </div>
        `;
        const slotEl = backdrop.querySelector('#won-slot-display');
        const msgEl = backdrop.querySelector('#won-winner-msg');
        const names = (auction.participants || giveawayParticipants).map(p => p.userName);
        if (names.length === 0) names.push(auction.winnerName);

        let idx = 0;
        let interval = 80;
        let elapsed = 0;
        const totalMs = 2800;

        const spin = () => {
          if (!slotEl) return;
          slotEl.textContent = names[idx % names.length];
          idx++;
          elapsed += interval;
          if (elapsed >= totalMs) {
            slotEl.textContent = auction.winnerName;
            slotEl.classList.add('won-slot__name--winner');
            if (msgEl) {
              msgEl.textContent = `${auction.winnerName}님 당첨 축하합니다! 🎉`;
              msgEl.style.display = 'block';
            }
            spawnConfetti(backdrop);
            return;
          }
          if (elapsed > totalMs * 0.6) {
            interval = Math.min(interval * 1.15, 400);
          }
          setTimeout(spin, interval);
        };
        setTimeout(spin, 0);
      }
      page.appendChild(backdrop);
      const confirmBtn = backdrop.querySelector('#won-confirm-btn');
      if (confirmBtn) confirmBtn.addEventListener('click', () => backdrop.remove());
      setTimeout(() => { if (backdrop.parentNode) backdrop.remove(); }, 7000);
      return;
    }

    const isVoid = auction.void === true || !auction.winnerName;
    if (isVoid) {
      backdrop.innerHTML = `
        <div class="won-card">
          <div class="won-card__emoji">📭</div>
          <div class="won-card__title">유찰 — 입찰자가 없습니다</div>
          <button class="won-card__confirm-btn" id="won-confirm-btn">확인</button>
        </div>
      `;
    } else {
      const price = (auction.finalPrice || auction.price || auction.currentPrice || 0).toLocaleString();
      backdrop.innerHTML = `
        <div class="won-card">
          <div class="won-card__emoji">🏆</div>
          <div class="won-card__winner-name">${escapeHtml(auction.winnerName)}님 낙찰!</div>
          <div class="won-card__price">${price}원</div>
          <div class="won-card__title">${escapeHtml(auction.productName || '')}</div>
          <button class="won-card__confirm-btn" id="won-confirm-btn">확인</button>
        </div>
      `;
      spawnConfetti(backdrop);
    }
    page.appendChild(backdrop);

    const confirmBtn = backdrop.querySelector('#won-confirm-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => backdrop.remove());
    }
    setTimeout(() => { if (backdrop.parentNode) backdrop.remove(); }, 5000);
  }

  // ---- Load seller info ----
  let _sellerId = null; // 채팅 아이콘 표시용
  async function loadSellerInfo() {
    try {
      const live = await api.getLive(liveId);
      const sellerId = live.sellerId || live.seller_id;
      if (!sellerId) return;
      _sellerId = String(sellerId);
      const sellerUser = await api.getUser(sellerId);
      const nameEl = page.querySelector('#lb-seller-name');
      const avatarEl = page.querySelector('#lb-seller-avatar');
      const subEl = page.querySelector('#lb-seller-sub');
      const displayName = sellerUser.nickname || sellerUser.displayName || sellerUser.username || '판매자';
      if (nameEl) nameEl.textContent = displayName;
      if (subEl) subEl.textContent = live.title || '라이브 방송 중';
      if (avatarEl) {
        if (sellerUser.avatarUrl) {
          avatarEl.innerHTML = `<img src="${escapeHtml(sellerUser.avatarUrl)}" alt="${escapeHtml(displayName)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
        } else {
          avatarEl.innerHTML = personIconSVG(36);
        }
      }
      // 팔로우 버튼 — 본인 라이브가 아닐 때만
      if (_sellerId !== String(user.id)) {
        attachFollowButton(_sellerId);
      }
    } catch (_e) {
      // graceful fallback — keep defaults
    }
  }
  loadSellerInfo();

  // ---- Follow button ----
  let isFollowing = false;
  function attachFollowButton(sellerId) {
    const nameEl = page.querySelector('#lb-seller-name');
    if (!nameEl || nameEl.parentElement.querySelector('.lb-follow-btn')) return;
    const followBtn = document.createElement('button');
    followBtn.className = 'lb-follow-btn';
    followBtn.type = 'button';
    followBtn.textContent = '팔로우';
    nameEl.insertAdjacentElement('afterend', followBtn);

    fetch(`/api/users/${encodeURIComponent(sellerId)}/is-following?userId=${encodeURIComponent(user.id)}`)
      .then(r => r.ok ? r.json() : { isFollowing: false })
      .then(({ isFollowing: f }) => {
        isFollowing = !!f;
        followBtn.textContent = isFollowing ? '팔로잉' : '팔로우';
        followBtn.classList.toggle('is-following', isFollowing);
      })
      .catch(() => {});

    followBtn.addEventListener('click', async () => {
      const method = isFollowing ? 'DELETE' : 'POST';
      followBtn.disabled = true;
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(sellerId)}/follow`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followerId: user.id }),
        });
        if (!res.ok) throw new Error('follow request failed');
        isFollowing = !isFollowing;
        followBtn.textContent = isFollowing ? '팔로잉' : '팔로우';
        followBtn.classList.toggle('is-following', isFollowing);
      } catch (_e) {
        showToast('요청에 실패했습니다', { variant: 'error' });
      } finally {
        followBtn.disabled = false;
      }
    });
  }

  // ---- Load live list for swipe navigation ----
  (async () => {
    try {
      const lives = await api.getLives();
      if (Array.isArray(lives) && lives.length > 0) {
        _liveList = lives;
        _liveIndex = lives.findIndex(l => String(l.id) === String(liveId));
        if (_liveIndex < 0) _liveIndex = 0;
      }
    } catch (_e) {
      // fallback: no swipe list
    }
  })();

  // ---- Swipe navigation ----
  // 규칙: 채팅영역 → 횡스크롤 허용(내비게이션 무시)
  //       그 외 영역 → 수직 스와이프만, 다음/이전 라이브 이동
  let _tsX = 0, _tsY = 0;
  let _tsTarget = null;
  let _swipeDir = null; // 'h' | 'v' | null

  function _onTouchStart(e) {
    _tsX = e.touches[0].clientX;
    _tsY = e.touches[0].clientY;
    _tsTarget = e.target;
    _swipeDir = null;
  }

  function _onTouchMove(e) {
    if (_swipeDir) return;
    const dx = Math.abs(e.touches[0].clientX - _tsX);
    const dy = Math.abs(e.touches[0].clientY - _tsY);
    if (dx > 6 || dy > 6) _swipeDir = dx > dy ? 'h' : 'v';
  }

  function _onTouchEnd(e) {
    // 채팅 영역: 횡스크롤만 허용, 내비게이션 무시
    if (_tsTarget && _tsTarget.closest('.live-buyer__chat-wrap')) return;

    // 바텀 패널(상품정보·입찰·채팅입력·이모지) 무시
    if (_tsTarget && _tsTarget.closest('.lb-bottom')) return;

    // 수평 스와이프는 내비게이션 무시
    if (_swipeDir !== 'v') return;

    const deltaY = e.changedTouches[0].clientY - _tsY;
    if (deltaY < -100) {
      const next = _liveList[_liveIndex + 1];
      if (next) navigate(`/app/live-buyer/${next.id}`);
    } else if (deltaY > 100) {
      const prev = _liveList[_liveIndex - 1];
      if (prev) navigate(`/app/live-buyer/${prev.id}`);
    }
  }

  page.addEventListener('touchstart', _onTouchStart, { passive: true });
  page.addEventListener('touchmove', _onTouchMove, { passive: true });
  page.addEventListener('touchend', _onTouchEnd, { passive: true });

  // ---- Product sheet ----
  function openProductSheet(initialTab = 'history') {
    if (page.querySelector('.product-sheet-backdrop')) return; // 중복 방지
    const backdrop = document.createElement('div');
    backdrop.className = 'product-sheet-backdrop';
    backdrop.dataset.theme = 'light';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const liveTitleEl = page.querySelector('#lb-seller-sub');
    const liveTitle = (liveTitleEl && liveTitleEl.textContent) || '라이브';

    backdrop.innerHTML = `
      <div class="product-sheet">
        <div class="product-sheet__header">
          <span class="product-sheet__title">라이브중인 상품</span>
          <button class="product-sheet__close-x" aria-label="닫기">✕</button>
        </div>
        <div class="product-sheet__tabs">
          <button class="product-sheet__tab" data-tab="info">${escapeHtml(liveTitle)}</button>
          <button class="product-sheet__tab is-active" data-tab="products">
            진행중 <span class="product-sheet__badge" id="ps-product-count">0</span>
          </button>
          <button class="product-sheet__tab" data-tab="sold">경매 결과</button>
          <button class="product-sheet__tab" data-tab="history">내 구매내역</button>
        </div>
        <div class="product-sheet__content" id="ps-content"></div>
        <div class="product-sheet__notice">
          판매 후 개봉(브레이크) 상품은 반품 및 환불이 불가합니다.
        </div>
        <button class="product-sheet__close-btn">닫기</button>
      </div>
    `;

    const sheet = backdrop.querySelector('.product-sheet');
    const content = backdrop.querySelector('#ps-content');
    const badgeEl = backdrop.querySelector('#ps-product-count');

    // Tab switching
    let activeTab = 'products';
    function renderTab(tab) {
      activeTab = tab;
      backdrop.querySelectorAll('.product-sheet__tab').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.tab === tab);
      });
      content.innerHTML = '';

      if (tab === 'products') {
        if (currentAuction) {
          if (badgeEl) badgeEl.textContent = '1';
          const imgUrl = currentAuction.imageUrl || currentAuction.thumbUrl || '';
          const price = (currentAuction.currentPrice || currentAuction.startPrice || 0).toLocaleString();
          content.innerHTML = `
            <div class="ps-product-row">
              ${imgUrl ? `<img class="ps-product-thumb" src="${escapeHtml(imgUrl)}" alt="" />` : '<div class="ps-product-thumb ps-product-thumb--empty"></div>'}
              <div class="ps-product-info">
                <div class="ps-product-name">${escapeHtml(currentAuction.productName || '')}</div>
                <div class="ps-product-price">${price}원</div>
              </div>
            </div>
          `;
        } else {
          if (badgeEl) badgeEl.textContent = '0';
          content.innerHTML = '<div class="ps-empty">현재 진행 중인 상품이 없습니다.</div>';
        }
      } else if (tab === 'sold') {
        // 경매 결과: 이번 방송의 모든 종료 경매. 내가 낙찰한 건 강조 표시.
        if (endedAuctions.length === 0) {
          content.innerHTML = '<div class="ps-empty">아직 종료된 경매가 없습니다.</div>';
        } else {
          const myId = String(user.id);
          const myName = user.nickname || user.username;
          const rows = endedAuctions.slice().reverse().map(a => {
            const isVoid = !a.winnerName;
            const winner = escapeHtml(a.winnerName || '—');
            const name = escapeHtml(a.productName || '-');
            const price = (a.finalPrice || a.currentPrice || 0).toLocaleString();
            const ts = a.endedAt ? new Date(a.endedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
            const iMeWon = !isVoid && (
              (String(a.winnerId || a.winner || '') === myId) ||
              ((a.winnerName || '') === myName)
            );
            const thumbSrc = a.imageUrl || '';
            const thumbHtml = thumbSrc
              ? `<img class="ps-sold-thumb" src="${escapeHtml(thumbSrc)}" alt="" />`
              : `<div class="ps-sold-thumb ps-sold-thumb--empty">${isVoid ? '—' : winner.charAt(0)}</div>`;
            return `
              <div class="ps-sold-row${iMeWon ? ' ps-sold-row--mine' : ''}">
                ${thumbHtml}
                <div class="ps-sold-info">
                  <div class="ps-sold-name">${name}${iMeWon ? ' <span class="ps-won-badge">낙찰</span>' : ''}</div>
                  <div class="ps-sold-meta">${isVoid ? '유찰' : `${winner} · ${price}원`}${ts ? ` · ${ts}` : ''}</div>
                </div>
              </div>
            `;
          }).join('');
          content.innerHTML = rows;
        }
      } else if (tab === 'history') {
        // 실시간 로컬 구매 내역이 있으면 즉시 렌더, 동시에 API도 조회
        if (myPurchases.length > 0) {
          const rows = myPurchases.slice().reverse().map(b => {
            const name = escapeHtml(b.productName || '-');
            const price = (b.finalPrice || 0).toLocaleString();
            const ts = b.createdAt ? new Date(b.createdAt).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
            return `<div class="ps-history-row"><div class="ps-history-info"><div class="ps-history-name">${name}</div><div class="ps-history-meta">${price}원${ts ? ` · ${ts}` : ''}</div></div></div>`;
          }).join('');
          content.innerHTML = rows;
        } else {
          content.innerHTML = '<div class="ps-empty ps-empty--loading">불러오는 중...</div>';
        }
        // 실시간 데이터와 API 데이터를 합쳐 표시
        (async () => {
          let apiItems = [];
          try {
            const token = await api.getToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/bids`, { headers });
            if (res.ok) apiItems = (await res.json()) || [];
          } catch (_e) { /* API 실패 시 로컬 데이터만 사용 */ }

          // 로컬 + API 병합 (로컬 우선, 최신순)
          const localItems = myPurchases.map(p => ({
            productName: p.productName,
            finalPrice: p.finalPrice,
            createdAt: p.createdAt,
            _local: true,
          }));
          // API에 이미 있는 항목은 로컬 캐시에서 제거 (중복 방지)
          const apiProductNames = new Set(apiItems.map(i => i.productName));
          const uniqueLocalItems = localItems.filter(i => !apiProductNames.has(i.productName));
          const combined = [...uniqueLocalItems, ...apiItems].sort((a, b) => {
            return (new Date(b.createdAt || b.bidAt || 0).getTime()) - (new Date(a.createdAt || a.bidAt || 0).getTime());
          });

          if (combined.length === 0) {
            content.innerHTML = '<div class="ps-empty">구매 내역이 없습니다.</div>';
            return;
          }
          content.innerHTML = combined.map(b => {
            const name = escapeHtml(b.productName || b.auctionName || '-');
            const price = (b.finalPrice || b.price || 0).toLocaleString();
            const ts = b.createdAt
              ? new Date(b.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
              : '';
            const imgSrc = b.imageUrl || b.image_url || '';
            const imgHtml = imgSrc
              ? `<img class="ps-history-thumb" src="${escapeHtml(imgSrc)}" alt="" />`
              : `<div class="ps-history-thumb ps-history-thumb--empty"></div>`;
            return `
              <div class="ps-history-row">
                ${imgHtml}
                <div class="ps-history-info">
                  <div class="ps-history-name">${name}</div>
                  ${ts ? `<div class="ps-history-meta">${ts}</div>` : ''}
                </div>
                <div class="ps-history-price">${price}원</div>
              </div>
            `;
          }).join('');
        })();
      } else if (tab === 'info') {
        const nameEl = page.querySelector('#lb-seller-name');
        const sellerName = (nameEl && nameEl.textContent) || '판매자';
        content.innerHTML = `
          <div class="ps-info-block">
            <div class="ps-info-title">${escapeHtml(liveTitle)}</div>
            <div class="ps-info-seller">판매자: ${escapeHtml(sellerName)}</div>
            <div class="ps-info-notice">판매 후 개봉(브레이크) 상품은 반품 및 환불이 불가합니다.<br>상품 상태는 라이브 방송에서 직접 확인하세요.</div>
          </div>
        `;
      }
    }

    renderTab(initialTab);

    backdrop.querySelectorAll('.product-sheet__tab').forEach(btn => {
      btn.addEventListener('click', () => renderTab(btn.dataset.tab));
    });

    function closeSheet() {
      backdrop.classList.remove('is-open');
      setTimeout(() => backdrop.remove(), 220);
    }

    backdrop.querySelector('.product-sheet__close-x').addEventListener('click', closeSheet);
    backdrop.querySelector('.product-sheet__close-btn').addEventListener('click', closeSheet);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeSheet();
    });

    // page에 append해야 body reflow 없이 화면 밀림 방지
    page.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('is-open'));
  }

  // ---- Delivery address gate — deferred until page is in DOM ----
  // showDeliveryGate must NOT be awaited here: load() must return page first
  // so the router can insert it into #app-root. We defer the check with rAF.
  requestAnimationFrame(async () => {
    try {
      const freshUser = await api.getUser(user.id).catch(() => null);
      if (freshUser && !freshUser.hasDeliveryAddress) {
        const appRoot = document.getElementById('app-root') || page;
        const proceed = await showDeliveryGate(appRoot, user.id);
        if (!proceed) navigate('/app/home');
      }
    } catch (_e) {
      // gate check failure must not block live entry
    }
  });

  // ---- Socket ----
  let socket = null;
  let room = null;
  const unsubFns = [];

  // ---- LiveKit connect ----
  let livekitMod = null;
  try {
    livekitMod = await import('/app/scripts/livekit.js').catch(() => null);
  } catch {
    livekitMod = null;
  }

  try {
    const { token, serverUrl } = await api.getLiveToken({
      roomName: liveId,
      userId: String(user.id),
      role: 'buyer',
    });

    if (livekitMod) {
      room = await livekitMod.connectRoom({ url: serverUrl, token });
      const unsubRemote = livekitMod.attachRemoteTracks(room, videoEl);
      if (typeof unsubRemote === 'function') unsubFns.push(unsubRemote);
    }
    hideOverlay();
  } catch (err) {
    let errMsg = err.message || String(err);
    // getUserMedia / mediaDevices 오류 → 비보안 컨텍스트 안내
    if (
      errMsg.includes('getUserMedia') ||
      errMsg.includes('mediaDevices') ||
      err?.name === 'TypeError'
    ) {
      errMsg = 'HTTPS 또는 localhost 접속이 필요합니다 (현재 HTTP 불가)';
    } else if (livekitMod && livekitMod.classifyConnectError) {
      errMsg = livekitMod.classifyConnectError(err).message;
    }
    showToast('연결 오류: ' + errMsg, { variant: 'error' });
    setOverlayText('연결 실패: ' + errMsg);
    hideOverlay();
  }

  // ---- Socket connection ----
  socket = Sock.connect();
  const _buyerName = user.nickname || user.username || '시청자';
  // 초기 연결 + 재연결 시 모두 룸 재입장
  socket.on('connect', () => {
    Sock.identifyUser(socket, user.id);
    Sock.joinRoom(socket, liveId, String(user.id), _buyerName);
  });

  const unsubAuctionUpdate = Sock.onAuctionUpdate(socket, (auction) => {
    updateAuctionUI(auction);
  });
  const unsubAuctionNew = Sock.onAuctionNew(socket, ({ productName, mode }) => {
    const modeLabel = mode === 'giveaway' ? '무료나눔' : mode === 'blind' ? '블라인드' : mode === 'fcfs' ? '선착순' : '경매';
    showToast(`🛒 새 ${modeLabel} 시작: ${productName || ''}`, { variant: 'info', duration: 4000 });
  });
  const unsubAuctionEnded = Sock.onAuctionEnded(socket, (auction) => {
    endedAuctions.push({ ...auction, endedAt: auction.endedAt || Date.now() });

    // 낙찰 시 채팅에 시스템 메시지
    if (!auction.void && auction.winnerName) {
      const price = (auction.finalPrice || auction.currentPrice || 0).toLocaleString();
      chatOverlay.push({
        userId: 'system',
        userName: '시스템',
        message: `🏆 ${auction.productName ? auction.productName + ' · ' : ''}${auction.winnerName}님 ${price}원 낙찰`,
        system: true,
      });
    }

    // 내가 낙찰자이면 구매내역에도 추가
    const myDisplayName = user.nickname || user.username;
    const winnerId = String(auction.winnerId || auction.winner || '');
    const winnerName = auction.winnerName || auction.currentBidder || '';
    const iMeWon = (winnerId && winnerId === String(user.id)) ||
                   (winnerName && winnerName === myDisplayName);
    if (iMeWon && (auction.finalPrice || auction.currentPrice) && auction.mode !== 'fcfs') {
      myPurchases.push({
        productName: auction.productName || '',
        finalPrice: auction.finalPrice || auction.currentPrice || 0,
        createdAt: auction.endedAt || Date.now(),
      });
      const activeHistoryTab = document.querySelector('.product-sheet__tab.is-active[data-tab="history"]');
      if (activeHistoryTab) activeHistoryTab.click();
    }

    timer.el.style.display = 'none';
    const mode = auction.mode || currentMode;
    if (mode === 'blind') {
      if (blindBidComp) {
        blindBidComp.showResult(auction, async () => {
          const data = await api.getBlindBids(liveId, auction.id || currentAuctionId);
          return data?.bids || [];
        });
      } else {
        showWonOverlay(auction);
      }
    } else if (mode !== 'fcfs') {
      showWonOverlay(auction);
    }
    updateAuctionUI(null);
    if (buyButtonComp) buyButtonComp.disable('매진');
  });
  const unsubChat = Sock.onChatMessage(socket, (msg) => {
    const isSeller = _sellerId && String(msg.userId) === _sellerId;
    chatOverlay.push({ ...msg, isSeller });
  });
  const unsubViewers = Sock.onViewerCount(socket, ({ count }) => {
    const el = page.querySelector('#lb-viewer-count');
    if (el) el.textContent = String(count);
  });

  let _viewerNames = [];
  const unsubViewerList = Sock.onViewerList(socket, ({ viewers }) => {
    _viewerNames = viewers || [];
  });

  const unsubBlindBidCount = Sock.onBlindBidCount(socket, ({ count }) => {
    if (blindBidComp) blindBidComp.updateCount(count);
  });

  const unsubViewerJoin = Sock.onViewerJoin(socket, ({ userName }) => {
    if (!userName) return;
    chatOverlay.push({
      userId: 'system',
      userName: '시스템',
      message: `${userName}님이 입장했습니다.`,
      system: true,
    });
  });

  const unsubGiveawayCount = Sock.onGiveawayCount(socket, ({ auctionId, count, participants }) => {
    giveawayParticipants = participants || [];
    if (currentAuctionId && String(currentAuctionId) !== String(auctionId)) return;
    const countEl = page.querySelector('#lb-giveaway-count');
    if (countEl) countEl.textContent = `${count}명 참여 중`;
  });

  const unsubGiveawayJoinAck = Sock.onGiveawayJoinAck(socket, ({ ok, alreadyJoined, count, error }) => {
    if (!ok) {
      if (error === 'giveaway ended') showToast('무료나눔이 이미 종료되었습니다', { variant: 'error' });
      else showToast(error || '참여 실패', { variant: 'error' });
      return;
    }
    giveawayJoined = true;
    const joinBtn = page.querySelector('#lb-giveaway-btn');
    if (joinBtn) {
      joinBtn.disabled = true;
      joinBtn.textContent = '참여 완료!';
    }
    if (count != null) {
      const countEl = page.querySelector('#lb-giveaway-count');
      if (countEl) countEl.textContent = `${count}명 참여 중`;
    }
    if (!alreadyJoined) showToast('무료나눔에 참여했습니다! 🎁', { variant: 'success' });
  });

  function _openViewerModal(names) {
    const appRoot = document.getElementById('app-root') || page;
    const backdrop = document.createElement('div');
    backdrop.className = 'ls-viewer-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    const namesHtml = names.length
      ? names.map(n => `<li class="ls-viewer-modal__item">${escapeHtml(n)}</li>`).join('')
      : '<li class="ls-viewer-modal__empty">시청자가 없습니다</li>';
    backdrop.innerHTML = `
      <div class="ls-viewer-modal">
        <div class="ls-viewer-modal__header">
          <span class="ls-viewer-modal__title">시청자 목록 (${names.length}명)</span>
          <button class="ls-viewer-modal__close" aria-label="닫기">✕</button>
        </div>
        <ul class="ls-viewer-modal__list">${namesHtml}</ul>
      </div>
    `;
    appRoot.appendChild(backdrop);
    backdrop.querySelector('.ls-viewer-modal__close').addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  }

  page.querySelector('#lb-viewers-btn').addEventListener('click', () => {
    let _fired = false;
    const offOnce = Sock.onViewerList(socket, ({ viewers }) => {
      if (_fired) return;
      _fired = true;
      offOnce();
      _viewerNames = viewers || [];
      _openViewerModal(_viewerNames);
    });
    Sock.requestViewerList(socket, liveId);
    // Fallback: open with cached data if server doesn't respond within 300ms
    setTimeout(() => { if (!_fired) { _fired = true; offOnce(); _openViewerModal(_viewerNames); } }, 300);
  });

  const unsubPurchaseMade = Sock.onPurchaseMade(socket, ({ userName, userId: buyerId, price }) => {
    const priceStr = (price || currentAuction?.currentPrice || 0).toLocaleString('ko-KR');
    chatOverlay.push({
      userName: '시스템',
      message: `${userName}님이 ${priceStr}원에 구매하였습니다.`,
      system: true,
    });
    if (buyButtonComp && currentAuction) {
      clearTimeout(buyReenableTimer);
      currentAuction.stockSold = (currentAuction.stockSold || 0) + 1;
      buyButtonComp.update(currentAuction.stockTotal || 0, currentAuction.stockSold);
    }
    // 내가 구매한 경우 → myPurchases에 즉시 추가 + 시트 갱신
    const myId = String(user.id);
    const myName = user.nickname || user.username;
    const isMine = buyerId ? String(buyerId) === myId : userName === myName;
    if (isMine && currentAuction) {
      myPurchases.push({
        productName: currentAuction.productName || '',
        finalPrice: currentAuction.currentPrice || currentAuction.startPrice || 0,
        createdAt: Date.now(),
      });
      // 시트가 열려 있고 history 탭이 활성이면 갱신
      const activeHistoryTab = document.querySelector('.product-sheet__tab.is-active[data-tab="history"]');
      if (activeHistoryTab) activeHistoryTab.click();
    }
  });
  const unsubBidBlindAck = Sock.onBidBlindAck(socket, (data) => {
    if (blindBidComp) blindBidComp.ack(data?.price);
  });
  const unsubBidRejected = Sock.onBidRejected(socket, ({ reason } = {}) => {
    showToast(reason || '입찰이 거부되었습니다', { variant: 'error' });
  });

  const unsubLiveEnded = Sock.onLiveEnded(socket, () => {
    // 기존 입찰 UI 제거
    updateAuctionUI(null);

    // 방송 종료 안내 오버레이 표시
    const endCard = document.createElement('div');
    endCard.className = 'live-ended-overlay';
    endCard.innerHTML = `
      <div class="live-ended-card">
        <div class="live-ended-icon">📺</div>
        <div class="live-ended-title">방송이 종료되었습니다</div>
        <div class="live-ended-desc">판매자가 라이브를 종료했습니다</div>
        <button class="live-ended-btn" id="live-ended-confirm">홈으로 돌아가기</button>
      </div>
    `;
    page.appendChild(endCard);

    endCard.querySelector('#live-ended-confirm').addEventListener('click', () => {
      navigate('/app/home');
    });

    // 10초 후 자동 이동
    setTimeout(() => {
      if (document.contains(endCard)) navigate('/app/home');
    }, 10000);
  });

  const unsubEmoji = Sock.onEmojiReaction(socket, ({ emoji }) => {
    spawnFloatingEmoji(emoji);
  });

  unsubFns.push(
    unsubAuctionUpdate, unsubAuctionNew, unsubAuctionEnded, unsubChat, unsubViewers, unsubViewerList,
    unsubBlindBidCount, unsubGiveawayCount, unsubGiveawayJoinAck, unsubViewerJoin,
    unsubPurchaseMade, unsubBidBlindAck, unsubBidRejected, unsubLiveEnded,
    unsubEmoji,
  );

  // ---- Event listeners ----
  page.querySelector('#lb-back-btn').addEventListener('click', () => window.history.back());

  // Mute toggle
  const muteBtn = page.querySelector('#lb-mute-btn');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      videoEl.muted = !videoEl.muted;
      const muteLabel = page.querySelector('#lb-mute-label');
      if (muteLabel) muteLabel.textContent = videoEl.muted ? '음소거' : '소리 켜짐';
      muteBtn.textContent = videoEl.muted ? '🔇' : '🔊';
    });
  }

  // Share button
  function doShare() {
    if (navigator.share) {
      navigator.share({ title: 'NH바로Farm 라이브', url: location.href }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(location.href).then(() => {
        showToast('링크가 복사되었습니다', { variant: 'info' });
      }).catch(() => {});
    }
  }
  const shareBtnBottom = page.querySelector('#lb-share-btn2');
  if (shareBtnBottom) shareBtnBottom.addEventListener('click', doShare);

  // Heart (like) button — 이모지 바와 동일하게 ❤️ 리액션 전송 + 로컬 피드백
  const heartBtn = page.querySelector('#lb-heart-btn');
  if (heartBtn) {
    heartBtn.addEventListener('click', () => {
      if (!socket) return;
      Sock.sendEmojiReact(socket, {
        liveId,
        emoji: '❤️',
        userId: String(user.id),
        userName: user.nickname || user.username || '익명',
      });
      spawnFloatingEmoji('❤️');
    });
  }

  // Products button
  page.querySelector('#lb-products-btn').addEventListener('click', () => openProductSheet('history'));

  // Emoji reaction bar
  page.querySelector('#lb-emoji-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('.lb-emoji-btn');
    if (!btn || !socket) return;
    Sock.sendEmojiReact(socket, {
      liveId,
      emoji: btn.dataset.emoji,
      userId: String(user.id),
      userName: user.nickname || user.username || '익명',
    });
  });

  // Giveaway join button
  const giveawayBtn = page.querySelector('#lb-giveaway-btn');
  if (giveawayBtn) {
    giveawayBtn.addEventListener('click', () => {
      if (giveawayJoined) return;
      if (!currentAuctionId || currentMode !== 'giveaway') {
        showToast('진행 중인 무료나눔이 없습니다', { variant: 'error' });
        return;
      }
      Sock.joinGiveaway(socket, {
        liveId,
        auctionId: currentAuctionId,
        userId: String(user.id),
        userName: user.nickname || user.username || '익명',
      });
    });
  }

  // Chat input
  const chatInput = page.querySelector('#lb-chat-input');

  function sendChatMsg() {
    const msg = chatInput.value.trim();
    if (!msg || !socket) return;
    Sock.sendChat(socket, liveId, String(user.id), msg, user.nickname || user.username || '시청자');
    chatInput.value = '';
  }

  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) sendChatMsg(); });

  // Wire chat-overlay input row to the same sendChat logic
  chatOverlay.onSend((text) => {
    if (!socket) return;
    Sock.sendChat(socket, liveId, String(user.id), text, user.nickname || user.username || '시청자');
  });

  // ---- Cleanup ----
  setCleanup(async () => {
    unsubFns.forEach((fn) => typeof fn === 'function' && fn());
    page.removeEventListener('touchstart', _onTouchStart);
    page.removeEventListener('touchmove', _onTouchMove);
    page.removeEventListener('touchend', _onTouchEnd);
    if (socket) socket.disconnect();
    if (room && livekitMod) await livekitMod.disconnect(room, []).catch(() => {});
    if (videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    }
    clearTimeout(buyReenableTimer);
    timer.destroy();
    chatOverlay.destroy();
    if (slideBidComp) { slideBidComp.destroy(); slideBidComp = null; }
    if (buyButtonComp) buyButtonComp.destroy();
    if (blindBidComp) blindBidComp.destroy();
  });

  return page;
}

/* ─── Delivery address gate ─────────────────────────────────────────
 * 배송지가 등록되지 않은 사용자가 라이브 입장 시 강제 표시.
 * resolve(true)  → 등록 완료, 라이브 진입 진행
 * resolve(false) → 뒤로가기, 진입 중단 (홈으로 이동)
 */
function showDeliveryGate(container, userId) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'live-delivery-gate';
    overlay.style.cssText =
      'position:absolute;inset:0;background:var(--color-bg);z-index:100;' +
      'overflow-y:auto;padding:var(--space-6) var(--space-4);' +
      'font-family:var(--font-body);color:var(--color-ink);';

    overlay.innerHTML = `
      <div style="text-align:center;margin-bottom:var(--space-6)">
        <div style="font-size:48px;margin-bottom:var(--space-3)">🏠</div>
        <div style="font-family:var(--font-display);font-size:20px;font-weight:800;color:var(--color-ink);margin-bottom:var(--space-2)">배송 주소 등록 필요</div>
        <div style="font-size:14px;color:var(--color-ink-soft);line-height:1.6">라이브 참여 전 배송 주소를 등록해주세요.<br>낙찰 시 이 주소로 배송됩니다.</div>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--space-3);max-width:480px;margin:0 auto">
        <label style="display:flex;flex-direction:column;gap:var(--space-1);font-size:var(--fs-sm);color:var(--color-ink-soft)">
          수령인 이름
          <input type="text" name="deliveryName" placeholder="홍길동"
            style="background:var(--color-surface-alt);border:1px solid var(--color-line);border-radius:var(--radius-md);padding:10px 12px;color:var(--color-ink);font-size:14px;font-family:var(--font-body)" />
        </label>

        <label style="display:flex;flex-direction:column;gap:var(--space-1);font-size:var(--fs-sm);color:var(--color-ink-soft)">
          연락처
          <input type="tel" name="deliveryPhone" placeholder="010-0000-0000"
            style="background:var(--color-surface-alt);border:1px solid var(--color-line);border-radius:var(--radius-md);padding:10px 12px;color:var(--color-ink);font-size:14px;font-family:var(--font-body)" />
        </label>

        <label style="display:flex;flex-direction:column;gap:var(--space-1);font-size:var(--fs-sm);color:var(--color-ink-soft)">
          우편번호
          <div style="display:flex;gap:var(--space-2)">
            <input type="text" name="deliveryZipcode" placeholder="우편번호" inputmode="numeric" readonly
              style="flex:1;background:var(--color-surface-alt);border:1px solid var(--color-line);border-radius:var(--radius-md);padding:10px 12px;color:var(--color-ink);font-size:14px;font-family:var(--font-body)" />
            <button type="button" data-action="zipSearch"
              style="padding:10px 14px;background:var(--color-surface-alt);border:1px solid var(--color-line);border-radius:var(--radius-md);color:var(--color-ink-soft);font-size:13px;font-family:var(--font-body);white-space:nowrap;cursor:pointer">
              검색
            </button>
          </div>
        </label>

        <label style="display:flex;flex-direction:column;gap:var(--space-1);font-size:var(--fs-sm);color:var(--color-ink-soft)">
          도로명 주소
          <input type="text" name="deliveryAddress" placeholder="도로명 주소" readonly
            style="background:var(--color-surface-alt);border:1px solid var(--color-line);border-radius:var(--radius-md);padding:10px 12px;color:var(--color-ink);font-size:14px;font-family:var(--font-body)" />
        </label>

        <label style="display:flex;flex-direction:column;gap:var(--space-1);font-size:var(--fs-sm);color:var(--color-ink-soft)">
          상세주소 (선택)
          <input type="text" name="deliveryDetail" placeholder="동 · 호수 · 건물명 등"
            style="background:var(--color-surface-alt);border:1px solid var(--color-line);border-radius:var(--radius-md);padding:10px 12px;color:var(--color-ink);font-size:14px;font-family:var(--font-body)" />
        </label>

        <button type="button" data-action="submit" disabled
          style="margin-top:var(--space-3);padding:14px;background:var(--color-accent);color:var(--color-bg);border:none;border-radius:var(--radius-md);font-size:14px;font-weight:700;font-family:var(--font-body);cursor:pointer;opacity:0.55">
          등록하고 입장하기
        </button>

        <button type="button" data-action="cancel"
          style="padding:12px;background:transparent;color:var(--color-ink-soft);border:1px solid var(--color-line);border-radius:var(--radius-md);font-size:14px;font-family:var(--font-body);cursor:pointer">
          뒤로가기
        </button>
      </div>
    `;

    container.appendChild(overlay);

    const nameInput   = overlay.querySelector('input[name="deliveryName"]');
    const phoneInput  = overlay.querySelector('input[name="deliveryPhone"]');
    const zipcodeInput = overlay.querySelector('input[name="deliveryZipcode"]');
    const addrInput   = overlay.querySelector('input[name="deliveryAddress"]');
    const detailInput = overlay.querySelector('input[name="deliveryDetail"]');
    const zipSearchBtn = overlay.querySelector('button[data-action="zipSearch"]');
    const submitBtn   = overlay.querySelector('button[data-action="submit"]');
    const cancelBtn   = overlay.querySelector('button[data-action="cancel"]');

    // 카카오 우편번호 검색
    zipSearchBtn.addEventListener('click', async () => {
      try {
        const { openKakaoPostcode } = await import('/app/scripts/kakao-postcode.js');
        await openKakaoPostcode(({ zipcode, address, buildingName }) => {
          zipcodeInput.value = zipcode;
          addrInput.value = address;
          if (buildingName && !detailInput.value) detailInput.value = buildingName;
          recompute();
          detailInput.focus();
        });
      } catch {
        showToast('주소 검색을 불러오지 못했습니다. 직접 입력해주세요.', { duration: 2200 });
      }
    });

    function recompute() {
      const ok =
        nameInput.value.trim() &&
        phoneInput.value.trim() &&
        addrInput.value.trim();
      submitBtn.disabled = !ok;
      submitBtn.style.opacity = ok ? '1' : '0.55';
      submitBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
    }
    [nameInput, phoneInput, addrInput].forEach((el) => {
      el.addEventListener('input', recompute);
    });

    submitBtn.addEventListener('click', async () => {
      if (submitBtn.disabled) return;
      submitBtn.disabled = true;
      submitBtn.textContent = '저장 중...';
      try {
        await api.updateProfile(userId, {
          deliveryName:    nameInput.value.trim(),
          deliveryPhone:   phoneInput.value.trim(),
          deliveryZipcode: zipcodeInput.value.trim(),
          deliveryAddress: addrInput.value.trim(),
          deliveryDetail:  detailInput.value.trim(),
        });
        showToast('배송 주소가 등록되었습니다', { variant: 'success', duration: 1800 });
        overlay.remove();
        resolve(true);
      } catch (err) {
        const msg = err?.message || '저장에 실패했습니다';
        showToast(msg, { variant: 'error', duration: 2400 });
        submitBtn.disabled = false;
        submitBtn.textContent = '등록하고 입장하기';
        recompute();
      }
    });

    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    // 자동 포커스
    setTimeout(() => nameInput.focus(), 50);
  });
}
