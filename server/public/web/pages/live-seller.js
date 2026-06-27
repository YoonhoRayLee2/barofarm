/**
 * Live Seller Page — 3-W19
 * Full-screen seller broadcast UI with auction management.
 *
 * LiveKit room.connect() is handled exclusively by livekit.js helpers.
 * This module owns layout, socket events, and auction controls only.
 *
 * @module pages/live-seller
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { requestCameraPermission, requestMicPermission } from '/app/scripts/native-bridge.js';
import { replace, navigate, setCleanup } from '/app/scripts/router.js';
import * as api from '/app/scripts/api.js';
import { endFcfsAuction } from '/app/scripts/api.js';
import * as Sock from '/app/scripts/socket.js';
import { createTimer } from '/app/components/timer.js';
import { createChatOverlay } from '/app/components/chat-overlay.js';
import { showConfirmDialog } from '/app/components/confirm-dialog.js';
import { showToast as _globalToast } from '/app/components/toast.js';
import { personIconSVG } from '/app/scripts/person-icon.js';

// Inject page CSS once
const _cssId = 'page-css-live-seller';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/live-seller.css';
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

  // ---- Build page shell ----
  const page = document.createElement('div');
  page.className = 'live-seller';
  page.dataset.theme = 'light';

  // Video element
  const videoEl = document.createElement('video');
  videoEl.className = 'live-seller__video';
  videoEl.autoplay = true;
  videoEl.muted = true;
  videoEl.playsInline = true;
  page.appendChild(videoEl);

  // Top bar
  const topBar = document.createElement('div');
  topBar.className = 'live-seller__topbar';
  topBar.innerHTML = `
    <div class="ls-host">
      <div class="ls-avatar" id="ls-seller-avatar"></div>
      <div class="ls-host-info">
        <div class="ls-host-name" id="ls-seller-name">판매자</div>
        <div class="ls-host-sub" id="ls-live-title"></div>
      </div>
    </div>
    <div class="ls-top-right" id="ls-cam-controls">
      <div class="lb-live-badge"><span class="dot"></span>LIVE</div>
      <button class="ls-viewer-chip ls-viewer-chip--icon" id="ls-viewers" aria-label="시청자 목록">
        👁 <span id="ls-viewer-count">0</span>
      </button>
      <button class="ls-ctrl-btn" id="ls-flip-btn" title="카메라 전환">🔄</button>
      <button class="ls-ctrl-btn" id="ls-mic-btn" title="마이크">🎙</button>
      <button class="ls-ctrl-btn ls-ctrl-btn--danger" id="ls-end-btn" title="방송 종료">✕</button>
    </div>
  `;
  page.appendChild(topBar);

  // Toast notifications are handled by the global showToast() component.

  // Chat overlay wrapper — positioned above bottom panel (set dynamically via JS)
  const chatWrap = document.createElement('div');
  chatWrap.className = 'live-seller__chat-wrap';
  page.appendChild(chatWrap);

  // Bottom panel
  const bottomPanel = document.createElement('div');
  bottomPanel.className = 'live-seller__bottom';
  bottomPanel.innerHTML = `
    <div class="live-seller__auction-card is-hidden" id="ls-auction-info">
      <div class="live-seller__no-auction" id="ls-no-auction">경매를 등록하세요</div>
      <div class="ls-mode-row is-hidden" id="ls-mode-row">
        <span class="ls-mode-chip" id="ls-mode-chip"></span>
      </div>
      <div class="live-seller__product-block is-hidden" id="ls-product-block">
        <img class="ls-product-thumb is-hidden" id="ls-product-thumb" src="" alt="" />
        <div class="ls-product-text">
          <div class="live-seller__product-name" id="ls-product-name"></div>
          <div class="live-seller__current-price" id="ls-current-price"></div>
          <div class="live-seller__bidder" id="ls-bidder"></div>
        </div>
      </div>
      <div class="ls-timer-bar-wrap is-hidden" id="ls-timer-wrap">
        <span class="ls-timer-label" id="ls-timer-label">30</span>
        <div class="ls-timer-track">
          <div class="ls-timer-fill" id="ls-timer-fill"></div>
        </div>
      </div>
    </div>
    <div class="live-seller__actions">
      <button class="live-seller__send-btn" id="ls-sold-btn">판매내역</button>
      <input class="live-seller__chat-input" id="ls-chat-input" type="text" placeholder="시청자에게 한마디" maxlength="100" autocomplete="off" />
      <button class="live-seller__auction-btn" id="ls-auction-btn">🔨 경매 추가</button>
    </div>
  `;
  page.appendChild(bottomPanel);

  // Timer wrap reference (now embedded directly in innerHTML)
  const timerWrap = bottomPanel.querySelector('#ls-timer-wrap');

  // Track auction duration for fill-ratio calculation
  let _auctionDurationSec = 30;

  function updateTimerBar(timeLeft) {
    const label = timerWrap.querySelector('#ls-timer-label');
    const fill = timerWrap.querySelector('#ls-timer-fill');
    if (!label || !fill) return;
    label.textContent = String(Math.ceil(timeLeft));
    const pct = Math.min(100, Math.max(0, (timeLeft / _auctionDurationSec) * 100));
    fill.style.width = pct + '%';
    if (timeLeft <= 10) {
      fill.style.background = 'var(--color-cta)';
    } else {
      fill.style.background = 'var(--color-accent)';
    }
  }

  // Keep createTimer for its destroy() cleanup but don't render its element
  const timer = createTimer({ initialRemaining: 30 });
  timer.el.classList.add('is-hidden');

  // Loading overlay
  const overlay = document.createElement('div');
  overlay.className = 'live-seller__overlay';
  overlay.innerHTML = `
    <div class="live-seller__spinner"></div>
    <div class="live-seller__overlay-text" id="ls-overlay-text">연결 중...</div>
  `;
  page.appendChild(overlay);

  // ---- Chat overlay component ----
  const chatOverlay = createChatOverlay();
  chatWrap.appendChild(chatOverlay.el);

  // ---- Helpers ----
  function showToast(msg, kind = 'info') {
    // Delegate to global toast component
    _globalToast(msg, { variant: kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info' });
  }

  function setOverlayText(text) {
    const el = page.querySelector('#ls-overlay-text');
    if (el) el.textContent = text;
  }

  function hideOverlay() {
    overlay.classList.add('is-hidden');
  }

  function showCameraNoiseOverlay() {
    let el = page.querySelector('.ls-noise-overlay');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ls-noise-overlay';
      el.innerHTML = `
        <div class="ls-noise-scanlines"></div>
        <div class="ls-noise-msg">
          <span class="ls-noise-icon">📡</span>
          <span class="ls-noise-title">화면 신호가 불안정해요</span>
          <span class="ls-noise-sub">카메라 연결을 확인하는 중...</span>
        </div>`;
      // insert after videoEl so it overlays it, but before topbar/panels
      videoEl.insertAdjacentElement('afterend', el);
    }
    el.classList.remove('is-hidden');
  }

  function hideCameraNoiseOverlay() {
    const el = page.querySelector('.ls-noise-overlay');
    if (el) el.classList.add('is-hidden');
  }

  function showOverlay(text) {
    setOverlayText(text || '연결 중...');
    overlay.classList.remove('is-hidden');
  }

  /** @type {null | import('/app/scripts/socket.js').default} */
  let socket = null;
  /** @type {null | any} */
  let room = null;
  /** @type {any[]} */
  let localTracks = [];
  const unsubFns = [];

  // ---- LiveKit module preload ----
  let livekitMod = null;
  try {
    // Attempt to load livekit helper (may not yet exist in parallel build)
    livekitMod = await import('/app/scripts/livekit.js').catch(() => null);
  } catch {
    livekitMod = null;
  }

  async function connectLivekit(overrideToken = null, overrideServerUrl = null) {
    try {
      // Request native permissions (noop on web)
      await requestCameraPermission();
      await requestMicPermission();

      let token = overrideToken;
      let serverUrl = overrideServerUrl;

      if (!token) {
        const result = await api.getLiveToken({
          roomName: liveId,
          userId: String(user.id),
          role: 'seller',
        });
        token = result.token;
        serverUrl = result.serverUrl;
      }

      if (livekitMod) {
        room = await livekitMod.connectRoom({ url: serverUrl, token });
        let cameraOk = false;
        try {
          const published = await livekitMod.publishCamera(room);
          localTracks = [published.cameraTrack, published.micTrack].filter(Boolean);
          livekitMod.attachLocalVideo(room, videoEl);
          cameraOk = true;
          hideCameraNoiseOverlay();
        } catch (camErr) {
          if (camErr.cameraFailed) {
            console.warn('[live-seller] camera completely failed, showing noise overlay');
            showCameraNoiseOverlay();
          } else {
            throw camErr;
          }
        }
      } else {
        // Fallback: getUserMedia directly for browser preview
        if (!window.isSecureContext || !navigator.mediaDevices) {
          showToast('카메라 사용을 위해 HTTPS 또는 localhost 접속이 필요합니다', 'info');
          showCameraNoiseOverlay();
        } else {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            videoEl.srcObject = stream;
            hideCameraNoiseOverlay();
            // 마이크 토글 (getUserMedia 폴백 경로)
            const micBtnFb = document.getElementById('ls-mic-btn');
            if (micBtnFb) {
              micBtnFb.addEventListener('click', () => {
                const tracks = stream.getAudioTracks();
                if (!tracks.length) return;
                const nextOn = !tracks[0].enabled;
                tracks.forEach((t) => { t.enabled = nextOn; });
                micBtnFb.textContent = nextOn ? '🎙' : '🔇';
                micBtnFb.classList.toggle('is-muted', !nextOn);
                micBtnFb.title = nextOn ? '마이크' : '마이크 음소거됨';
              });
            }
          } catch (mediaErr) {
            console.warn('[live-seller] getUserMedia failed, showing noise overlay:', mediaErr?.name);
            showToast('카메라/마이크 접근 실패: ' + (mediaErr.message || mediaErr), 'error');
            showCameraNoiseOverlay();
          }
        }
      }

      hideOverlay();

      // ---- Camera controls (LiveKit only) ----
      if (livekitMod && room) {
        const camControls = document.getElementById('ls-cam-controls');
        if (camControls) camControls.style.display = '';

        const flipBtn = document.getElementById('ls-flip-btn');
        if (flipBtn && livekitMod.switchCamera) {
          flipBtn.addEventListener('click', async () => {
            flipBtn.disabled = true;
            try {
              await livekitMod.switchCamera(room);
              if (livekitMod.attachLocalVideo) livekitMod.attachLocalVideo(room, videoEl);
            } catch (err) {
              showToast('카메라 전환 실패: ' + (err.message || String(err)), 'error');
            } finally {
              flipBtn.disabled = false;
            }
          });
        }

        // 마이크 토글 (LiveKit 경로)
        const micBtn = document.getElementById('ls-mic-btn');
        if (micBtn && livekitMod.setMicrophoneEnabled) {
          let micOn = true;
          micBtn.addEventListener('click', async () => {
            micBtn.disabled = true;
            try {
              micOn = await livekitMod.setMicrophoneEnabled(room, !micOn);
              micBtn.textContent = micOn ? '🎙' : '🔇';
              micBtn.classList.toggle('is-muted', !micOn);
              micBtn.title = micOn ? '마이크' : '마이크 음소거됨';
            } catch (err) {
              showToast('마이크 전환 실패: ' + (err.message || String(err)), 'error');
            } finally {
              micBtn.disabled = false;
            }
          });
        }
      }
    } catch (err) {
      let errMsg = err.message || String(err);
      if (livekitMod && livekitMod.classifyConnectError) {
        const classified = livekitMod.classifyConnectError(err);
        errMsg = classified.message;
      }
      showToast('연결 오류: ' + errMsg, 'error');
      setOverlayText('연결 실패: ' + errMsg);
      // Still allow UI to show (page stays, overlay hidden so seller can see)
      hideOverlay();
    }
  }

  function renderUpcomingScreen(liveInfo) {
    const upOverlay = document.createElement('div');
    upOverlay.className = 'ls-upcoming-overlay';
    upOverlay.id = 'ls-upcoming-overlay';

    const scheduled = liveInfo?.scheduledAt
      ? new Date(liveInfo.scheduledAt).toLocaleString('ko-KR')
      : '시간 미정';

    upOverlay.innerHTML = `
      <div class="ls-upcoming-card">
        <button class="ls-upcoming-close" id="ls-upcoming-close" aria-label="닫기">✕</button>
        <div class="ls-upcoming-icon">📡</div>
        <h2 class="ls-upcoming-title">${escapeHtml(liveInfo?.title || '예약된 라이브')}</h2>
        <p class="ls-upcoming-time">${escapeHtml(scheduled)} 예정</p>
        <p class="ls-upcoming-desc">카메라와 마이크를 준비한 후<br>방송을 시작해 주세요.</p>
        <button class="ls-upcoming-start-btn" id="ls-go-live-btn">🔴 방송 시작하기</button>
      </div>
    `;

    page.appendChild(upOverlay);

    upOverlay.querySelector('#ls-upcoming-close').addEventListener('click', () => {
      upOverlay.remove();
      window.history.back();
    });

    upOverlay.querySelector('#ls-go-live-btn').addEventListener('click', async () => {
      const btn = upOverlay.querySelector('#ls-go-live-btn');
      btn.disabled = true;
      btn.textContent = '시작 중...';
      try {
        const result = await api.goLive(liveId, String(user.id));
        upOverlay.remove();
        showOverlay('연결 중...');
        await connectLivekit(result?.token || null, result?.serverUrl || null);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '🔴 방송 시작하기';
        showToast('방송 시작 실패: ' + (err.message || String(err)), 'error');
      }
    });
  }

  // ---- 라이브 상태 조회 후 분기 ----
  let liveInfo = null;
  try {
    liveInfo = await api.getLive(liveId);
  } catch {
    // 조회 실패 시 일단 진행 (메모리에 없어도 시도)
  }

  // 상단바 채우기: 판매자 닉네임 · 방송제목 · 아바타
  const sellerDisplayName = liveInfo?.sellerName || user.nickname || user.username || '판매자';
  const _nameEl = page.querySelector('#ls-seller-name');
  if (_nameEl) _nameEl.textContent = sellerDisplayName;
  const _titleEl = page.querySelector('#ls-live-title');
  if (_titleEl) _titleEl.textContent = liveInfo?.title || '라이브 방송 중';
  const _avatarEl = page.querySelector('#ls-seller-avatar');
  if (_avatarEl) {
    if (user.avatarUrl) {
      _avatarEl.innerHTML = `<img src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(sellerDisplayName)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
    } else {
      _avatarEl.textContent = (sellerDisplayName[0] || '판').toUpperCase();
    }
  }

  if (liveInfo?.status === 'upcoming') {
    hideOverlay();
    renderUpcomingScreen(liveInfo);
  } else {
    await connectLivekit();
  }

  // ---- Socket connection ----
  socket = Sock.connect();
  const _sellerName = user.nickname || user.username || '판매자';
  function onSocketConnect() {
    Sock.joinRoom(socket, liveId, String(user.id), _sellerName, 'seller', user.avatarUrl || null);
  }
  socket.on('connect', onSocketConnect);

  const unsubAuctionUpdate = Sock.onAuctionUpdate(socket, (auction) => {
    updateAuctionUI(auction);
  });
  // 이번 방송에서 종료된 경매 목록 (판매내역용)
  const sellerEndedAuctions = [];

  const unsubAuctionEnded = Sock.onAuctionEnded(socket, (auction) => {
    sellerEndedAuctions.push({ ...auction, endedAt: auction.endedAt || Date.now() });
    timerWrap.classList.add('is-hidden');
    showWonOverlay(auction);
    updateAuctionUI(null);
  });
  const unsubChat = Sock.onChatMessage(socket, (msg) => {
    chatOverlay.push(msg);
  });
  const unsubViewers = Sock.onViewerCount(socket, ({ count }) => {
    const el = page.querySelector('#ls-viewer-count');
    if (el) el.textContent = String(count);
  });

  let _viewerNames = [];
  const unsubViewerList = Sock.onViewerList(socket, ({ viewers }) => {
    _viewerNames = viewers || [];
  });

  // Giveaway participant count (for seller's auction info row)
  const unsubGiveawayCount = Sock.onGiveawayCount(socket, ({ auctionId, count }) => {
    if (!currentAuction || currentAuction.mode !== 'giveaway') return;
    if (currentAuction.id != null && String(currentAuction.id) !== String(auctionId)) return;
    currentAuction.giveawayCount = count;
    const currentPrice = page.querySelector('#ls-current-price');
    if (currentPrice) currentPrice.textContent = `${count}명 참여 중`;
  });

  const unsubEmoji = Sock.onEmojiReaction(socket, ({ emoji }) => {
    spawnFloatingEmoji(emoji);
  });

  unsubFns.push(unsubAuctionUpdate, unsubAuctionEnded, unsubChat, unsubViewers, unsubViewerList, unsubGiveawayCount, unsubEmoji,
    () => socket.off('connect', onSocketConnect));

  // ---- Auction UI helpers ----
  /** @type {{ id?: string, productName?: string, currentPrice?: number, currentBidder?: string, remaining?: number, mode?: string, stockTotal?: number, stockSold?: number } | null} */
  let currentAuction = null;

  // End-fcfs button (dynamically inserted)
  let endFcfsBtn = null;

  const LS_AUCTION_HELP = {
    normal:   { title: '일반 경매', icon: '🔨', steps: ['현재 최고 입찰가보다 높은 금액으로 자동 갱신됩니다.', '경매 시간이 끝나면 최고 입찰자가 낙찰됩니다.', '입찰자가 없으면 유찰 처리됩니다.'] },
    blind:    { title: '블라인드 경매', icon: '🔒', steps: ['구매자들이 서로의 입찰가를 볼 수 없습니다.', '구매자는 자신의 직전 입찰가보다 높게만 재입찰 가능합니다.', '경매 종료 후 가장 높은 금액을 입력한 분이 낙찰됩니다.'] },
    fcfs:     { title: '선착순 구매', icon: '⚡', steps: ['구매 버튼을 먼저 누른 순서대로 구매가 확정됩니다.', '재고가 소진되면 자동 마감됩니다.', '조기 종료 버튼으로 남은 재고를 유찰 처리할 수 있습니다.'] },
    giveaway: { title: '무료 나눔', icon: '🎁', steps: ['구매자들이 참여 버튼을 눌러 추첨 대상이 됩니다.', '경매 시간 종료 후 자동 추첨됩니다.', '당첨자에게 채팅으로 공지됩니다.'] },
  };

  function showSellerHelp(mode) {
    if (page.querySelector('.lb-help-modal')) return;
    const info = LS_AUCTION_HELP[mode] || LS_AUCTION_HELP.normal;
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

  function updateAuctionUI(auction) {
    currentAuction = auction;
    const noAuction = page.querySelector('#ls-no-auction');
    const productBlock = page.querySelector('#ls-product-block');
    const productName = page.querySelector('#ls-product-name');
    const currentPrice = page.querySelector('#ls-current-price');
    const bidder = page.querySelector('#ls-bidder');
    const thumb = page.querySelector('#ls-product-thumb');

    // Remove fcfs-end button if exists
    if (endFcfsBtn) { endFcfsBtn.remove(); endFcfsBtn = null; }

    const auctionCard = page.querySelector('#ls-auction-info');
    if (!auction) {
      // 경매 중이 아닐 때는 상품 카드 영역 전체를 숨긴다 (하단 액션바는 유지)
      if (auctionCard) auctionCard.classList.add('is-hidden');
      if (productBlock) productBlock.classList.add('is-hidden');
      timerWrap.classList.add('is-hidden');
      return;
    }

    if (auctionCard) auctionCard.classList.remove('is-hidden');
    if (noAuction) noAuction.classList.add('is-hidden');
    if (productBlock) productBlock.classList.remove('is-hidden');
    if (productName) productName.textContent = auction.productName || '';
    if (thumb) {
      if (auction.imageUrl) {
        thumb.src = auction.imageUrl;
        thumb.classList.remove('is-hidden');
      } else {
        thumb.src = '';
        thumb.classList.add('is-hidden');
      }
    }

    const mode = auction.mode || 'normal';

    // 모드칩 업데이트
    const modeRow = page.querySelector('#ls-mode-row');
    const modeChip = page.querySelector('#ls-mode-chip');
    const MODE_CHIP = {
      normal:   { icon: '🔨', label: '일반 경매',  cls: '' },
      blind:    { icon: '🔒', label: '블라인드',    cls: 'ls-mode-chip--blind' },
      fcfs:     { icon: '⚡', label: '선착순 구매', cls: 'ls-mode-chip--cta' },
      giveaway: { icon: '🎁', label: '무료 나눔',   cls: 'ls-mode-chip--info' },
    };
    if (modeRow && modeChip) {
      modeRow.classList.remove('is-hidden');
      const meta = MODE_CHIP[mode] || MODE_CHIP.normal;
      modeChip.textContent = `${meta.icon} ${meta.label}`;
      modeChip.className = `ls-mode-chip ${meta.cls}`;
      // 도움말 버튼 (한번만 생성)
      if (!modeRow.querySelector('.lb-help-btn')) {
        const helpBtn = document.createElement('button');
        helpBtn.className = 'lb-help-btn';
        helpBtn.setAttribute('aria-label', '경매 방식 안내');
        helpBtn.textContent = '?';
        modeRow.appendChild(helpBtn);
      }
      modeRow.querySelector('.lb-help-btn').onclick = () => showSellerHelp(mode);
    }

    if (currentPrice) {
      if (mode === 'giveaway') {
        const cnt = auction.giveawayCount != null ? auction.giveawayCount : 0;
        currentPrice.textContent = `${cnt}명 참여 중`;
      } else if (mode === 'blind') {
        currentPrice.textContent = '비공개 입찰';
      } else {
        currentPrice.textContent = (auction.currentPrice || auction.startPrice || 0).toLocaleString() + '원';
      }
      // 단위 배지
      let unitBadge = currentPrice.parentElement.querySelector('.ls-unit-badge');
      if (auction.unitCount >= 2) {
        if (!unitBadge) {
          unitBadge = document.createElement('span');
          unitBadge.className = 'ls-unit-badge';
          currentPrice.parentElement.appendChild(unitBadge);
        }
        unitBadge.textContent = `${auction.unitCount}${auction.unitLabel || '개'}`;
      } else if (unitBadge) {
        unitBadge.remove();
      }
    }

    if (bidder) {
      if (mode === 'fcfs') {
        const sold = auction.stockSold || 0;
        const total = auction.stockTotal || 0;
        bidder.textContent = `재고 ${total - sold}/${total}개 남음`;
      } else if (mode === 'normal') {
        bidder.textContent = auction.currentBidder ? `최고 입찰자: ${auction.currentBidder}` : '입찰 없음';
      } else if (mode === 'giveaway') {
        bidder.textContent = '추첨 진행 예정';
      } else {
        bidder.textContent = '비공개 입찰 진행 중';
      }
    }

    // Capture duration for fill-ratio; fallback to 30s
    if (auction.durationSec != null) {
      _auctionDurationSec = auction.durationSec;
    }

    const remaining = auction.remaining != null ? auction.remaining : auction.timeLeft;
    if (remaining != null) {
      timerWrap.classList.remove('is-hidden');
      updateTimerBar(remaining);
      timer.update(remaining); // keep internal timer state in sync
    }

    // Add end-fcfs button for fcfs mode (seller can end early)
    if (mode === 'fcfs' && auction.id) {
      endFcfsBtn = document.createElement('button');
      endFcfsBtn.className = 'live-seller__end-fcfs-btn';
      endFcfsBtn.textContent = '선착순 조기 종료';
      endFcfsBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmDialog({
          title: '선착순 경매 조기 종료',
          message: '지금 선착순 경매를 종료하시겠습니까?\n남은 재고는 유찰 처리됩니다.',
          confirmLabel: '종료하기',
          cancelLabel: '취소',
          danger: true,
        });
        if (!confirmed) return;
        try {
          await endFcfsAuction(liveId, auction.id);
          showToast('선착순 경매 종료');
        } catch (err) {
          showToast('종료 오류: ' + err.message, 'error');
        }
      });
      productBlock.appendChild(endFcfsBtn);
    }
  }

  function spawnFloatingEmoji(emoji) {
    const el = document.createElement('span');
    el.className = 'ls-floating-emoji';
    el.textContent = emoji;
    el.style.left = (10 + Math.random() * 70) + '%';
    page.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
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
          </div>
        `;
      } else {
        backdrop.innerHTML = `
          <div class="won-card won-card--giveaway">
            <div class="won-card__emoji">🎁</div>
            <div class="won-slot" id="won-slot-names">
              <div class="won-slot__name" id="won-slot-display">...</div>
            </div>
            <div class="won-card__winner-msg is-hidden" id="won-winner-msg"></div>
          </div>
        `;
        const slotEl = backdrop.querySelector('#won-slot-display');
        const msgEl = backdrop.querySelector('#won-winner-msg');
        const names = (auction.participants || []).map(p => p.userName);
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
              msgEl.classList.remove('is-hidden');
            }
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
      setTimeout(() => backdrop.remove(), 7000);
      return;
    }

    const isVoid = auction.void === true || !auction.winnerName;
    if (isVoid) {
      backdrop.innerHTML = `
        <div class="won-card">
          <div class="won-card__emoji">📭</div>
          <div class="won-card__title">유찰</div>
          <div class="won-card__price">입찰자가 없습니다</div>
        </div>
      `;
    } else {
      const unitPrice = auction.finalPrice || auction.price || auction.currentPrice || 0;
      const unitCount = auction.unitCount || 1;
      const priceText = unitCount >= 2
        ? `${(unitPrice * unitCount).toLocaleString('ko-KR')}원 (단가 ${unitPrice.toLocaleString('ko-KR')}원 × ${unitCount}${auction.unitLabel || '개'})`
        : `${unitPrice.toLocaleString('ko-KR')}원`;
      backdrop.innerHTML = `
        <div class="won-card">
          <div class="won-card__emoji">🏆</div>
          <div class="won-card__title">낙찰!</div>
          <div class="won-card__price">${priceText}</div>
          <div class="won-card__winner">${escapeHtml(auction.winnerName || '-')}</div>
        </div>
      `;
    }
    page.appendChild(backdrop);
    setTimeout(() => backdrop.remove(), 5000);
  }

  // ---- Auction modal (3-mode) ----
  function openAuctionModal() {
    /** @type {Blob | null} */
    let capturedBlob = null;
    let previewUrl = null;

    const backdrop = document.createElement('div');
    backdrop.className = 'auction-modal-backdrop';
    backdrop.innerHTML = `
      <div class="auction-modal">
        <div class="auction-modal__title">경매 등록</div>

        <!-- Photo capture -->
        <div class="auction-modal__photo-row">
          <div class="auction-modal__preview" id="am-preview">
            <span class="auction-modal__preview-placeholder">상품을 촬영해주세요</span>
          </div>
          <div class="auction-modal__photo-btns">
            <button class="auction-modal__capture-btn" id="am-capture">📷 상품 촬영</button>
            <button class="auction-modal__retake-btn is-hidden" id="am-retake">다시 찍기</button>
          </div>
        </div>

        <div class="auction-modal__field">
          <label class="auction-modal__label">상품명</label>
          <input class="auction-modal__input" id="am-product-name" type="text" placeholder="예: 제주 감귤 5kg" autocomplete="off" />
        </div>

        <div class="auction-modal__field" id="am-start-price-field">
          <label class="auction-modal__label">시작가 (원)</label>
          <input class="auction-modal__input" id="am-start-price" type="number" placeholder="예: 15000" min="0" step="100" />
        </div>

        <div class="auction-modal__field auction-modal__field--unit" id="am-unit-field">
          <label class="auction-modal__label">구매 단위 <span class="auction-modal__label-hint">(선택)</span></label>
          <div class="auction-modal__unit-row">
            <input class="auction-modal__input auction-modal__input--unit-count" id="am-unit-count" type="number" placeholder="수량 예: 20" min="1" step="1" />
            <input class="auction-modal__input auction-modal__input--unit-label" id="am-unit-label" type="text" placeholder="단위명 예: 박스" maxlength="10" />
          </div>
          <div class="auction-modal__field-hint">낙찰 시 총 결제 = 낙찰단가 × 수량</div>
        </div>

        <div class="auction-modal__field">
          <label class="auction-modal__label">경매 방식</label>
          <div class="auction-modal__modes" id="am-modes">
            <label class="auction-modal__mode-opt">
              <input type="radio" name="am-mode" value="normal" checked />
              <span class="am-mode-icon">🔨</span>
              <span>일반</span>
            </label>
            <label class="auction-modal__mode-opt">
              <input type="radio" name="am-mode" value="fcfs" />
              <span class="am-mode-icon">⚡</span>
              <span>선착순</span>
            </label>
            <label class="auction-modal__mode-opt">
              <input type="radio" name="am-mode" value="blind" />
              <span class="am-mode-icon">🔒</span>
              <span>블라인드</span>
            </label>
            <label class="auction-modal__mode-opt">
              <input type="radio" name="am-mode" value="giveaway" />
              <span class="am-mode-icon">🎁</span>
              <span>무료나눔</span>
            </label>
          </div>
        </div>

        <!-- Normal: 30s / 60s -->
        <div class="auction-modal__mode-opts" id="am-opts-normal">
          <label class="auction-modal__label">경매 시간</label>
          <div class="auction-modal__radio-row">
            <label><input type="radio" name="am-dur-normal" value="30" checked /> 30초</label>
            <label><input type="radio" name="am-dur-normal" value="60" /> 60초</label>
          </div>
        </div>

        <!-- FCFS: duration select + stock -->
        <div class="auction-modal__mode-opts is-hidden" id="am-opts-fcfs">
          <div class="auction-modal__field">
            <label class="auction-modal__label">구매 시간</label>
            <select class="auction-modal__input" id="am-dur-fcfs">
              <option value="300">5분</option>
              <option value="600">10분</option>
              <option value="900">15분</option>
              <option value="1200">20분</option>
              <option value="1500">25분</option>
              <option value="1800">30분</option>
              <option value="2100">35분</option>
              <option value="2400">40분</option>
              <option value="2700">45분</option>
              <option value="3000">50분</option>
              <option value="3300">55분</option>
              <option value="3600">60분</option>
            </select>
          </div>
          <div class="auction-modal__field">
            <label class="auction-modal__label">수량 (1~99)</label>
            <input class="auction-modal__input" id="am-stock" type="number" min="1" max="99" value="1" />
          </div>
        </div>

        <!-- Blind: 10s / 20s / 30s -->
        <div class="auction-modal__mode-opts is-hidden" id="am-opts-blind">
          <label class="auction-modal__label">입찰 시간</label>
          <div class="auction-modal__radio-row">
            <label><input type="radio" name="am-dur-blind" value="10" checked /> 10초</label>
            <label><input type="radio" name="am-dur-blind" value="20" /> 20초</label>
            <label><input type="radio" name="am-dur-blind" value="30" /> 30초</label>
          </div>
        </div>

        <!-- Giveaway: 10초 후 자동 추첨 -->
        <div class="auction-modal__mode-opts is-hidden" id="am-opts-giveaway">
          <div class="am-giveaway-info">
            🎁 시작 후 20초 동안 참여자를 모집한 뒤,<br>
            자동으로 한 명을 무작위 추첨합니다.
          </div>
        </div>

        <button class="auction-modal__submit" id="am-submit">경매 시작</button>
        <button class="auction-modal__cancel" id="am-cancel">취소</button>
      </div>
    `;

    // ---- Photo capture handlers ----
    const previewEl = backdrop.querySelector('#am-preview');
    const captureBtn = backdrop.querySelector('#am-capture');
    const retakeBtn = backdrop.querySelector('#am-retake');

    async function doCapture() {
      captureBtn.disabled = true;
      captureBtn.textContent = '촬영 중...';
      try {
        let blob = null;
        if (livekitMod && livekitMod.captureFrame) {
          blob = await livekitMod.captureFrame();
        } else if (videoEl.srcObject) {
          // getUserMedia fallback: draw current video frame via canvas
          const canvas = document.createElement('canvas');
          canvas.width = videoEl.videoWidth || 1280;
          canvas.height = videoEl.videoHeight || 720;
          canvas.getContext('2d').drawImage(videoEl, 0, 0);
          blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        } else {
          throw new Error('라이브 영상이 없습니다');
        }

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        capturedBlob = blob;
        previewUrl = URL.createObjectURL(blob);
        previewEl.style.backgroundImage = `url(${previewUrl})`;
        previewEl.classList.add('has-image');
        retakeBtn.classList.remove('is-hidden');
        captureBtn.classList.add('is-hidden');
      } catch (err) {
        showToast('촬영 실패: ' + err.message, 'error');
      } finally {
        captureBtn.disabled = false;
        captureBtn.textContent = '📷 상품 촬영';
      }
    }

    captureBtn.addEventListener('click', doCapture);
    retakeBtn.addEventListener('click', () => {
      capturedBlob = null;
      if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
      previewEl.style.backgroundImage = '';
      previewEl.classList.remove('has-image');
      retakeBtn.classList.add('is-hidden');
      captureBtn.classList.remove('is-hidden');
    });

    // 모달 닫기 — backdrop-filter 레이어 제거 시 Chrome이 하위 레이어를
    // 리페인트하지 않아 UI가 사라지는 합성 버그가 있어, 닫은 뒤 강제 리페인트한다.
    function closeModal() {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      backdrop.remove();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      // 강제 리페인트: bottomPanel을 한 프레임 토글해 합성 레이어를 갱신시킨다.
      requestAnimationFrame(() => {
        const prev = bottomPanel.style.transform;
        bottomPanel.style.transform = 'translateZ(0)';
        // 다음 프레임에 원복하여 리페인트 트리거
        requestAnimationFrame(() => { bottomPanel.style.transform = prev; });
      });
    }

    backdrop.querySelector('#am-cancel').addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === backdrop) closeModal();
    });

    // Mode radio toggle
    const modeRadios = backdrop.querySelectorAll('input[name="am-mode"]');
    const optsNormal = backdrop.querySelector('#am-opts-normal');
    const optsFcfs = backdrop.querySelector('#am-opts-fcfs');
    const optsBlind = backdrop.querySelector('#am-opts-blind');
    const optsGiveaway = backdrop.querySelector('#am-opts-giveaway');

    const startPriceField = backdrop.querySelector('#am-start-price-field');

    const unitField = backdrop.querySelector('#am-unit-field');

    function switchMode(mode) {
      optsNormal.classList.toggle('is-hidden', mode !== 'normal');
      optsFcfs.classList.toggle('is-hidden', mode !== 'fcfs');
      optsBlind.classList.toggle('is-hidden', mode !== 'blind');
      optsGiveaway.classList.toggle('is-hidden', mode !== 'giveaway');
      // 블라인드/무료나눔은 시작가 없음 (0원 고정)
      startPriceField.classList.toggle('is-hidden', mode === 'blind' || mode === 'giveaway');
      // 단위 필드: normal/blind만 표시 (fcfs는 stockTotal과 분리, giveaway는 불필요)
      unitField.classList.toggle('is-hidden', mode === 'fcfs' || mode === 'giveaway');
    }

    modeRadios.forEach((r) => r.addEventListener('change', () => switchMode(r.value)));

    backdrop.querySelector('#am-submit').addEventListener('click', async () => {
      const productName = backdrop.querySelector('#am-product-name').value.trim();
      const mode = backdrop.querySelector('input[name="am-mode"]:checked').value;
      const isPriceless = mode === 'blind' || mode === 'giveaway';
      const startPrice = isPriceless ? 0 : parseInt(backdrop.querySelector('#am-start-price').value, 10);

      if (!productName || (!isPriceless && (isNaN(startPrice) || startPrice < 0))) {
        showToast('상품명과 시작가를 올바르게 입력하세요.', 'error');
        return;
      }
      if (!capturedBlob) {
        showToast('상품 사진을 촬영해 주세요.', 'error');
        return;
      }
      if (!isPriceless && startPrice % 100 !== 0) {
        showToast('시작가는 100원 단위로 입력하세요.', 'error');
        return;
      }

      const unitCount = parseInt(backdrop.querySelector('#am-unit-count')?.value, 10) || 1;
      const unitLabel = (backdrop.querySelector('#am-unit-label')?.value || '').trim();
      const payload = { productName, startPrice, mode, unitCount, unitLabel };

      if (mode === 'normal') {
        payload.durationSec = parseInt(backdrop.querySelector('input[name="am-dur-normal"]:checked').value, 10);
      } else if (mode === 'fcfs') {
        payload.durationSec = parseInt(backdrop.querySelector('#am-dur-fcfs').value, 10);
        const stock = parseInt(backdrop.querySelector('#am-stock').value, 10);
        if (isNaN(stock) || stock < 1 || stock > 99) {
          showToast('수량은 1~99 사이로 입력하세요.', 'error');
          return;
        }
        payload.stockTotal = stock;
      } else if (mode === 'blind') {
        payload.durationSec = parseInt(backdrop.querySelector('input[name="am-dur-blind"]:checked').value, 10);
      }
      // mode === 'giveaway': durationSec, stockTotal 전송 불필요 (서버 기본 10초)

      const btn = backdrop.querySelector('#am-submit');
      btn.disabled = true;
      btn.textContent = '등록 중...';
      try {
        const auction = await api.createAuction(liveId, payload, capturedBlob || undefined);
        await api.startAuction(liveId, auction.id);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        backdrop.remove();
        const modeLabelText = mode === 'normal' ? '일반'
          : mode === 'fcfs' ? '선착순'
          : mode === 'blind' ? '블라인드'
          : '무료나눔';
        showToast(`경매 시작: ${productName} (${modeLabelText})`);
      } catch (err) {
        showToast('경매 등록 실패: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '경매 시작';
      }
    });

    page.appendChild(backdrop);
    setTimeout(() => backdrop.querySelector('#am-product-name').focus(), 100);
  }

  // ---- Event listeners ----
  page.querySelector('#ls-viewers').addEventListener('click', () => {
    let _fired = false;
    function _showViewerModal(names) {
      const namesHtml = names.length
        ? names.map(v => {
            const name = typeof v === 'string' ? v : (v && v.userName) || '';
            const avatar = typeof v === 'object' && v ? v.avatarUrl : null;
            const avatarHtml = avatar
              ? `<img class="ls-viewer-modal__avatar" src="${escapeHtml(avatar)}" alt="" />`
              : `<span class="ls-viewer-modal__avatar ls-viewer-modal__avatar--placeholder">${personIconSVG(20)}</span>`;
            return `<li class="ls-viewer-modal__item">${avatarHtml}<span class="ls-viewer-modal__name">${escapeHtml(name)}</span></li>`;
          }).join('')
        : '<li class="ls-viewer-modal__empty">시청자가 없습니다</li>';
      const backdrop = document.createElement('div');
      backdrop.className = 'ls-viewer-modal-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.innerHTML = `
        <div class="ls-viewer-modal">
          <div class="ls-viewer-modal__header">
            <span class="ls-viewer-modal__title">시청자 목록 (${names.length}명)</span>
            <button class="ls-viewer-modal__close" aria-label="닫기">✕</button>
          </div>
          <ul class="ls-viewer-modal__list">${namesHtml}</ul>
        </div>
      `;
      const appRoot = document.getElementById('app-root') || document.body;
      appRoot.appendChild(backdrop);
      backdrop.querySelector('.ls-viewer-modal__close').addEventListener('click', () => backdrop.remove());
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    }
    const offOnce = Sock.onViewerList(socket, ({ viewers }) => {
      if (_fired) return;
      _fired = true;
      offOnce();
      _viewerNames = viewers || [];
      _showViewerModal(_viewerNames);
    });
    Sock.requestViewerList(socket, liveId);
    setTimeout(() => { if (!_fired) { _fired = true; offOnce(); _showViewerModal(_viewerNames); } }, 300);
  });

  page.querySelector('#ls-auction-btn').addEventListener('click', () => {
    if (page.querySelector('.auction-modal-backdrop')) return;
    openAuctionModal();
  });

  // 판매내역 시트
  page.querySelector('#ls-sold-btn').addEventListener('click', () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'product-sheet-backdrop';
    backdrop.dataset.theme = 'light';
    backdrop.setAttribute('role', 'dialog');

    const totalRevenue = sellerEndedAuctions
      .reduce((sum, a) => sum + (a.finalPrice || a.currentPrice || 0) * (a.unitCount || 1), 0);

    const rowEls = sellerEndedAuctions.length === 0
      ? [Object.assign(document.createElement('div'), { className: 'ps-empty', textContent: '아직 판매된 상품이 없습니다.' })]
      : sellerEndedAuctions.slice().reverse().map(a => {
          const isVoid = !a.winnerName;
          const winner = escapeHtml(a.winnerName || '');
          const unitPrice = a.finalPrice || a.currentPrice || 0;
          const unitCount = a.unitCount || 1;
          const price = unitCount >= 2
            ? `${(unitPrice * unitCount).toLocaleString('ko-KR')}원 (단가 ${unitPrice.toLocaleString('ko-KR')}원 × ${unitCount}${a.unitLabel || '개'})`
            : `${unitPrice.toLocaleString('ko-KR')}원`;
          const ts = a.endedAt ? new Date(a.endedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
          const isBlind = a.mode === 'blind';
          const aid = a.id || a.auctionId;

          const row = document.createElement('div');
          row.className = 'ps-sold-row' + (!isVoid && (a.id || a.auctionId) ? ' ps-row--clickable' : '');
          if (!isVoid && (a.id || a.auctionId)) row.dataset.auctionId = String(a.id || a.auctionId);
          const thumbSrc = a.imageUrl || '';
          row.innerHTML = `
            ${thumbSrc
              ? `<img class="ps-sold-thumb" src="${escapeHtml(thumbSrc)}" alt="" />`
              : `<div class="ps-sold-thumb ps-sold-thumb--empty">${isVoid ? '—' : winner.charAt(0)}</div>`}
            <div class="ps-sold-info">
              <div class="ps-sold-name">${escapeHtml(a.productName || '-')}${isBlind ? ' <span class="ps-mode-badge">블라인드</span>' : ''}</div>
              <div class="ps-sold-meta">${isVoid ? '유찰' : `${winner} · ${price}`}${ts ? ` · ${ts}` : ''}</div>
              ${isBlind && aid ? '<button class="ps-blind-bids-btn" data-id="' + escapeAttr(String(aid)) + '">입찰 내역 보기</button>' : ''}
            </div>
          `;
          return row;
        });

    backdrop.innerHTML = `
      <div class="product-sheet">
        <div class="product-sheet__header">
          <span class="product-sheet__title">판매내역</span>
          <button class="product-sheet__close-x" aria-label="닫기">✕</button>
        </div>
        ${sellerEndedAuctions.length > 0 ? `
        <div class="ps-revenue-summary">
          총 ${sellerEndedAuctions.length}건 · 합계 <strong>${totalRevenue.toLocaleString()}원</strong>
        </div>` : ''}
        <div class="product-sheet__content" id="ps-sold-content"></div>
        <button class="product-sheet__close-btn">닫기</button>
      </div>
    `;

    const soldContent = backdrop.querySelector('#ps-sold-content');
    rowEls.forEach(el => soldContent.appendChild(el));

    if (page.querySelector('.product-sheet-backdrop')) return; // 중복 방지
    page.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('is-open'));

    // 블라인드 입찰 내역 버튼
    soldContent.addEventListener('click', async (e) => {
      const btn = e.target.closest('.ps-blind-bids-btn');
      if (!btn) return;
      const auctionId = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = '불러오는 중...';
      try {
        const data = await api.getBlindBids(liveId, auctionId);
        const bids = Array.isArray(data?.bids) ? data.bids : [];
        const container = btn.closest('.ps-sold-info');
        btn.remove();
        const table = document.createElement('div');
        table.className = 'ps-blind-bids-table';
        if (bids.length === 0) {
          table.innerHTML = '<div class="ps-blind-bids-empty">입찰 없음</div>';
        } else {
          table.innerHTML = bids.map((b, i) => `
            <div class="ps-blind-bid-row${i === 0 ? ' ps-blind-bid-row--top' : ''}">
              <span class="ps-blind-bid-rank">${i + 1}위</span>
              <span class="ps-blind-bid-name">${escapeHtml(b.userName || b.userId || '-')}</span>
              <span class="ps-blind-bid-price">${Number(b.price).toLocaleString()}원</span>
            </div>
          `).join('');
        }
        container.appendChild(table);
      } catch (err) {
        btn.textContent = '조회 실패 (재시도)';
        btn.disabled = false;
      }
    });

    function close() {
      backdrop.classList.remove('is-open');
      setTimeout(() => backdrop.remove(), 220);
    }
    backdrop.querySelector('.product-sheet__close-x').addEventListener('click', close);
    backdrop.querySelector('.product-sheet__close-btn').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) { close(); return; }
      if (e.target.closest('.ps-blind-bids-btn')) return;
      const row = e.target.closest('.ps-sold-row[data-auction-id]');
      if (row) {
        const auctionId = row.dataset.auctionId;
        if (!auctionId) return;
        close();
        navigate('/app/order-detail/' + auctionId);
      }
    });
  });

  const chatInput = page.querySelector('#ls-chat-input');

  function sendChatMsg() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    Sock.sendChat(socket, liveId, String(user.id), msg, user.nickname || user.username || '판매자');
    chatInput.value = '';
  }

  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) sendChatMsg(); });

  page.querySelector('#ls-end-btn').addEventListener('click', async () => {
    const confirmed = await showConfirmDialog({
      title: '라이브를 종료하시겠습니까?',
      message: '진행 중인 경매가 있다면 함께 종료됩니다.',
      confirmLabel: '종료',
      cancelLabel: '취소',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await api.endLive(liveId, user.id);
    } catch (err) {
      const status = err?.status || err?.response?.status;
      const msg = String(err?.message || err || '');
      // 이미 종료/삭제된 라이브(404 또는 not found)는 정상 종료로 간주하고 화면만 닫는다
      if (status === 404 || /not found/i.test(msg)) {
        window.history.back();
        return;
      }
      if (status === 409) {
        showToast('진행 중인 경매가 있습니다. 경매를 먼저 종료해 주세요.', { variant: 'warn' });
        return;
      }
      showToast('종료 오류: ' + (err.message || err), { variant: 'error' });
      return;
    }
    window.history.back();
  });

  // ---- Image zoom overlay ----
  const imgZoomOverlay = document.createElement('div');
  imgZoomOverlay.className = 'ls-img-zoom-overlay';
  imgZoomOverlay.innerHTML = '<img class="ls-img-zoom-img" src="" alt="" />';
  page.appendChild(imgZoomOverlay);
  const imgZoomImg = imgZoomOverlay.querySelector('.ls-img-zoom-img');

  function openImgZoom(src) {
    if (!src) return;
    imgZoomImg.src = src;
    imgZoomOverlay.classList.add('ls-img-zoom-overlay--visible');
  }
  function closeImgZoom() {
    imgZoomOverlay.classList.remove('ls-img-zoom-overlay--visible');
    imgZoomImg.src = '';
  }
  imgZoomOverlay.addEventListener('click', closeImgZoom);

  const lsThumb = page.querySelector('#ls-product-thumb');
  if (lsThumb) {
    lsThumb.style.cursor = 'zoom-in';
    lsThumb.addEventListener('click', () => { if (lsThumb.src) openImgZoom(lsThumb.src); });
  }

  // ---- Cleanup ----
  setCleanup(async () => {
    unsubFns.forEach((fn) => fn());
    if (socket) socket.disconnect();
    if (room && livekitMod) { try { livekitMod.disconnect(room, localTracks); } catch (_) {} }
    if (videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    }
    timer.destroy();
    chatOverlay.destroy();
  });

  return page;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
