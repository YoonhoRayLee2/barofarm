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
import { replace, setCleanup } from '/app/scripts/router.js';
import * as api from '/app/scripts/api.js';
import { endFcfsAuction } from '/app/scripts/api.js';
import * as Sock from '/app/scripts/socket.js';
import { createTimer } from '/app/components/timer.js';
import { createChatOverlay } from '/app/components/chat-overlay.js';
import { showConfirmDialog } from '/app/components/confirm-dialog.js';
import { showToast as _globalToast } from '/app/components/toast.js';

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

  // Video element
  const videoEl = document.createElement('video');
  videoEl.className = 'live-seller__video';
  videoEl.autoplay = true;
  videoEl.muted = true;
  videoEl.playsInline = true;
  page.appendChild(videoEl);

  // Top bar
  const topBar = document.createElement('div');
  topBar.className = 'live-seller__top';
  topBar.innerHTML = `
    <div class="ls-top-left">
      <div class="live-badge">
        <span class="live-badge__dot"></span>
        LIVE
      </div>
      <button class="ls-viewer-chip" id="ls-viewers" aria-label="시청자 목록">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span id="ls-viewer-count">0</span>
      </button>
    </div>
    <div class="ls-cam-controls" id="ls-cam-controls" style="display:none">
      <button class="ls-cam-btn" id="ls-flip-btn" aria-label="카메라 전환">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
        </svg>
      </button>
      <button class="ls-cam-btn" id="ls-zoom-out-btn" aria-label="줌 아웃">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
      </button>
      <span class="ls-zoom-label" id="ls-zoom-label">1×</span>
      <button class="ls-cam-btn" id="ls-zoom-in-btn" aria-label="줌 인">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
      </button>
    </div>
    <button class="live-seller__end-btn" id="ls-end-btn" aria-label="방송 종료">✕</button>
  `;
  page.appendChild(topBar);

  // Toast notifications are handled by the global showToast() component.

  // Chat overlay wrapper — positioned above bottom panel (set dynamically via JS)
  const chatWrap = document.createElement('div');
  chatWrap.className = 'live-seller__chat-wrap';
  chatWrap.style.bottom = '220px'; // approximate above bottom panel
  page.appendChild(chatWrap);

  // Bottom panel
  const bottomPanel = document.createElement('div');
  bottomPanel.className = 'live-seller__bottom';
  bottomPanel.innerHTML = `
    <div class="live-seller__auction-info" id="ls-auction-info">
      <div class="live-seller__no-auction" id="ls-no-auction">경매를 등록하세요</div>
      <div class="live-seller__product-block" id="ls-product-block" style="display:none">
        <div class="live-seller__product-name" id="ls-product-name"></div>
        <div class="live-seller__current-price" id="ls-current-price"></div>
        <div class="live-seller__bidder" id="ls-bidder"></div>
      </div>
    </div>
    <div class="live-seller__actions">
      <input class="live-seller__chat-input" id="ls-chat-input" type="text" placeholder="채팅 입력..." maxlength="100" autocomplete="off" />
      <button class="live-seller__send-btn" id="ls-send-btn">전송</button>
      <button class="live-seller__auction-btn" id="ls-auction-btn">경매 등록</button>
      <button class="ls-sold-btn" id="ls-sold-btn">판매내역</button>
    </div>
  `;
  page.appendChild(bottomPanel);

  // Timer bar — replaces plain numeric timer, placed inside auction info row
  const timerWrap = document.createElement('div');
  timerWrap.className = 'ls-timer-bar-wrap';
  timerWrap.id = 'ls-timer-wrap';
  timerWrap.style.display = 'none';
  timerWrap.innerHTML = `
    <span class="ls-timer-label" id="ls-timer-label">30</span>
    <div class="ls-timer-track">
      <div class="ls-timer-fill" id="ls-timer-fill"></div>
    </div>
  `;
  const auctionInfoEl = bottomPanel.querySelector('#ls-auction-info');
  auctionInfoEl.appendChild(timerWrap);

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
  timer.el.style.display = 'none';

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
        const published = await livekitMod.publishCamera(room);
        localTracks = [published.cameraTrack, published.micTrack].filter(Boolean);
        livekitMod.attachLocalVideo(room, videoEl);
      } else {
        // Fallback: getUserMedia directly for browser preview
        if (!window.isSecureContext || !navigator.mediaDevices) {
          showToast('카메라 사용을 위해 HTTPS 또는 localhost 접속이 필요합니다', 'info');
        } else {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            videoEl.srcObject = stream;
          } catch (mediaErr) {
            showToast('카메라/마이크 접근 실패: ' + (mediaErr.message || mediaErr), 'error');
          }
        }
      }

      hideOverlay();

      // ---- Camera controls (LiveKit only) ----
      if (livekitMod && room) {
        const camControls = document.getElementById('ls-cam-controls');
        if (camControls) camControls.style.display = '';

        let _zoomRange = livekitMod.getZoomRange ? livekitMod.getZoomRange() : null;
        let _zoomCurrent = 1;

        const updateZoomLabel = () => {
          const lbl = document.getElementById('ls-zoom-label');
          if (lbl) lbl.textContent = _zoomCurrent.toFixed(1) + '×';
        };
        updateZoomLabel();

        document.getElementById('ls-zoom-in-btn')?.addEventListener('click', async () => {
          const step = 0.5;
          const max = _zoomRange?.max ?? 5;
          _zoomCurrent = Math.min(max, _zoomCurrent + step);
          updateZoomLabel();
          if (livekitMod.setZoom) await livekitMod.setZoom(_zoomCurrent).catch(() => {});
        });

        document.getElementById('ls-zoom-out-btn')?.addEventListener('click', async () => {
          const step = 0.5;
          const min = _zoomRange?.min ?? 1;
          _zoomCurrent = Math.max(min, _zoomCurrent - step);
          updateZoomLabel();
          if (livekitMod.setZoom) await livekitMod.setZoom(_zoomCurrent).catch(() => {});
        });

        const flipBtn = document.getElementById('ls-flip-btn');
        if (flipBtn && livekitMod.switchCamera) {
          flipBtn.addEventListener('click', async () => {
            flipBtn.disabled = true;
            try {
              await livekitMod.switchCamera(room);
              _zoomCurrent = 1;
              _zoomRange = livekitMod.getZoomRange ? livekitMod.getZoomRange() : null;
              updateZoomLabel();
              if (livekitMod.attachLocalVideo) livekitMod.attachLocalVideo(room, videoEl);
            } catch (err) {
              showToast('카메라 전환 실패: ' + (err.message || String(err)), 'error');
            } finally {
              flipBtn.disabled = false;
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

  if (liveInfo?.status === 'upcoming') {
    hideOverlay();
    renderUpcomingScreen(liveInfo);
  } else {
    await connectLivekit();
  }

  // ---- Socket connection ----
  socket = Sock.connect();

  Sock.joinRoom(socket, liveId, String(user.id), user.nickname || user.username || '판매자', 'seller');

  const unsubAuctionUpdate = Sock.onAuctionUpdate(socket, (auction) => {
    updateAuctionUI(auction);
  });
  // 이번 방송에서 종료된 경매 목록 (판매내역용)
  const sellerEndedAuctions = [];

  const unsubAuctionEnded = Sock.onAuctionEnded(socket, (auction) => {
    sellerEndedAuctions.push({ ...auction, endedAt: auction.endedAt || Date.now() });
    timerWrap.style.display = 'none';
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

  unsubFns.push(unsubAuctionUpdate, unsubAuctionEnded, unsubChat, unsubViewers, unsubViewerList);

  // ---- Auction UI helpers ----
  /** @type {{ id?: string, productName?: string, currentPrice?: number, currentBidder?: string, remaining?: number, mode?: string, stockTotal?: number, stockSold?: number } | null} */
  let currentAuction = null;

  // End-fcfs button (dynamically inserted)
  let endFcfsBtn = null;

  function updateAuctionUI(auction) {
    currentAuction = auction;
    const noAuction = page.querySelector('#ls-no-auction');
    const productBlock = page.querySelector('#ls-product-block');
    const productName = page.querySelector('#ls-product-name');
    const currentPrice = page.querySelector('#ls-current-price');
    const bidder = page.querySelector('#ls-bidder');

    // Remove fcfs-end button if exists
    if (endFcfsBtn) { endFcfsBtn.remove(); endFcfsBtn = null; }

    if (!auction) {
      if (noAuction) noAuction.style.display = '';
      if (productBlock) productBlock.style.display = 'none';
      timerWrap.style.display = 'none';
      return;
    }

    if (noAuction) noAuction.style.display = 'none';
    if (productBlock) productBlock.style.display = '';
    if (productName) productName.textContent = auction.productName || '';

    const mode = auction.mode || 'normal';
    const modeLabel = mode === 'fcfs' ? '[선착순] ' : mode === 'blind' ? '[블라인드] ' : '';

    if (currentPrice) {
      if (mode === 'fcfs') {
        const sold = auction.stockSold || 0;
        const total = auction.stockTotal || 0;
        currentPrice.textContent = `${modeLabel}${(total - sold)}/${total}개 남음`;
      } else if (mode === 'blind') {
        currentPrice.textContent = '[블라인드] 비공개 입찰';
      } else {
        currentPrice.textContent = modeLabel + (auction.currentPrice || auction.startPrice || 0).toLocaleString() + '원';
      }
    }

    if (bidder) {
      if (mode === 'normal') {
        bidder.textContent = auction.currentBidder ? `최고 입찰자: ${auction.currentBidder}` : '입찰 없음';
      } else if (mode === 'fcfs') {
        bidder.textContent = `판매 수: ${auction.stockSold || 0}`;
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
      timerWrap.style.display = '';
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

  function showWonOverlay(auction) {
    const backdrop = document.createElement('div');
    backdrop.className = 'won-overlay';
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
      backdrop.innerHTML = `
        <div class="won-card">
          <div class="won-card__emoji">🏆</div>
          <div class="won-card__title">낙찰!</div>
          <div class="won-card__price">${(auction.finalPrice || auction.price || auction.currentPrice || 0).toLocaleString()}원</div>
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
            <button class="auction-modal__retake-btn" id="am-retake" style="display:none">다시 찍기</button>
          </div>
        </div>

        <div class="auction-modal__field">
          <label class="auction-modal__label">상품명</label>
          <input class="auction-modal__input" id="am-product-name" type="text" placeholder="예: 제주 감귤 5kg" autocomplete="off" />
        </div>

        <div class="auction-modal__field" id="am-start-price-field">
          <label class="auction-modal__label">시작가 (원)</label>
          <input class="auction-modal__input" id="am-start-price" type="number" placeholder="예: 15000" min="0" />
        </div>

        <div class="auction-modal__field">
          <label class="auction-modal__label">경매 방식</label>
          <div class="auction-modal__modes" id="am-modes">
            <label class="auction-modal__mode-opt">
              <input type="radio" name="am-mode" value="normal" checked />
              <span>일반</span>
            </label>
            <label class="auction-modal__mode-opt">
              <input type="radio" name="am-mode" value="fcfs" />
              <span>선착순</span>
            </label>
            <label class="auction-modal__mode-opt">
              <input type="radio" name="am-mode" value="blind" />
              <span>블라인드</span>
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
        <div class="auction-modal__mode-opts" id="am-opts-fcfs" style="display:none">
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
        <div class="auction-modal__mode-opts" id="am-opts-blind" style="display:none">
          <label class="auction-modal__label">입찰 시간</label>
          <div class="auction-modal__radio-row">
            <label><input type="radio" name="am-dur-blind" value="10" checked /> 10초</label>
            <label><input type="radio" name="am-dur-blind" value="20" /> 20초</label>
            <label><input type="radio" name="am-dur-blind" value="30" /> 30초</label>
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
        retakeBtn.style.display = '';
        captureBtn.style.display = 'none';
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
      retakeBtn.style.display = 'none';
      captureBtn.style.display = '';
    });

    backdrop.querySelector('#am-cancel').addEventListener('click', () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      backdrop.remove();
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        backdrop.remove();
      }
    });

    // Mode radio toggle
    const modeRadios = backdrop.querySelectorAll('input[name="am-mode"]');
    const optsNormal = backdrop.querySelector('#am-opts-normal');
    const optsFcfs = backdrop.querySelector('#am-opts-fcfs');
    const optsBlind = backdrop.querySelector('#am-opts-blind');

    const startPriceField = backdrop.querySelector('#am-start-price-field');

    function switchMode(mode) {
      optsNormal.style.display = mode === 'normal' ? '' : 'none';
      optsFcfs.style.display = mode === 'fcfs' ? '' : 'none';
      optsBlind.style.display = mode === 'blind' ? '' : 'none';
      // 블라인드는 시작가 없음 (0원 고정)
      startPriceField.style.display = mode === 'blind' ? 'none' : '';
    }

    modeRadios.forEach((r) => r.addEventListener('change', () => switchMode(r.value)));

    backdrop.querySelector('#am-submit').addEventListener('click', async () => {
      const productName = backdrop.querySelector('#am-product-name').value.trim();
      const mode = backdrop.querySelector('input[name="am-mode"]:checked').value;
      const startPrice = mode === 'blind' ? 0 : parseInt(backdrop.querySelector('#am-start-price').value, 10);

      if (!productName || (mode !== 'blind' && (isNaN(startPrice) || startPrice < 0))) {
        showToast('상품명과 시작가를 올바르게 입력하세요.', 'error');
        return;
      }

      const payload = { productName, startPrice, mode };

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

      const btn = backdrop.querySelector('#am-submit');
      btn.disabled = true;
      btn.textContent = '등록 중...';
      try {
        const auction = await api.createAuction(liveId, payload, capturedBlob || undefined);
        await api.startAuction(liveId, auction.id);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        backdrop.remove();
        showToast(`경매 시작: ${productName} (${mode === 'normal' ? '일반' : mode === 'fcfs' ? '선착순' : '블라인드'})`);
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
        ? names.map(n => `<li class="ls-viewer-modal__item">${escapeHtml(n)}</li>`).join('')
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

  page.querySelector('#ls-auction-btn').addEventListener('click', openAuctionModal);

  // 판매내역 시트
  page.querySelector('#ls-sold-btn').addEventListener('click', () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'product-sheet-backdrop';
    backdrop.setAttribute('role', 'dialog');

    const totalRevenue = sellerEndedAuctions
      .reduce((sum, a) => sum + (a.finalPrice || a.currentPrice || 0), 0);

    const rowEls = sellerEndedAuctions.length === 0
      ? [Object.assign(document.createElement('div'), { className: 'ps-empty', textContent: '아직 판매된 상품이 없습니다.' })]
      : sellerEndedAuctions.slice().reverse().map(a => {
          const isVoid = !a.winnerName;
          const winner = escapeHtml(a.winnerName || '');
          const price = (a.finalPrice || a.currentPrice || 0).toLocaleString();
          const ts = a.endedAt ? new Date(a.endedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
          const isBlind = a.mode === 'blind';

          const row = document.createElement('div');
          row.className = 'ps-sold-row';
          const thumbSrc = a.imageUrl || '';
          row.innerHTML = `
            ${thumbSrc
              ? `<img class="ps-sold-thumb" src="${escapeHtml(thumbSrc)}" alt="" />`
              : `<div class="ps-sold-thumb ps-sold-thumb--empty">${isVoid ? '—' : winner.charAt(0)}</div>`}
            <div class="ps-sold-info">
              <div class="ps-sold-name">${escapeHtml(a.productName || '-')}${isBlind ? ' <span class="ps-mode-badge">블라인드</span>' : ''}</div>
              <div class="ps-sold-meta">${isVoid ? '유찰' : `${winner} · ${price}원`}${ts ? ` · ${ts}` : ''}</div>
              ${isBlind && a.id ? '<button class="ps-blind-bids-btn" data-id="' + escapeAttr(String(a.id)) + '">입찰 내역 보기</button>' : ''}
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

    document.body.appendChild(backdrop);

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
      backdrop.classList.add('is-leaving');
      setTimeout(() => backdrop.remove(), 220);
    }
    backdrop.querySelector('.product-sheet__close-x').addEventListener('click', close);
    backdrop.querySelector('.product-sheet__close-btn').addEventListener('click', close);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  });

  const chatInput = page.querySelector('#ls-chat-input');
  const sendBtn = page.querySelector('#ls-send-btn');

  function sendChatMsg() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    Sock.sendChat(socket, liveId, String(user.id), msg, user.nickname || user.username || '판매자');
    chatInput.value = '';
  }

  sendBtn.addEventListener('click', sendChatMsg);
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
      if (status === 409) {
        showToast('진행 중인 경매가 있습니다. 경매를 먼저 종료해 주세요.', { variant: 'warn' });
        return;
      }
      showToast('종료 오류: ' + (err.message || err), { variant: 'error' });
      return;
    }
    window.history.back();
  });

  // ---- Cleanup ----
  setCleanup(async () => {
    unsubFns.forEach((fn) => fn());
    if (socket) socket.disconnect();
    if (room && livekitMod) await livekitMod.disconnect(room, localTracks).catch(() => {});
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
