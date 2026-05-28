/**
 * Profile Orders Page — 구매내역 목록
 * Route: /app/profile/orders
 *
 * URL params:
 *   - sellerId: 특정 판매자의 주문만 표시 (선택)
 *
 * 주문은 (sellerId, liveId) 기준으로 그룹화되며,
 * 각 그룹은 날짜 헤더 + 판매자 행 + 아이템 목록 + 결제 요약 + "판매자 구매 내역 보기" 버튼으로 구성.
 *
 * @module pages/profile-orders
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';
import { formatPrice, formatYmd } from '/app/scripts/format.js';

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

  // URL param: sellerId 필터 (있으면 해당 판매자만 표시)
  const urlParams = new URLSearchParams(window.location.search);
  const sellerIdFilter = urlParams.get('sellerId');

  const page = document.createElement('div');
  page.className = 'orders-page';
  page.dataset.theme = 'light';

  // 기본 날짜 범위: 최근 3개월
  const _toDefault = new Date();
  const _fromDefault = new Date();
  _fromDefault.setMonth(_fromDefault.getMonth() - 3);
  const _fmt = (d) => d.toISOString().slice(0, 10);

  page.innerHTML = `
    <header class="orders-header">
      <button class="orders-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="orders-header__title">${sellerIdFilter ? '판매자별 구매 내역' : '주문 목록'}</h1>
      <select class="orders-status-filter" id="orders-status-filter" aria-label="상태 필터">
        <option value="">전체</option>
        <option value="payment_complete">결제완료</option>
        <option value="shipped">발송완료</option>
        <option value="purchase_confirmed">구매확정</option>
        <option value="settlement_complete">정산완료</option>
      </select>
    </header>
    <div class="orders-date-bar" id="orders-date-bar">
      <input type="date" class="orders-date-input" id="orders-date-from" value="${_fmt(_fromDefault)}" max="${_fmt(_toDefault)}" />
      <span class="orders-date-sep">~</span>
      <input type="date" class="orders-date-input" id="orders-date-to" value="${_fmt(_toDefault)}" max="${_fmt(_toDefault)}" />
      <span class="orders-date-hint" id="orders-date-hint"></span>
    </div>
    <div class="orders-content" id="orders-content">
      <div class="orders-loading">
        <div class="orders-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    </div>
  `;

  page.querySelector('.orders-header__back').addEventListener('click', () => window.history.back());

  const contentEl = page.querySelector('#orders-content');
  const filterEl  = page.querySelector('#orders-status-filter');
  const fromEl    = page.querySelector('#orders-date-from');
  const toEl      = page.querySelector('#orders-date-to');
  const hintEl    = page.querySelector('#orders-date-hint');
  let _allOrders  = [];

  function applyFilter() {
    const status = filterEl.value;
    const fromVal = fromEl.value;
    const toVal   = toEl.value;

    // 날짜 범위 검증
    if (fromVal && toVal) {
      const from = new Date(fromVal);
      const to   = new Date(toVal);
      const maxFrom = new Date(toVal);
      maxFrom.setMonth(maxFrom.getMonth() - 3);

      if (from > to) {
        hintEl.textContent = '시작일이 종료일보다 늦습니다';
        hintEl.className = 'orders-date-hint orders-date-hint--error';
        return;
      }
      if (from < maxFrom) {
        hintEl.textContent = '최대 3개월 범위까지 조회 가능합니다';
        hintEl.className = 'orders-date-hint orders-date-hint--error';
        // 시작일을 자동 조정
        fromEl.value = maxFrom.toISOString().slice(0, 10);
        return;
      }
      hintEl.textContent = '';
      hintEl.className = 'orders-date-hint';
    }

    const fromTs = fromVal ? new Date(fromVal).getTime() : 0;
    const toTs   = toVal   ? new Date(toVal + 'T23:59:59').getTime() : Infinity;

    let filtered = _allOrders.filter(o => {
      const t = o.orderAt ? new Date(o.orderAt).getTime() : 0;
      return t >= fromTs && t <= toTs;
    });
    if (status) {
      filtered = filtered.filter(o => (o.deliveryStatus || 'payment_complete') === status);
    }
    renderOrders(contentEl, filtered);
  }

  filterEl.addEventListener('change', applyFilter);
  fromEl.addEventListener('change', applyFilter);
  toEl.addEventListener('change', applyFilter);

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
      let orders = await res.json();
      if (sellerIdFilter) {
        orders = orders.filter(o => String(o.sellerId) === String(sellerIdFilter));
      }
      _allOrders = orders;
      applyFilter();
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
      const msg = sellerIdFilter
        ? '이 판매자에게서 구매한 내역이 없습니다'
        : '구매 내역이 없습니다';
      container.innerHTML = `
        <div class="orders-empty">
          <span class="orders-empty__icon">🛍️</span>
          <span class="orders-empty__title">${msg}</span>
          ${!sellerIdFilter ? '<span class="orders-empty__desc">라이브 경매에 참여하여 낙찰받으면<br>여기에 기록됩니다.</span>' : ''}
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
          sellerAvatar: order.sellerAvatar || null,
          liveId: order.liveId ?? null,
          liveCreatedAt: order.liveCreatedAt || null,
          firstOrderAt: order.orderAt || null,
          items: [],
        });
      }
      const g = groupMap.get(key);
      g.items.push(order);
      // 가장 최신 orderAt 추적
      if (order.orderAt && (!g.firstOrderAt || new Date(order.orderAt) > new Date(g.firstOrderAt))) {
        g.firstOrderAt = order.orderAt;
      }
      // 그룹 단위 메타가 채워지지 않은 경우 보완
      if (!g.sellerAvatar && order.sellerAvatar) g.sellerAvatar = order.sellerAvatar;
    });

    // 최신 firstOrderAt 내림차순 정렬
    const groups = Array.from(groupMap.values()).sort((a, b) => {
      const ta = a.firstOrderAt ? new Date(a.firstOrderAt).getTime() : 0;
      const tb = b.firstOrderAt ? new Date(b.firstOrderAt).getTime() : 0;
      return tb - ta;
    });

    const groupsWrap = document.createElement('div');
    groupsWrap.className = 'orders-groups';

    groups.forEach((group) => {
      const groupEl = document.createElement('section');
      groupEl.className = 'orders-group';

      // 1) 날짜 헤더 (YYYY.MM.DD)
      const dateSource = group.liveCreatedAt || group.firstOrderAt;
      const dateLabel = dateSource ? formatYmd(dateSource) : '';
      if (dateLabel) {
        const dateHeader = document.createElement('div');
        dateHeader.className = 'orders-group__date';
        dateHeader.textContent = dateLabel;
        groupEl.appendChild(dateHeader);
      }

      // 2) 판매자 행 (아바타 + 이름)
      const sellerRow = document.createElement('div');
      sellerRow.className = 'orders-group__seller-row';
      sellerRow.innerHTML = `
        ${renderAvatar(group.sellerAvatar, group.sellerName)}
        <span class="orders-group__seller-name">${escapeHtml(group.sellerName)}</span>
      `;
      if (group.sellerId != null) {
        sellerRow.style.cursor = 'pointer';
        sellerRow.addEventListener('click', () => navigate('/app/user/' + group.sellerId));
      }
      groupEl.appendChild(sellerRow);

      // 3) 아이템 목록
      const ul = document.createElement('ul');
      ul.className = 'orders-list';
      group.items.forEach((order) => {
        const li = document.createElement('li');
        li.className = 'orders-item';
        const imgSrc = order.imageUrl || null;
        const dsKey = order.deliveryStatus || 'payment_complete';
        const dsLabel = DELIVERY_LABELS[dsKey] || dsKey;
        const shippingPaid = order.shippingFeeStatus === 'paid' && order.shippingFee > 0;
        li.innerHTML = `
          <div class="orders-item__thumb">
            ${imgSrc
              ? `<img src="${escapeAttr(imgSrc)}" alt="${escapeHtml(order.productName)}" loading="lazy">`
              : `<span class="orders-item__thumb-fallback">🌿</span>`}
          </div>
          <div class="orders-item__body">
            <div class="orders-item__name">${escapeHtml(order.productName || '상품')}</div>
            <div class="orders-item__price">${formatPrice(order.finalPrice)}</div>
            ${shippingPaid ? `<div class="orders-item__shipping">+ 배송비 ${Number(order.shippingFee).toLocaleString('ko-KR')}원</div>` : ''}
            <div class="orders-item__meta">
              <span class="orders-item__delivery-status orders-item__delivery-status--${dsKey}">${dsLabel}</span>
            </div>
          </div>
        `;
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => navigate('/app/order-detail/' + order.auctionId));
        ul.appendChild(li);
      });
      groupEl.appendChild(ul);

      // 4) 결제 요약 카드
      const itemsTotal = group.items.reduce((sum, o) => sum + (Number(o.finalPrice) || 0), 0);
      const shippingTotal = group.items.reduce((sum, o) => {
        if (o.shippingFeeStatus === 'paid') return sum + (Number(o.shippingFee) || 0);
        return sum;
      }, 0);
      const grandTotal = itemsTotal + shippingTotal;

      const summary = document.createElement('div');
      summary.className = 'orders-group__summary';
      summary.innerHTML = `
        <div class="orders-summary__row">
          <span class="orders-summary__label">총 상품 가격</span>
          <span class="orders-summary__value">${formatPrice(itemsTotal)}</span>
        </div>
        ${shippingTotal > 0 ? `
          <div class="orders-summary__row">
            <span class="orders-summary__label">총 배송비</span>
            <span class="orders-summary__value">${formatPrice(shippingTotal)}</span>
          </div>
        ` : ''}
        <div class="orders-summary__divider"></div>
        <div class="orders-summary__row orders-summary__row--total">
          <span class="orders-summary__label">총 결제 금액</span>
          <span class="orders-summary__value">${formatPrice(grandTotal)}</span>
        </div>
      `;
      groupEl.appendChild(summary);

      // 5) "판매자 구매 내역 모아보기" 버튼 (단, 이미 필터 모드면 숨김)
      if (!sellerIdFilter && group.sellerId != null) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'orders-group__seller-cta';
        btn.textContent = '이 판매자로부터 구매한 내역 모아보기';
        btn.addEventListener('click', () => {
          navigate('/app/profile/orders?sellerId=' + encodeURIComponent(group.sellerId));
        });
        groupEl.appendChild(btn);
      }

      groupsWrap.appendChild(groupEl);
    });

    container.innerHTML = '';
    container.appendChild(groupsWrap);
  }

  loadOrders();
  return page;
}

function renderAvatar(src, name) {
  if (src) {
    return `<span class="orders-group__avatar"><img src="${escapeAttr(src)}" alt="${escapeHtml(name)}" loading="lazy"></span>`;
  }
  const initial = (name && name.trim().length > 0) ? name.trim().charAt(0) : '?';
  return `<span class="orders-group__avatar orders-group__avatar--initial">${escapeHtml(initial)}</span>`;
}

