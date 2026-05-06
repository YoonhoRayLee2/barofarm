/**
 * Profile Orders Page — 구매내역 목록
 * Route: /app/profile/orders
 *
 * @module pages/profile-orders
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';

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

  const DELIVERY_LABELS = {
    payment_complete:    '결제완료',
    shipped:             '발송완료',
    purchase_confirmed:  '구매확정',
    settlement_complete: '정산완료',
  };

  const FILTER_OPTIONS = [
    { value: '',                     label: '전체' },
    { value: 'payment_complete',     label: '결제완료' },
    { value: 'shipped',              label: '발송완료' },
    { value: 'purchase_confirmed',   label: '구매확정' },
    { value: 'settlement_complete',  label: '정산완료' },
  ];

  const page = document.createElement('div');
  page.className = 'orders-page';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <header class="orders-header">
      <button class="orders-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="orders-header__title">주문 목록</h1>
    </header>
    <div class="orders-filter-bar">
      <span class="orders-filter-bar__label">배송 상태</span>
      <select class="orders-filter-bar__select" id="orders-filter" aria-label="배송 상태 필터">
        ${FILTER_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
      </select>
    </div>
    <div class="orders-content" id="orders-content">
      <div class="orders-loading">
        <div class="orders-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    </div>
  `;

  page.querySelector('.orders-header__back').addEventListener('click', () => window.history.back());

  let allOrders = [];
  const filterEl = page.querySelector('#orders-filter');
  const contentEl = page.querySelector('#orders-content');

  filterEl.addEventListener('change', () => {
    const filtered = filterEl.value
      ? allOrders.filter(o => o.deliveryStatus === filterEl.value)
      : allOrders;
    renderOrders(contentEl, filtered, filterEl.value);
  });

  async function loadOrders() {
    contentEl.innerHTML = `
      <div class="orders-loading">
        <div class="orders-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    `;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/orders`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      allOrders = await res.json();
      renderOrders(contentEl, allOrders, '');
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

  function renderOrders(container, list, activeFilter) {
    if (!list || list.length === 0) {
      const msg = activeFilter
        ? `'${DELIVERY_LABELS[activeFilter]}' 내역이 없습니다`
        : '구매 내역이 없습니다';
      container.innerHTML = `
        <div class="orders-empty">
          <span class="orders-empty__icon">🛍️</span>
          <span class="orders-empty__title">${msg}</span>
          ${!activeFilter ? '<span class="orders-empty__desc">라이브 경매에 참여하여 낙찰받으면<br>여기에 기록됩니다.</span>' : ''}
        </div>
      `;
      return;
    }

    // (sellerId, liveId) 기준 그룹화
    const groupMap = new Map();
    list.forEach((order) => {
      const key = `${order.sellerId ?? 'na'}__${order.liveId ?? 'direct'}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          sellerId: order.sellerId,
          sellerName: order.sellerName || '판매자',
          liveId: order.liveId ?? null,
          liveTitle: order.liveTitle || null,
          liveCreatedAt: order.liveCreatedAt || null,
          firstOrderAt: order.orderAt || null,
          items: [],
        });
      }
      const g = groupMap.get(key);
      g.items.push(order);
      // 그룹의 첫 번째(가장 최신) orderAt 추적
      if (order.orderAt && (!g.firstOrderAt || new Date(order.orderAt) > new Date(g.firstOrderAt))) {
        g.firstOrderAt = order.orderAt;
      }
    });

    // 그룹 정렬: 최신 firstOrderAt 내림차순
    const groups = Array.from(groupMap.values()).sort((a, b) => {
      const ta = a.firstOrderAt ? new Date(a.firstOrderAt).getTime() : 0;
      const tb = b.firstOrderAt ? new Date(b.firstOrderAt).getTime() : 0;
      return tb - ta;
    });

    const groupsWrap = document.createElement('div');
    groupsWrap.className = 'orders-groups';

    groups.forEach((group) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'orders-group';

      const firstItem = group.items[0];
      const modeLabel = firstItem && firstItem.mode !== 'direct' ? '라이브 경매' : '직접 구매';
      const dateLabel = group.liveCreatedAt ? formatLiveDate(group.liveCreatedAt) : modeLabel;

      const header = document.createElement('div');
      header.className = 'orders-group__header';
      header.innerHTML = `
        <span class="orders-group__seller">${escapeHtml(group.sellerName)}</span>
        ${dateLabel ? `<span class="orders-group__live">${escapeHtml(dateLabel)}</span>` : ''}
      `;
      groupEl.appendChild(header);

      const ul = document.createElement('ul');
      ul.className = 'orders-list';
      group.items.forEach((order) => {
        const li = document.createElement('li');
        li.className = 'orders-item';
        const dateStr = order.orderAt ? formatDate(order.orderAt) : '—';
        const modeLabel = order.mode === 'blind' ? '블라인드' : order.mode === 'fcfs' ? '선착순' : '경매';
        const imgSrc = order.imageUrl || null;
        const dsKey = order.deliveryStatus || 'payment_complete';
        const dsLabel = DELIVERY_LABELS[dsKey] || dsKey;
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
              <span class="orders-item__delivery-status orders-item__delivery-status--${dsKey}">${dsLabel}</span>
            </div>
          </div>
        `;
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => navigate('/app/order-detail/' + order.auctionId));
        ul.appendChild(li);
      });
      groupEl.appendChild(ul);
      groupsWrap.appendChild(groupEl);
    });

    container.innerHTML = '';
    container.appendChild(groupsWrap);
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

function formatLiveDate(iso) {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}.${m}.${day} ${h}:${min}`;
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
