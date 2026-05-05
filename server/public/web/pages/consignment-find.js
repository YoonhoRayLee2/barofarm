/**
 * Consignment Find Page — 판매 대행 상품 찾기
 * Route: /app/consignment/find
 */
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';

const _cssId = 'page-css-consignment-find';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId; link.rel = 'stylesheet';
  link.href = '/app/pages/consignment-find.css';
  document.head.appendChild(link);
}

const CATEGORIES = ['전체', '과일', '채소', '수산', '축산', '곡물', '기타'];

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  try { JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'cf-page';
  page.innerHTML = `
    <header class="cf-header">
      <button class="cf-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="cf-header__title">판매 대행 상품 찾기</h1>
    </header>
    <div class="cf-tabs" id="cf-tabs">
      ${CATEGORIES.map((c, i) => `
        <button class="cf-tab${i === 0 ? ' cf-tab--active' : ''}" data-cat="${c === '전체' ? '' : c}">${c}</button>
      `).join('')}
    </div>
    <div class="cf-content" id="cf-content">
      <div class="cf-loading"><div class="cf-loading__dot"></div><span>불러오는 중...</span></div>
    </div>
  `;

  page.querySelector('.cf-header__back').addEventListener('click', () => window.history.back());

  const tabsEl = page.querySelector('#cf-tabs');
  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.cf-tab');
    if (!btn) return;
    tabsEl.querySelectorAll('.cf-tab').forEach(t => t.classList.remove('cf-tab--active'));
    btn.classList.add('cf-tab--active');
    loadList(btn.dataset.cat || '');
  });

  async function loadList(category) {
    const el = page.querySelector('#cf-content');
    el.innerHTML = `<div class="cf-loading"><div class="cf-loading__dot"></div><span>불러오는 중...</span></div>`;
    try {
      const url = '/api/consignments' + (category ? `?category=${encodeURIComponent(category)}` : '');
      const res = await fetch(url);
      if (!res.ok) throw new Error('failed');
      const list = await res.json();
      render(el, list);
    } catch {
      el.innerHTML = `<div class="cf-empty"><span class="cf-empty__text">데이터를 불러올 수 없습니다</span><button class="cf-retry-btn" id="cf-retry">다시 시도</button></div>`;
      el.querySelector('#cf-retry').addEventListener('click', () => loadList(category));
    }
  }

  function render(container, list) {
    if (!list || list.length === 0) {
      container.innerHTML = `<div class="cf-empty"><span class="cf-empty__text">등록된 위탁 상품이 없습니다</span></div>`;
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'cf-list';
    list.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'cf-card';
      const thumb = item.primaryImage
        ? `<img src="${escapeAttr(item.primaryImage)}" alt="" loading="lazy">`
        : `<span class="cf-card__fallback">🌿</span>`;
      const desc = (item.description || '').slice(0, 30);
      const negotiable = item.commissionNegotiable ? ' · 협상가능' : '';
      li.innerHTML = `
        <div class="cf-card__thumb">${thumb}</div>
        <div class="cf-card__body">
          <span class="cf-card__category">${escapeHtml(item.category || '')}</span>
          <div class="cf-card__desc">${escapeHtml(desc)}</div>
          <div class="cf-card__price">${formatPrice(item.expectedPrice)}</div>
          <div class="cf-card__commission">수수료 ${item.commissionRate}%${negotiable}</div>
        </div>
      `;
      li.addEventListener('click', () => navigate('/app/consignment/' + item.id));
      ul.appendChild(li);
    });
    container.innerHTML = '';
    container.appendChild(ul);
  }

  loadList('');
  return page;
}

function formatPrice(p) { return p == null ? '—' : Number(p).toLocaleString('ko-KR') + '원'; }
function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escapeAttr(s) { return escapeHtml(s); }
