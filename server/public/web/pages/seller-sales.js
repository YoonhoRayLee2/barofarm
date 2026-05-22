/**
 * Seller Sales Page — 판매내역 목록
 * Route: /app/seller/sales
 *
 * @module pages/seller-sales
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { personIconSVG } from '/app/scripts/person-icon.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';
import { formatPrice, formatDateShort } from '/app/scripts/format.js';

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

    // 1. live 기준 그룹핑 (liveId null → '직접구매' 그룹)
    const liveMap = new Map(); // liveId(or '__direct__') → { meta, buyers: Map }
    list.forEach((item) => {
      const liveKey = item.liveId || '__direct__';
      if (!liveMap.has(liveKey)) {
        liveMap.set(liveKey, {
          liveId: item.liveId,
          liveTitle: item.liveTitle,
          liveStartedAt: item.liveStartedAt,
          buyers: new Map(),
        });
      }
      const liveGroup = liveMap.get(liveKey);
      const buyerKey = item.buyerId || '__unknown__';
      if (!liveGroup.buyers.has(buyerKey)) {
        liveGroup.buyers.set(buyerKey, {
          buyerId: item.buyerId,
          buyerName: item.buyerName,
          items: [],
        });
      }
      liveGroup.buyers.get(buyerKey).items.push(item);
    });

    const wrap = document.createElement('div');
    wrap.className = 'sales-groups';

    liveMap.forEach((liveGroup) => {
      const allItems = [...liveGroup.buyers.values()].flatMap(b => b.items);
      const totalPrice = allItems.reduce((s, i) => s + (i.finalPrice || 0), 0);
      const isDirect = !liveGroup.liveId;

      // 라이브 그룹 헤더
      const groupEl = document.createElement('div');
      groupEl.className = 'sg-group';

      const headerEl = document.createElement('div');
      headerEl.className = 'sg-header';
      const dateStr = liveGroup.liveStartedAt ? formatDateShort(liveGroup.liveStartedAt) : (allItems[0]?.soldAt ? formatDateShort(allItems[0].soldAt) : '');
      headerEl.innerHTML = `
        <div class="sg-header__left">
          <span class="sg-live-badge ${isDirect ? 'sg-live-badge--direct' : ''}">${isDirect ? '직접구매' : 'LIVE'}</span>
          <span class="sg-header__date">${dateStr}</span>
        </div>
        <span class="sg-header__summary">${allItems.length}건 · ${formatPrice(totalPrice)}</span>
      `;
      groupEl.appendChild(headerEl);

      // 구매자 별 섹션
      liveGroup.buyers.forEach((buyerGroup) => {
        const buyerEl = document.createElement('div');
        buyerEl.className = 'sg-buyer';

        const buyerHeader = document.createElement('div');
        buyerHeader.className = 'sg-buyer__header';
        buyerHeader.innerHTML = `
          <div class="sg-buyer__avatar">${personIconSVG(24)}</div>
          <span class="sg-buyer__name">${escapeHtml(buyerGroup.buyerName || '알 수 없음')}</span>
          <span class="sg-buyer__count">${buyerGroup.items.length}건</span>
        `;
        buyerEl.appendChild(buyerHeader);

        buyerGroup.items.forEach((item) => {
          const modeLabel = { blind: '블라인드', fcfs: '선착순', giveaway: '나눔', direct: '직접구매' }[item.mode] ?? '경매';
          const statusKey = item.deliveryStatus || 'payment_complete';
          const statusLabel = DELIVERY_LABELS[statusKey] || statusKey;

          const row = document.createElement('div');
          row.className = 'sg-item';
          row.innerHTML = `
            <div class="sg-item__thumb">
              ${item.imageUrl
                ? `<img src="${escapeAttr(item.imageUrl)}" alt="" loading="lazy">`
                : `<span class="sg-item__thumb-fallback">🌿</span>`}
            </div>
            <div class="sg-item__body">
              <span class="sg-item__name">${escapeHtml(item.productName || '상품')}</span>
              <div class="sg-item__meta">
                <span class="sg-item__mode">${modeLabel}</span>
                <span class="sg-item__status sg-item__status--${statusKey}">${statusLabel}</span>
              </div>
            </div>
            <span class="sg-item__price">${formatPrice(item.finalPrice)}</span>
          `;
          row.style.cursor = 'pointer';
          row.addEventListener('click', () => navigate('/app/order-detail/' + item.auctionId));
          buyerEl.appendChild(row);
        });

        groupEl.appendChild(buyerEl);
      });

      wrap.appendChild(groupEl);
    });

    container.innerHTML = '';
    container.appendChild(wrap);
  }

  loadSales();
  return page;
}

