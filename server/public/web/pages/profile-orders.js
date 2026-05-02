/**
 * Profile Orders Page — 구매내역 목록
 * Route: /app/profile/orders
 *
 * @module pages/profile-orders
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace } from '/app/scripts/router.js';

const _cssId = 'page-css-profile-orders';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/profile-orders.css';
  document.head.appendChild(link);
}

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'orders-page';

  page.innerHTML = `
    <header class="orders-header">
      <button class="orders-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="orders-header__title">주문 목록</h1>
    </header>
    <div class="orders-content" id="orders-content">
      <div class="orders-loading">
        <div class="orders-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    </div>
  `;

  page.querySelector('.orders-header__back').addEventListener('click', () => window.history.back());

  async function loadOrders() {
    const contentEl = page.querySelector('#orders-content');
    contentEl.innerHTML = `
      <div class="orders-loading">
        <div class="orders-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    `;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/orders`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const orders = await res.json();
      renderOrders(contentEl, orders);
    } catch (err) {
      contentEl.innerHTML = `
        <div class="orders-empty">
          <span class="orders-empty__icon">⚠️</span>
          <span class="orders-empty__title">데이터를 불러올 수 없습니다</span>
          <button class="orders-empty__retry" id="orders-retry">다시 시도</button>
        </div>
      `;
      contentEl.querySelector('#orders-retry').addEventListener('click', loadOrders);
    }
  }

  function renderOrders(container, list) {
    if (!list || list.length === 0) {
      container.innerHTML = `
        <div class="orders-empty">
          <span class="orders-empty__icon">🛍️</span>
          <span class="orders-empty__title">구매 내역이 없습니다</span>
          <span class="orders-empty__desc">라이브 경매에 참여하여 낙찰받으면<br>여기에 기록됩니다.</span>
        </div>
      `;
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'orders-list';
    list.forEach((order) => {
      const li = document.createElement('li');
      li.className = 'orders-item';
      const dateStr = order.orderAt ? formatDate(order.orderAt) : '—';
      const modeLabel = order.mode === 'blind' ? '블라인드' : order.mode === 'fcfs' ? '선착순' : '경매';
      const imgSrc = order.imageUrl || null;
      li.innerHTML = `
        <div class="orders-item__thumb">
          ${imgSrc
            ? `<img src="${escapeAttr(imgSrc)}" alt="${escapeHtml(order.productName)}" loading="lazy">`
            : `<span class="orders-item__thumb-fallback">🌿</span>`}
        </div>
        <div class="orders-item__body">
          <div class="orders-item__row">
            <span class="orders-item__name">${escapeHtml(order.productName || '상품')}</span>
            <span class="orders-item__price">${formatPrice(order.finalPrice)}</span>
          </div>
          <div class="orders-item__meta">
            <span>${dateStr}</span>
            <span class="orders-item__mode">${modeLabel}</span>
          </div>
        </div>
      `;
      ul.appendChild(li);
    });
    container.innerHTML = '';
    container.appendChild(ul);
  }

  loadOrders();
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
