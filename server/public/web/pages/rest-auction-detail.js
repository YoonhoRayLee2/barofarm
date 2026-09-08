/**
 * REST 경매 상세 — 입장 인증 → 입찰 → 낙찰 결제
 * Route: /app/auctions/:id
 *
 * 소켓 기반 라이브 경매(live-buyer/live-seller, /app/auction-detail/:id)와 분리된
 * REST 경매(bidding_channel='REST') 전용 화면이다. 소켓 화면은 건드리지 않는다.
 *
 * API:
 *   GET    /api/auctions/:id
 *   GET    /api/auctions/:id/access-status
 *   POST   /api/auctions/:id/enter               { password }
 *   DELETE /api/auctions/:id/access-session
 *   GET    /api/auctions/:id/bids                (입장 후)
 *   GET    /api/auctions/:id/my-bids
 *   POST   /api/auctions/:id/bids                { amount, idempotencyKey }
 *   POST   /api/payment-auth/sessions            { password, purpose:'HIGH_VALUE_BID' }
 *
 * @module pages/rest-auction-detail
 */

import { request } from '/app/scripts/api.js';
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace, setCleanup } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { escapeHtml } from '/app/scripts/dom.js';
import { formatPrice, formatPriceRaw } from '/app/scripts/format.js';
import { showPaymentPasswordModal } from '/app/components/payment-password-modal.js';

const _cssId = 'page-css-rest-auction-detail';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/rest-auction-detail.css';
  document.head.appendChild(link);
}

const uuid = () =>
  (self.crypto && self.crypto.randomUUID)
    ? self.crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const BID_STEPS = [1000, 5000, 10000, 50000];

