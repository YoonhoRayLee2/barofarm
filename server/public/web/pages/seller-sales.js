/**
 * Seller Sales Page — 판매내역 목록
 * Route: /app/seller/sales
 *
 * @module pages/seller-sales
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';

const _cssId = 'page-css-seller-sales';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/seller-sales.css';
  document.head.appendChild(link);
}

const DELIVERY_LABELS = {
  payment_complete:    '결제완료',
  shipped:             '발송완료',
  purchase_confirmed:  '정산대기',
  settlement_complete: '정산완료',
};

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'sales-page';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <header class="sales-header">
      <button class="sales-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="sales-header__title">판매내역</h1>
    </header>
    <div class="sales-content" id="sales-content">
      <div class="sales-loading">
        <div class="sales-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    </div>
  `;

  page.querySelector('.sales-header__back').addEventListener('click', () => window.history.back());

  async function loadSales() {
    const contentEl = page.querySelector('#sales-content');
    contentEl.innerHTML = `
      <div class="sales-loading">
        <div class="sales-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    `;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/sales`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sales = await res.json();
      renderSales(contentEl, sales);
    } catch (err) {
      contentEl.innerHTML = `
        <div class="sales-empty">
          <span class="sales-empty__icon">⚠️</span>
          <span class="sales-empty__title">데이터를 불러올 수 없습니다</span>
          <button class="sales-empty__retry" id="sales-retry">다시 시도</button>
        </div>
      `;
      contentEl.querySelector('#sales-retry').addEventListener('click', loadSales);
    }
  }

  function renderSales(container, list) {
    if (!list || list.length === 0) {
      container.innerHTML = `
        <div class="sales-empty">
          <span class="sales-empty__icon">📦</span>
          <span class="sales-empty__title">판매 내역이 없습니다</span>
          <span class="sales-empty__desc">라이브 경매를 진행하여 낙찰되면<br>여기에 기록됩니다.</span>
        </div>
      `;
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'sales-list';
    list.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'sales-item';
      const dateStr = item.soldAt ? formatDate(item.soldAt) : '—';
      const modeLabel = { blind: '블라인드', fcfs: '선착순', giveaway: '나눔', direct: '직접구매' }[item.mode] ?? '경매';
      const imgSrc = item.imageUrl || null;
      const statusKey = item.deliveryStatus || 'payment_complete';
      const statusLabel = DELIVERY_LABELS[statusKey] || statusKey;

      li.innerHTML = `
        <div class="sales-item__thumb">
          ${imgSrc
            ? `<img src="${escapeAttr(imgSrc)}" alt="${escapeHtml(item.productName)}" loading="lazy">`
            : `<span class="sales-item__thumb-fallback">🌿</span>`}
        </div>
        <div class="sales-item__body">
          <div class="sales-item__row">
            <span class="sales-item__name">${escapeHtml(item.productName || '상품')}</span>
            <span class="sales-item__price">${formatPrice(item.finalPrice)}</span>
          </div>
          <div class="sales-item__meta">
            <span>${dateStr}</span>
            <span class="sales-item__mode">${modeLabel}</span>
            <span class="sales-item__status sales-item__status--${statusKey}">${statusLabel}</span>
          </div>
        </div>
      `;
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => navigate('/app/order-detail/' + item.auctionId));
      ul.appendChild(li);
    });
    container.innerHTML = '';
    container.appendChild(ul);
  }

  loadSales();
  return page;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(iso); }
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

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
