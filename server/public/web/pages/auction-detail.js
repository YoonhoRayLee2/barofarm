/**
 * Auction Detail Page — 4-1b-A
 * Fetches live details by id, renders seller info + "라이브 진입" button.
 * If user is the seller → navigate to live-seller, otherwise → live-buyer.
 * Ended lives show summary.
 *
 * @module pages/auction-detail
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';

// Inject page CSS once
const _cssId = 'page-css-auction-detail';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/auction-detail.css';
  document.head.appendChild(link);
}

/**
 * @param {{ id?: string }} [params]
 * @returns {Promise<HTMLElement>}
 */
export default async function load(params) {
  // Auth guard
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

  const liveId = params?.id || '';

  const page = document.createElement('div');
  page.className = 'auction-detail-page';
  page.dataset.theme = 'light';

  // Header
  const header = document.createElement('header');
  header.className = 'auction-detail-header';
  header.innerHTML = `
    <button class="auction-detail-header__back" aria-label="뒤로 가기">‹</button>
    <h1 class="auction-detail-header__title">라이브 정보</h1>
  `;
  header.querySelector('.auction-detail-header__back').addEventListener('click', () => window.history.back());
  page.appendChild(header);

  // Loading state
  const content = document.createElement('div');
  content.className = 'auction-detail-content';
  content.innerHTML = `
    <div class="auction-detail-loading">
      <div class="auction-detail-loading__dot"></div>
      <span class="auction-detail-loading__text">로딩 중...</span>
    </div>
  `;
  page.appendChild(content);

  // Fetch live data
  try {
    const res = await fetch(`/api/lives/${encodeURIComponent(liveId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const live = await res.json();
    renderLive(content, live, user);
  } catch (err) {
    content.innerHTML = `
      <div class="auction-detail-error">
        <span class="auction-detail-error__icon">⚠️</span>
        <p class="auction-detail-error__msg">라이브 정보를 불러올 수 없습니다.</p>
        <button class="auction-detail-error__retry">다시 시도</button>
      </div>
    `;
    content.querySelector('.auction-detail-error__retry').addEventListener('click', () => {
      navigate(`/app/auction-detail/${encodeURIComponent(liveId)}`);
    });
    console.error('[auction-detail] fetch error', err);
  }

  return page;
}

/**
 * Render live detail into content div.
 * @param {HTMLElement} content
 * @param {object} live
 * @param {object} user
 */
function renderLive(content, live, user) {
  const isEnded = live.status === 'ended';
  const isSeller = user.id && live.sellerId === user.id;

  if (isEnded) {
    renderEnded(content, live);
    return;
  }

  const viewers = live.viewerCount ?? 0;
  const price = live.currentAuction?.currentPrice ?? null;
  const productName = live.currentAuction?.productName ?? null;

  content.innerHTML = `
    <div class="auction-detail-thumb">
      <div class="auction-detail-thumb__placeholder">
        <span class="auction-detail-thumb__icon">📡</span>
        <span class="auction-detail-thumb__label">LIVE</span>
      </div>
      <div class="auction-detail-live-badge">
        <span class="auction-detail-live-badge__dot"></span>
        <span class="auction-detail-live-badge__text">LIVE</span>
      </div>
      <div class="auction-detail-viewers">
        <span>👁</span>
        <span>${viewers}명 시청 중</span>
      </div>
    </div>

    <div class="auction-detail-info">
      <h2 class="auction-detail-info__title">${escapeHtml(live.title || '라이브 방송')}</h2>
      <div class="auction-detail-info__seller">
        <span class="auction-detail-info__seller-label">판매자</span>
        <span class="auction-detail-info__seller-name">${escapeHtml(live.sellerName || live.sellerId || '알 수 없음')}</span>
        ${isSeller ? '<span class="auction-detail-info__my-badge">내 방송</span>' : ''}
      </div>
      ${price != null ? `
        <div class="auction-detail-info__price-row">
          <span class="auction-detail-info__price-label">${productName ? escapeHtml(productName) + ' · 현재가' : '현재가'}</span>
          <span class="auction-detail-info__price">${formatPrice(price)}</span>
        </div>
      ` : `
        <div class="auction-detail-info__price-row">
          <span class="auction-detail-info__price-label">경매 대기 중</span>
        </div>
      `}
    </div>

    <div class="auction-detail-cta">
      <button class="auction-detail-cta__btn" id="auction-detail-enter-btn">
        ${isSeller ? '내 라이브 관리' : '라이브 입장'}
      </button>
    </div>
  `;

  content.querySelector('#auction-detail-enter-btn').addEventListener('click', () => {
    if (isSeller) {
      navigate(`/app/live-seller/${encodeURIComponent(live.id)}`);
    } else {
      navigate(`/app/live-buyer/${encodeURIComponent(live.id)}`);
    }
  });
}

/**
 * Render ended live summary.
 * @param {HTMLElement} content
 * @param {object} live
 */
function renderEnded(content, live) {
  const totalAuctions = live.totalAuctions ?? live.auctions?.length ?? 0;
  const totalRevenue = live.totalRevenue ?? 0;

  content.innerHTML = `
    <div class="auction-detail-ended">
      <span class="auction-detail-ended__icon">📴</span>
      <h2 class="auction-detail-ended__title">${escapeHtml(live.title || '라이브 방송')}</h2>
      <p class="auction-detail-ended__status">방송 종료</p>

      <div class="auction-detail-ended__summary">
        <div class="auction-detail-ended__summary-item">
          <span class="auction-detail-ended__summary-label">낙찰 품목</span>
          <span class="auction-detail-ended__summary-value">${totalAuctions}개</span>
        </div>
        ${totalRevenue > 0 ? `
          <div class="auction-detail-ended__summary-item">
            <span class="auction-detail-ended__summary-label">총 매출</span>
            <span class="auction-detail-ended__summary-value">${formatPrice(totalRevenue)}</span>
          </div>
        ` : ''}
      </div>

      <p class="auction-detail-ended__notice">다시 보기는 지원되지 않습니다.</p>

      <button class="auction-detail-ended__back" id="auction-detail-back-btn">← 홈으로</button>
    </div>
  `;

  content.querySelector('#auction-detail-back-btn').addEventListener('click', () => {
    navigate('/app/home');
  });
}

function formatPrice(price) {
  if (price == null) return '—';
  return Number(price).toLocaleString('ko-KR') + '원';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
