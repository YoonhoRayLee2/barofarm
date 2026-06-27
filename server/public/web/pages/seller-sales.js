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
import { catIcon } from '/app/components/brand-assets.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';

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

  const _toDefault   = new Date();
  const _fromDefault = new Date();
  _fromDefault.setMonth(_fromDefault.getMonth() - 3);
  const _fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  page.innerHTML = `
    <header class="sales-header">
      <button class="sales-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="sales-header__title">판매내역</h1>
      <select class="sales-status-filter" id="sales-status-filter" aria-label="상태 필터">
        <option value="">전체</option>
        <option value="payment_complete">결제완료</option>
        <option value="shipped">발송완료</option>
        <option value="purchase_confirmed">정산대기</option>
        <option value="settlement_complete">정산완료</option>
      </select>
    </header>
    <div class="sales-date-bar">
      <input type="date" class="sales-date-input" id="sales-date-from" value="${_fmt(_fromDefault)}" max="${_fmt(_toDefault)}" />
      <span class="sales-date-sep">~</span>
      <input type="date" class="sales-date-input" id="sales-date-to" value="${_fmt(_toDefault)}" max="${_fmt(_toDefault)}" />
      <span class="sales-date-hint" id="sales-date-hint"></span>
    </div>
    <div class="sales-content" id="sales-content">
      <div class="sales-loading">
        <div class="sales-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    </div>
  `;

  page.querySelector('.sales-header__back').addEventListener('click', () => window.history.back());

  const contentEl = page.querySelector('#sales-content');
  page.appendChild(createBottomTabBar());
  const filterEl  = page.querySelector('#sales-status-filter');
  const fromEl    = page.querySelector('#sales-date-from');
  const toEl      = page.querySelector('#sales-date-to');
  const hintEl    = page.querySelector('#sales-date-hint');
  let _allSales   = [];

  function applyFilter() {
    const status  = filterEl.value;
    const fromVal = fromEl.value;
    const toVal   = toEl.value;

    if (fromVal && toVal) {
      const from    = new Date(fromVal);
      const to      = new Date(toVal);
      const maxFrom = new Date(toVal);
      maxFrom.setMonth(maxFrom.getMonth() - 3);

      if (from > to) {
        hintEl.textContent = '시작일이 종료일보다 늦습니다';
        hintEl.className = 'sales-date-hint sales-date-hint--error';
        return;
      }
      if (from < maxFrom) {
        hintEl.textContent = '최대 3개월 범위까지 조회 가능합니다';
        hintEl.className = 'sales-date-hint sales-date-hint--error';
        fromEl.value = _fmt(maxFrom);
        return;
      }
      hintEl.textContent = '';
      hintEl.className = 'sales-date-hint';
    }

    const fromTs = fromVal ? new Date(fromVal).getTime() : 0;
    const toTs   = toVal   ? new Date(toVal + 'T23:59:59').getTime() : Infinity;

    let filtered = _allSales.filter(o => {
      const t = o.soldAt || o.liveStartedAt ? new Date(o.soldAt || o.liveStartedAt).getTime() : 0;
      return t >= fromTs && t <= toTs;
    });
    if (status) {
      filtered = filtered.filter(o => (o.deliveryStatus || 'payment_complete') === status);
    }
    renderSales(contentEl, filtered);
  }

  filterEl.addEventListener('change', applyFilter);
  fromEl.addEventListener('change', applyFilter);
  toEl.addEventListener('change', applyFilter);

  async function loadSales() {
    contentEl.innerHTML = `
      <div class="sales-loading">
        <div class="sales-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    `;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/sales`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _allSales = await res.json();
      applyFilter();
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
      container.appendChild(createTabSpacer());
      return;
    }

    // 1. live/deal 기준 그룹핑
    const liveMap = new Map();
    list.forEach((item) => {
      const liveKey = item.liveId || '__direct__';
      if (!liveMap.has(liveKey)) {
        liveMap.set(liveKey, {
          liveId: item.liveId,
          liveTitle: item.liveTitle,
          liveStartedAt: item.liveStartedAt,
          isGroupDeal: item.itemType === 'group_deal',
          dealId: item.dealId || null,
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
      const isGroupDeal = liveGroup.isGroupDeal;

      const groupEl = document.createElement('div');
      groupEl.className = 'sg-group';

      const headerEl = document.createElement('div');
      headerEl.className = 'sg-header';
      const dateStr = liveGroup.liveStartedAt ? formatDateShort(liveGroup.liveStartedAt) : (allItems[0]?.soldAt ? formatDateShort(allItems[0].soldAt) : '');
      let badgeClass = '';
      let badgeText = 'LIVE';
      if (isGroupDeal) { badgeClass = 'sg-live-badge--group'; badgeText = '공동판매'; }
      else if (isDirect) { badgeClass = 'sg-live-badge--direct'; badgeText = '직접구매'; }
      headerEl.innerHTML = `
        <div class="sg-header__left">
          <span class="sg-live-badge ${badgeClass}">${badgeText}</span>
          ${liveGroup.liveTitle && isGroupDeal ? `<span class="sg-header__title">${escapeHtml(liveGroup.liveTitle)}</span>` : ''}
          <span class="sg-header__date">${dateStr}</span>
        </div>
        <span class="sg-header__summary">${allItems.length}건 · ${formatPrice(totalPrice)}</span>
      `;
      if (isGroupDeal && liveGroup.dealId) {
        headerEl.style.cursor = 'pointer';
        headerEl.addEventListener('click', () => navigate('/app/group-deals/' + liveGroup.dealId));
      }
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
        if (buyerGroup.buyerId) {
          buyerHeader.style.cursor = 'pointer';
          buyerHeader.addEventListener('click', () => navigate('/app/user/' + buyerGroup.buyerId));
        }
        buyerEl.appendChild(buyerHeader);

        buyerGroup.items.forEach((item) => {
          const modeLabel = { blind: '블라인드', fcfs: '선착순', giveaway: '나눔', direct: '직접구매', group_deal: '공동판매' }[item.mode] ?? '경매';
          const statusKey = item.deliveryStatus || 'payment_complete';
          const statusLabel = DELIVERY_LABELS[statusKey] || statusKey;

          const row = document.createElement('div');
          row.className = 'sg-item';
          row.innerHTML = `
            <div class="sg-item__thumb">
              ${item.imageUrl
                ? `<img src="${escapeAttr(item.imageUrl)}" alt="" loading="lazy">`
                : `<span class="sg-item__thumb-fallback" style="display:flex;align-items:center;justify-content:center;background:#EAF2DC">${catIcon(item.category || '채소', 26)}</span>`}
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
          if (item.itemType === 'group_deal') {
            row.addEventListener('click', () => navigate('/app/group-deals/' + item.dealId));
          } else {
            row.addEventListener('click', () => navigate('/app/order-detail/' + item.auctionId));
          }
          buyerEl.appendChild(row);
        });

        groupEl.appendChild(buyerEl);
      });

      wrap.appendChild(groupEl);
    });

    container.innerHTML = '';
    container.appendChild(wrap);
    container.appendChild(createTabSpacer());
  }

  loadSales();
  return page;
}

