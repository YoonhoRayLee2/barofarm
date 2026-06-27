/**
 * Seller Unshipped Page — 미발송 구매자 모아보기 + 합배송 처리
 * Route: /app/seller/unshipped
 */
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { personIconSVG } from '/app/scripts/person-icon.js';
import * as api from '/app/scripts/api.js';
import { showToast } from '/app/components/toast.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';
import { formatPrice, formatDateDay } from '/app/scripts/format.js';

const _cssId = 'page-css-seller-unshipped';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId; link.rel = 'stylesheet';
  link.href = '/app/pages/seller-unshipped.css';
  document.head.appendChild(link);
}

const SHIPPING_FEE_LABEL = {
  paid: '✅ 배송비포함',
};

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  /* 최신 프로필 로드해서 sellerShippingFee 확보 */
  let sellerShippingFee = 3000;
  try {
    const fresh = await api.getUser(user.id);
    if (fresh && fresh.sellerShippingFee != null) {
      sellerShippingFee = Number(fresh.sellerShippingFee) || 3000;
    } else if (user.sellerShippingFee != null) {
      sellerShippingFee = Number(user.sellerShippingFee) || 3000;
    }
  } catch {
    if (user.sellerShippingFee != null) sellerShippingFee = Number(user.sellerShippingFee) || 3000;
  }

  const page = document.createElement('div');
  page.className = 'unshipped-page';
  page.dataset.theme = 'light';
  page.innerHTML = `
    <header class="unshipped-header">
      <button class="unshipped-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="unshipped-header__title">미발송 구매자 모아보기</h1>
    </header>
    <div class="unshipped-notice">
      <span class="unshipped-notice__icon">ⓘ</span>
      <p class="unshipped-notice__text">구매자별로 묶어 합배송 처리할 수 있습니다. 결제 완료 후 14일 이내 발송을 완료하지 않으면, 딜러 권한 및 서비스 사용이 제한됩니다.</p>
    </div>
    <div class="unshipped-content" id="unshipped-content">
      <div class="unshipped-loading"><div class="unshipped-loading__dot"></div><span>불러오는 중...</span></div>
    </div>
  `;

  page.querySelector('.unshipped-header__back').addEventListener('click', () => window.history.back());

  async function loadList() {
    const el = page.querySelector('#unshipped-content');
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/unshipped`);
      if (!res.ok) throw new Error('failed');
      const list = await res.json();
      render(el, list);
    } catch {
      el.innerHTML = `<div class="unshipped-empty"><span>데이터를 불러올 수 없습니다</span><button class="unshipped-retry-btn" id="unshipped-retry">다시 시도</button></div>`;
      el.querySelector('#unshipped-retry').addEventListener('click', loadList);
    }
  }

  function render(container, list) {
    if (!list || list.length === 0) {
      container.innerHTML = `<div class="unshipped-empty"><span class="unshipped-empty__text">모든 주문을 처리했습니다.</span></div>`;
      return;
    }

    /* 구매자별 그룹화 */
    const groups = {};
    list.forEach((order) => {
      const key = String(order.buyerId);
      if (!groups[key]) groups[key] = { buyerId: order.buyerId, buyerName: order.buyerName, buyerAvatar: order.buyerAvatar, orders: [] };
      groups[key].orders.push(order);
    });

    container.innerHTML = '';
    Object.values(groups).forEach((group) => {
      const groupEl = renderGroup(group);
      container.appendChild(groupEl);
    });
  }

  function renderGroup(group) {
    const pendingIds = group.orders
      .filter((o) => o.deliveryStatus === 'payment_complete' && (!o.shippingFeeStatus || o.shippingFeeStatus === 'none'))
      .map((o) => o.auctionId);

    const batchBtn = pendingIds.length > 0
      ? `<button class="batch-ship-btn"
           data-buyer-id="${escapeAttr(group.buyerId)}"
           data-auction-ids="${escapeAttr(pendingIds.join(','))}">합배송 처리</button>`
      : '';

    const feeBadge = pendingIds.length > 0
      ? `<span class="unshipped-group__fee">배송비 ${Number(sellerShippingFee).toLocaleString('ko-KR')}원</span>`
      : '';

    const avatarHtml = group.buyerAvatar
      ? `<img class="unshipped-group__avatar-img" src="${escapeAttr(group.buyerAvatar)}" alt="">`
      : `<div class="unshipped-group__avatar-initial">${personIconSVG(20)}</div>`;

    const wrap = document.createElement('div');
    wrap.className = 'unshipped-group';
    wrap.innerHTML = `
      <div class="unshipped-group__header">
        <div class="unshipped-group__avatar">${avatarHtml}</div>
        <span class="unshipped-group__name">${escapeHtml(group.buyerName || '구매자')}</span>
        <span class="unshipped-group__count">${group.orders.length}건</span>
        ${feeBadge}
        ${batchBtn}
      </div>
      <ul class="unshipped-group__items"></ul>
    `;

    const ul = wrap.querySelector('.unshipped-group__items');
    group.orders.forEach((item) => {
      const daysPassed = item.paidAt
        ? Math.floor((Date.now() - new Date(item.paidAt).getTime()) / 86400000)
        : 0;
      const isUrgent = daysPassed >= 10;

      const statusBadge = item.shippingFeeStatus && SHIPPING_FEE_LABEL[item.shippingFeeStatus]
        ? `<span class="unshipped-status-badge unshipped-status-badge--${item.shippingFeeStatus}">${SHIPPING_FEE_LABEL[item.shippingFeeStatus]}</span>`
        : '';

      const li = document.createElement('li');
      li.className = 'unshipped-item' + (isUrgent ? ' unshipped-item--urgent' : '');
      li.innerHTML = `
        <div class="unshipped-item__body">
          <div class="unshipped-item__product">${escapeHtml(item.productName || '상품')}</div>
          <div class="unshipped-item__meta">
            <span class="unshipped-item__date">${formatDateDay(item.paidAt)}</span>
            <span class="unshipped-item__days${isUrgent ? ' is-urgent' : ''}">결제 후 ${daysPassed}일 경과</span>
            ${statusBadge}
          </div>
        </div>
        <div class="unshipped-item__price">${formatPrice(item.finalPrice)}</div>
      `;
      li.addEventListener('click', () => navigate('/app/order-detail/' + item.auctionId));
      ul.appendChild(li);
    });

    return wrap;
  }

  /* 합배송 처리 이벤트 위임 */
  page.addEventListener('click', async (e) => {
    const btn = e.target.closest('.batch-ship-btn');
    if (!btn) return;
    e.stopPropagation();

    const buyerId = btn.dataset.buyerId;
    const auctionIds = (btn.dataset.auctionIds || '').split(',').filter(Boolean);
    if (!buyerId || auctionIds.length === 0) return;

    btn.disabled = true;
    try {
      const token = await api.getToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/auctions/batch-ship', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sellerId: user.id, buyerId: Number(buyerId), auctionIds }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      showToast(`합배송 처리 완료! 배송비 ${Number(data.shippingFee || 0).toLocaleString('ko-KR')}원 자동 포함`, { variant: 'success', duration: 2400 });
      loadList();
    } catch (err) {
      btn.disabled = false;
      showToast(err.message || '처리 실패', { duration: 2000 });
    }
  });

  loadList();
  page.appendChild(createTabSpacer());
  page.appendChild(createBottomTabBar());
  return page;
}