export default async function load(params) {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const id = String(params?.id || '');

  const page = document.createElement('div');
  page.className = 'rad-page';
  page.dataset.theme = 'light';
  page.innerHTML = `
    <header class="rad-header">
      <button class="rad-header__back" type="button" aria-label="뒤로 가기">‹</button>
      <h1 class="rad-header__title">경매 상세</h1>
    </header>
    <div class="rad-scroll" id="rad-body">
      <div class="rad-loading">불러오는 중...</div>
    </div>
  `;
  page.querySelector('.rad-header__back').addEventListener('click', () => window.history.back());
  const body = page.querySelector('#rad-body');

  let countdownTimer = null;
  function clearCountdown() { if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } }
  setCleanup(() => clearCountdown());

  /* ── Data load ───────────────────────────────────────── */
  async function reload() {
    clearCountdown();
    let auction, access;
    try {
      auction = await request(`/api/auctions/${encodeURIComponent(id)}`, { method: 'GET' });
    } catch {
      body.innerHTML = `<div class="rad-error">경매 정보를 불러올 수 없습니다.<button class="rad-retry" type="button">다시 시도</button></div>`;
      body.querySelector('.rad-retry').addEventListener('click', reload);
      return;
    }
    try {
      access = await request(`/api/auctions/${encodeURIComponent(id)}/access-status`, { method: 'GET' });
    } catch {
      access = { requiresEntryAuth: true, hasAccess: false };
    }

    let myLastBid = null;
    let bidderCount = null;
    if (access.hasAccess) {
      try {
        const [mine, all] = await Promise.all([
          request(`/api/auctions/${encodeURIComponent(id)}/my-bids`, { method: 'GET' }).catch(() => ({ items: [] })),
          request(`/api/auctions/${encodeURIComponent(id)}/bids`, { method: 'GET' }).catch(() => ({ items: [] })),
        ]);
        myLastBid = (mine.items || [])[0] || null;
        bidderCount = new Set((all.items || []).map((b) => b.bidderId)).size;
      } catch { /* non-fatal */ }
    }

    render(auction, access, myLastBid, bidderCount);
  }

  /* ── Render ──────────────────────────────────────────── */
  function render(auction, access, myLastBid, bidderCount) {
    const status = auction.status;
    const currentPrice = Number(auction.finalPrice) || 0;
    const isEnded = status === 'ended';
    const isWinner = isEnded && auction.buyerId != null && String(auction.buyerId) === String(user.id);
    const isSeller = String(auction.sellerId) === String(user.id);

    const img = auction.imageUrl
      ? `<img class="rad-thumb__img" src="${escapeHtml(auction.imageUrl)}" alt="${escapeHtml(auction.productName || '')}" />`
      : `<div class="rad-thumb__ph">🌾</div>`;

    body.innerHTML = `
      <div class="rad-thumb">
        ${img}
        <span class="rad-status rad-status--${escapeHtml(status)}">${statusLabel(status)}</span>
      </div>

      <div class="rad-info">
        <h2 class="rad-title">${escapeHtml(auction.productName || '상품')}</h2>
        <div class="rad-price-row">
          <span class="rad-price-label">현재가</span>
          <strong class="rad-price">${formatPrice(currentPrice)}</strong>
        </div>
        <div class="rad-meta-grid">
          <div class="rad-meta"><span>시작가</span><b>${formatPrice(auction.startPrice)}</b></div>
          ${auction.buyNowPrice != null ? `<div class="rad-meta"><span>즉시구매가</span><b>${formatPrice(auction.buyNowPrice)}</b></div>` : ''}
          ${auction.minimumBidIncrement != null ? `<div class="rad-meta"><span>최소 입찰단위</span><b>${formatPrice(auction.minimumBidIncrement)}</b></div>` : ''}
          <div class="rad-meta"><span>남은 시간</span><b id="rad-remain">—</b></div>
          <div class="rad-meta"><span>입찰자 수</span><b>${bidderCount != null ? bidderCount + '명' : '입장 후 확인'}</b></div>
          <div class="rad-meta"><span>나의 최근 입찰가</span><b>${myLastBid ? formatPrice(myLastBid.amount) : '—'}</b></div>
          <div class="rad-meta"><span>판매자</span><b>${escapeHtml(auction.sellerName || '—')}</b></div>
          <div class="rad-meta"><span>배송비</span><b>${auction.shippingFee ? formatPrice(auction.shippingFee) : '무료'}</b></div>
        </div>

        <div class="rad-badges">
          ${renderAccessBadge(access)}
        </div>
      </div>

      <div class="rad-action" id="rad-action"></div>
    `;

    // Countdown
    const remainEl = body.querySelector('#rad-remain');
    if (auction.endsAt && !isEnded) {
      const endMs = new Date(auction.endsAt).getTime();
      const tick = () => {
        const diff = endMs - Date.now();
        if (diff <= 0) { remainEl.textContent = '종료'; clearCountdown(); reload(); return; }
        remainEl.textContent = formatRemain(diff);
      };
      tick();
      countdownTimer = setInterval(tick, 1000);
    } else {
      remainEl.textContent = isEnded ? '종료됨' : '—';
    }

    renderAction(auction, access, isEnded, isWinner, isSeller, currentPrice);
  }

  function renderAccessBadge(access) {
    if (!access.requiresEntryAuth) return `<span class="rad-badge rad-badge--ok">입장 인증 불필요</span>`;
    if (access.hasAccess) {
      const exp = access.expiresAt ? ` · ${new Date(access.expiresAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}까지` : '';
      return `<span class="rad-badge rad-badge--ok">경매장 입장 완료${exp}</span>`;
    }
    return `<span class="rad-badge rad-badge--wait">입장 인증 필요</span>`;
  }

  function renderAction(auction, access, isEnded, isWinner, isSeller, currentPrice) {
    const actEl = body.querySelector('#rad-action');

    if (isEnded) {
      if (isWinner) {
        actEl.innerHTML = `
          <div class="rad-won">🎉 축하합니다! 낙찰되었습니다.</div>
          <button class="rad-primary" id="rad-checkout" type="button">${formatPrice(currentPrice)} 결제하러 가기</button>
        `;
        actEl.querySelector('#rad-checkout').addEventListener('click', () => navigate(`/app/checkout/${encodeURIComponent(id)}`));
      } else {
        actEl.innerHTML = `<div class="rad-ended-note">종료된 경매입니다.</div>`;
      }
      return;
    }

    if (isSeller) {
      actEl.innerHTML = `<div class="rad-ended-note">내가 등록한 경매입니다.</div>`;
      return;
    }

    // 진행 중 — 입장 여부에 따라 분기
    if (!access.hasAccess && access.requiresEntryAuth) {
      actEl.innerHTML = `<button class="rad-primary" id="rad-enter" type="button">결제 비밀번호 입력 후 경매장 입장</button>`;
      actEl.querySelector('#rad-enter').addEventListener('click', () => onEnter());
      return;
    }

    // 입장 완료 — 입찰 UI
    const startAmount = currentPrice + BID_STEPS[0];
    actEl.innerHTML = `
      <div class="rad-bid">
        <div class="rad-bid__chips">
          ${BID_STEPS.map((s) => `<button class="rad-chip" type="button" data-step="${s}">+${formatPriceRaw(s)}</button>`).join('')}
        </div>
        <label class="rad-bid__field">
          <span class="rad-bid__hint" id="rad-hint">현재가보다 높게 입찰해주세요</span>
          <div class="rad-bid__input">
            <input type="tel" inputmode="numeric" id="rad-bid-amount" value="${startAmount.toLocaleString('ko-KR')}" />
            <span>원</span>
          </div>
        </label>
        <button class="rad-primary" id="rad-bid-btn" type="button">${formatPrice(startAmount)} 입찰하기</button>
        <button class="rad-link" id="rad-leave" type="button">인증 해제</button>
      </div>
    `;

    const amtEl = actEl.querySelector('#rad-bid-amount');
    const bidBtn = actEl.querySelector('#rad-bid-btn');
    const parseNum = (v) => Number(String(v).replace(/[^\d]/g, '')) || 0;
    const syncBtn = () => {
      const amt = parseNum(amtEl.value);
      bidBtn.textContent = `${formatPrice(amt)} 입찰하기`;
      bidBtn.disabled = amt <= currentPrice;
    };
    amtEl.addEventListener('input', () => { const n = parseNum(amtEl.value); amtEl.value = n ? n.toLocaleString('ko-KR') : ''; syncBtn(); });
    actEl.querySelectorAll('.rad-chip').forEach((c) => c.addEventListener('click', () => {
      amtEl.value = (parseNum(amtEl.value) + Number(c.dataset.step)).toLocaleString('ko-KR');
      syncBtn();
    }));
    syncBtn();

    bidBtn.addEventListener('click', async () => {
      const amount = parseNum(amtEl.value);
      if (amount <= currentPrice) return;
      bidBtn.disabled = true;
      const prevText = bidBtn.textContent;
      bidBtn.textContent = '입찰 중...';
      const ok = await doBid(amount, uuid(), false);
      if (!ok) { bidBtn.textContent = prevText; bidBtn.disabled = false; }
    });

    actEl.querySelector('#rad-leave').addEventListener('click', async () => {
      try {
        await request(`/api/auctions/${encodeURIComponent(id)}/access-session`, { method: 'DELETE' });
        showToast('경매장 인증을 해제했습니다', { variant: 'info', duration: 1600 });
        reload();
      } catch { showToast('해제에 실패했습니다', { variant: 'error' }); }
    });
  }

  /* ── Enter ───────────────────────────────────────────── */
  async function onEnter() {
    // 입장 인증이 불필요하거나 이미 세션이 있으면 모달 없이 처리
    try {
      const st = await request(`/api/auctions/${encodeURIComponent(id)}/access-status`, { method: 'GET' });
      if (!st.requiresEntryAuth) {
        await request(`/api/auctions/${encodeURIComponent(id)}/enter`, { method: 'POST', body: JSON.stringify({}) });
        showToast('경매장에 입장했습니다', { variant: 'success', duration: 1400 });
        reload();
        return;
      }
      if (st.hasAccess) { reload(); return; }
    } catch { /* fall through to modal */ }

    const result = await showPaymentPasswordModal({
      title: '경매장 입장',
      subtitle: '결제 비밀번호를 입력하면 경매장에 입장합니다',
      onSubmit: (pin) => request(`/api/auctions/${encodeURIComponent(id)}/enter`, {
        method: 'POST',
        body: JSON.stringify({ password: pin }),
      }),
    });
    if (result) {
      showToast('경매장에 입장했습니다', { variant: 'success', duration: 1400 });
      reload();
    }
  }

  /* ── Bid ─────────────────────────────────────────────── */
  async function doBid(amount, idem, reauthed) {
    try {
      await request(`/api/auctions/${encodeURIComponent(id)}/bids`, {
        method: 'POST',
        body: JSON.stringify({ amount, idempotencyKey: idem }),
      });
      showToast(`${formatPrice(amount)} 입찰 완료`, { variant: 'success', duration: 1600 });
      reload();
      return true;
    } catch (err) {
      const code = err.code || err.message;
      const serverMsg = (err.body && err.body.message) || '';

      if ((code === 'HIGH_VALUE_REAUTH_REQUIRED' || code === 'PAYMENT_AUTH_SESSION_EXPIRED') && !reauthed) {
        const ok = await showPaymentPasswordModal({
          title: '고액 입찰 재인증',
          subtitle: '고액 입찰을 위해 결제 비밀번호를 다시 입력해주세요',
          onSubmit: (pin) => request('/api/payment-auth/sessions', {
            method: 'POST',
            body: JSON.stringify({ password: pin, purpose: 'HIGH_VALUE_BID' }),
          }),
        });
        if (ok) return doBid(amount, idem, true); // 동일 멱등키로 재시도
        return false;
      }

      if (code === 'AUCTION_ACCESS_REQUIRED' || code === 'AUCTION_ACCESS_SESSION_EXPIRED') {
        showToast('경매장 입장 인증이 필요합니다', { variant: 'error' });
        reload();
        return true;
      }

      // BID_TOO_LOW 등 — 서버 메시지에 실제 최소 입찰가가 포함됨
      const hintEl = body.querySelector('#rad-hint');
      if (hintEl && serverMsg) hintEl.textContent = serverMsg;
      showToast(serverMsg || '입찰에 실패했습니다', { variant: 'error', duration: 2400 });
      return false;
    }
  }

  reload();
  return page;
}

/* ── helpers ─────────────────────────────────────────── */
function statusLabel(status) {
  return { pending: '대기', live: 'LIVE', ended: '종료' }[status] || status;
}
function formatRemain(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${String(sec).padStart(2, '0')}초`;
  return `${sec}초`;
}
