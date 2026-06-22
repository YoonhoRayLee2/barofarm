/**
 * LiveCard Component — Barofarm
 * Renders a live broadcast card with thumbnail, badge, viewer count, and info.
 *
 * @module components/live-card
 */

import { thumbFallback } from '/app/components/brand-assets.js';

// Inject CSS once
const _cssId = 'component-css-live-card';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/live-card.css';
  document.head.appendChild(link);
}

/**
 * Format a price number as Korean won string (e.g. 15,000원)
 * @param {number} price
 * @returns {string}
 */
function formatPrice(price) {
  if (price == null) return '—';
  return Number(price).toLocaleString('ko-KR') + '원';
}

/**
 * Create a LiveCard element.
 *
 * @param {import('../scripts/models.js').Live} live
 * @param {{
 *   currentUserId?: string,
 *   onClick?: (live: object) => void,
 *   favorited?: boolean,
 *   onToggleFavorite?: (liveId: string, currentFavorited: boolean) => void
 * }} [opts]
 * @returns {HTMLElement}
 */
export function createLiveCard(live, opts = {}) {
  const { currentUserId, onClick, favorited = false, onToggleFavorite } = opts;
  const isMine = currentUserId && live.sellerId === currentUserId;
  const isUpcoming = live.status === 'upcoming';
  const viewers = live.viewerCount ?? 0;
  const hasViewers = viewers > 0;
  const price = live.currentAuction?.currentPrice ?? null;
  const productName = live.currentAuction?.productName ?? null;
  const sellerDisplayName = live.sellerName || null;
  const sellerInitial = sellerDisplayName
    ? sellerDisplayName.charAt(0).toUpperCase()
    : (live.sellerId ? String(live.sellerId).charAt(0).toUpperCase() : '?');

  const card = document.createElement('article');
  card.className = 'live-card';
  card.dataset.liveId = live.id;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `라이브 방송: ${live.title}`);

  /** @type {boolean} */
  let _favorited = favorited;

  const thumbContent = live.thumbnailUrl
    ? `<img class="live-card__thumb-img" src="${escapeHtml(live.thumbnailUrl)}" alt="" loading="lazy" />`
    : `<div class="live-card__thumb-fallback" style="width:100%;height:100%;line-height:0;flex-shrink:0">${thumbFallback(live.category || '기타')}</div>`;

  card.innerHTML = `
    <div class="live-card__thumb">
      ${thumbContent}
      ${isUpcoming
        ? `<span class="live-card__upcoming-badge">예고</span>`
        : `<span class="live-card__live-badge"><span class="live-pulse"></span>LIVE</span>`
      }
      <div class="live-card__viewers"${(hasViewers && !isUpcoming) ? '' : ' style="display:none"'}>
        <span>👁</span>
        <span class="live-card__viewers-count">${viewers}</span>
      </div>
      <button class="live-card__fav-btn${_favorited ? ' is-active' : ''}" aria-label="관심 ${_favorited ? '해제' : '추가'}">
        ${_favorited ? '♥' : '♡'}
      </button>
    </div>
    <div class="live-card__info">
      <div class="live-card__title">${escapeHtml(live.title)}</div>
      <div class="live-card__seller-row">
        <div class="live-card__seller-avatar" aria-hidden="true">${escapeHtml(sellerInitial)}</div>
        <span class="live-card__seller">${escapeHtml(sellerDisplayName || '판매자')}</span>
        ${isMine ? '<span class="live-card__my-badge">내 방송</span>' : ''}
      </div>
      <div class="live-card__price-area">
        ${isUpcoming ? `
          <span class="live-card__scheduled-at">${formatScheduledAt(live.scheduledAt)}</span>
        ` : price != null ? `
          <span class="live-card__price-label">${productName ? escapeHtml(productName) + ' · ' : ''}현재가</span>
          <span class="live-card__price">${formatPrice(price)}</span>
        ` : `
          <span class="live-card__price-label">경매 대기 중</span>
        `}
      </div>
    </div>
  `;

  // Favorite button handler
  const favBtn = card.querySelector('.live-card__fav-btn');
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof onToggleFavorite === 'function') {
      onToggleFavorite(live.id, _favorited);
    }
  });

  /**
   * Update favorited state on the card.
   * @param {boolean} isFav
   */
  card.setFavorited = (isFav) => {
    _favorited = isFav;
    favBtn.textContent = isFav ? '♥' : '♡';
    favBtn.setAttribute('aria-label', `관심 ${isFav ? '해제' : '추가'}`);
    favBtn.classList.toggle('is-active', isFav);
  };

  function handleActivate(e) {
    if (onClick) {
      onClick(live);
    }
  }

  card.addEventListener('click', handleActivate);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleActivate(e);
    }
  });

  return card;
}

/**
 * Update viewer count on an existing card element.
 * Hides the chip entirely when count is 0 or falsy.
 * @param {HTMLElement} card
 * @param {number} count
 */
export function updateViewerCount(card, count) {
  const chip = card.querySelector('.live-card__viewers');
  const el = card.querySelector('.live-card__viewers-count');
  if (el) el.textContent = count;
  if (chip) chip.style.display = count > 0 ? '' : 'none';
}

function formatScheduledAt(ts) {
  if (!ts) return '일시 미정';
  const d = new Date(Number(ts));
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const day = days[d.getDay()];
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 || 12;
  const mStr = m > 0 ? `:${String(m).padStart(2, '0')}` : '';
  return `${month}월 ${date}일(${day}) ${ampm} ${h12}${mStr}시 예정`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
