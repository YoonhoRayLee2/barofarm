/**
 * Seller Unshipped Page — 미발송 구매자 모아보기
 * Route: /app/seller/unshipped
 */
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';

const _cssId = 'page-css-seller-unshipped';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId; link.rel = 'stylesheet';
  link.href = '/app/pages/seller-unshipped.css';
  document.head.appendChild(link);
}

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

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
      <p class="unshipped-notice__text">구매자를 클릭하면 구매자의 전체 구매 내역을 모아볼 수 있습니다. 결제 완료 후 14일 이내 발송을 완료하지 않으면, 딜러 권한 및 서비스 사용이 제한됩니다.</p>
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
    const ul = document.createElement('ul');
    ul.className = 'unshipped-list';
    list.forEach((item) => {
      const daysPassed = item.paidAt
        ? Math.floor((Date.now() - new Date(item.paidAt).getTime()) / 86400000)
        : 0;
      const isUrgent = daysPassed >= 10;
      const li = document.createElement('li');
      li.className = 'unshipped-item' + (isUrgent ? ' unshipped-item--urgent' : '');
      const avatarHtml = item.buyerAvatar
        ? `<img class="unshipped-item__avatar-img" src="${escapeAttr(item.buyerAvatar)}" alt="">`
        : `<div class="unshipped-item__avatar-initial">${escapeHtml((item.buyerName || '?').charAt(0).toUpperCase())}</div>`;
      li.innerHTML = `
        <div class="unshipped-item__avatar">${avatarHtml}</div>
        <div class="unshipped-item__body">
          <div class="unshipped-item__buyer">${escapeHtml(item.buyerName)}</div>
          <div class="unshipped-item__product">${escapeHtml(item.productName || '상품')}</div>
          <div class="unshipped-item__meta">
            <span class="unshipped-item__date">${formatDate(item.paidAt)}</span>
            <span class="unshipped-item__days${isUrgent ? ' is-urgent' : ''}">결제 후 ${daysPassed}일 경과</span>
          </div>
        </div>
        <div class="unshipped-item__price">${formatPrice(item.finalPrice)}</div>
      `;
      li.addEventListener('click', () => navigate('/app/order-detail/' + item.auctionId));
      ul.appendChild(li);
    });
    container.innerHTML = '';
    container.appendChild(ul);
  }

  loadList();
  return page;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
function formatPrice(p) { return p == null ? '—' : Number(p).toLocaleString('ko-KR') + '원'; }
function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escapeAttr(s) { return escapeHtml(s); }
