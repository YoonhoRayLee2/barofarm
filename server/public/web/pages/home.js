/**
 * Home Page — 3-W14
 * Live broadcast list with category pills, sub-tabs, and socket subscription.
 *
 * @module pages/home
 */

import { getLives, getProducts } from '/app/scripts/api.js';
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace, setCleanup } from '/app/scripts/router.js';
import * as Sock from '/app/scripts/socket.js';
import { createLiveCard } from '/app/components/live-card.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';
import { showToast } from '/app/components/toast.js';

// Inject CSS once
const _cssId = 'page-css-home';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/home.css';
  document.head.appendChild(link);
}

const CATEGORIES = [
  { id: '전체', label: '전체', icon: '🛒' },
  { id: '과일', label: '과일', icon: '🍎' },
  { id: '채소', label: '채소', icon: '🥦' },
  { id: '축산', label: '축산', icon: '🥩' },
  { id: '수산', label: '수산', icon: '🐟' },
  { id: '곡물', label: '곡물', icon: '🌾' },
];
const SUBTABS = ['지금경매', '예고'];

/**
 * @returns {Promise<HTMLElement>}
 */
export default async function load() {
  // Auth guard
  const stored = await getSecureItem('user');
  if (!stored) {
    await replace('/app/login');
    return document.createElement('div');
  }

  let currentUser = null;
  try {
    currentUser = JSON.parse(stored);
  } catch {
    await replace('/app/login');
    return document.createElement('div');
  }

  const page = document.createElement('div');
  page.className = 'home-page';

  // ---- Header ----
  const header = document.createElement('header');
  header.className = 'home-header';
  header.innerHTML = `
    <div class="home-header__logo">
      <img src="/app/assets/home-logo.png" alt="NH바로팜" class="home-header__logo-img" />
    </div>
    <div class="home-header__actions">
      <button class="home-header__icon-btn" aria-label="알림">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      </button>
      <button class="home-header__icon-btn" aria-label="설정" onclick="window.location.href='/app/settings'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  `;
  page.appendChild(header);

  // ---- Category bubbles ----
  let activeCategory = '전체';
  const catRow = document.createElement('div');
  catRow.className = 'home-categories';

  CATEGORIES.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'cat-bubble' + (cat.id === activeCategory ? ' is-active' : '');
    btn.dataset.cat = cat.id;
    btn.setAttribute('aria-label', cat.label);
    btn.innerHTML = `
      <div class="cat-bubble__ring">
        <span class="cat-bubble__icon" aria-hidden="true">${cat.icon}</span>
        <span class="cat-bubble__live-badge" style="display:none">
          <span class="cat-live-dot"></span>LIVE
        </span>
      </div>
      <span class="cat-bubble__label">${cat.label}</span>
    `;
    btn.addEventListener('click', () => {
      if (activeCategory === cat.id) return;
      activeCategory = cat.id;
      catRow.querySelectorAll('.cat-bubble').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.cat === cat.id);
      });
      if (activeSubtab === '일반판매') {
        renderProducts();
      } else {
        renderLivesByTab(activeSubtab);
      }
    });
    catRow.appendChild(btn);
  });
  page.appendChild(catRow);
  const catBubbles = catRow.querySelectorAll('.cat-bubble');

  // ---- Sub-tabs ----
  const _initTabParam = new URLSearchParams(window.location.search).get('tab');
  let activeSubtab =
    _initTabParam === 'products' ? '일반판매'
    : _initTabParam === 'upcoming' ? '예고'
    : '지금경매';
  const subtabRow = document.createElement('div');
  subtabRow.className = 'home-subtabs';
  if (activeSubtab === '일반판매') subtabRow.style.display = 'none';

  SUBTABS.forEach((tab) => {
    const btn = document.createElement('button');
    btn.className = 'subtab' + (tab === activeSubtab ? ' is-active' : '');
    btn.textContent = tab;
    btn.addEventListener('click', () => {
      if (activeSubtab === tab) return;
      activeSubtab = tab;
      subtabRow.querySelectorAll('.subtab').forEach((b) => {
        b.classList.toggle('is-active', b.textContent === tab);
      });
      renderLivesByTab(tab);
    });
    subtabRow.appendChild(btn);
  });
  page.appendChild(subtabRow);

  // ---- Live list container ----
  const listContainer = document.createElement('div');
  listContainer.className = 'home-live-list';
  page.appendChild(listContainer);

  // ---- Bottom tab bar ----
  page.appendChild(createTabSpacer());
  const _activeBottomTab = activeSubtab === '일반판매' ? 'products' : 'home';
  page.appendChild(createBottomTabBar({ activeTab: _activeBottomTab }));

  // ---- State ----
  let livesList = [];
  let productsList = [];
  let productsLoaded = false;

  function onCardClick(live) {
    if (currentUser && live.sellerId === String(currentUser.id)) {
      navigate(`/app/live-seller/${live.id}`);
    } else {
      navigate(`/app/live-buyer/${live.id}`);
    }
  }

  function renderSkeleton() {
    listContainer.innerHTML = '';
    // 6 skeleton live-cards using the shimmer state defined in live-card.css
    for (let i = 0; i < 6; i++) {
      const skeletonLive = {
        id: `skel-${i}`,
        title: '\u00A0',          // non-breaking space to preserve line height
        sellerId: '\u00A0',
        viewerCount: 0,
        currentAuction: null,
      };
      const card = createLiveCard(skeletonLive);
      card.classList.add('is-skeleton');
      card.removeAttribute('role');
      card.removeAttribute('tabindex');
      listContainer.appendChild(card);
    }
  }

  function renderLivesByTab(tab) {
    let filtered;
    if (tab === '예고') {
      filtered = livesList.filter(
        (l) => l.status === 'upcoming' || l.status === 'scheduled'
      );
    } else {
      // '지금경매' — live 중이거나 status 없는 것
      filtered = livesList.filter((l) => !l.status || l.status === 'live');
    }

    listContainer.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'home-empty';
      const emptyMsg =
        tab === '예고'
          ? {
              title: '예고된 라이브가 없습니다',
              desc: '곧 새로운 라이브가 예정될 거예요.',
            }
          : {
              title: '진행 중인 라이브가 없습니다',
              desc: '+ 버튼을 눌러 새 라이브를 시작해 보세요',
            };
      empty.innerHTML = `
        <svg class="home-empty__svg" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- 카메라/라이브 방송 테마 간단 아이콘: 화면 + 방송 전파 -->
          <rect x="20" y="35" width="80" height="50" rx="8" stroke="currentColor" stroke-width="3" fill="none" opacity="0.3"/>
          <circle cx="60" cy="60" r="14" stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.5"/>
          <circle cx="60" cy="60" r="7" fill="currentColor" opacity="0.4"/>
          <path d="M10 20 Q60 5 110 20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.25"/>
          <path d="M22 28 Q60 16 98 28" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.35"/>
        </svg>
        <span class="home-empty__title">${emptyMsg.title}</span>
        <span class="home-empty__desc">${emptyMsg.desc}</span>
      `;
      listContainer.appendChild(empty);
      updateCategoryLiveState([]);
      return;
    }
    filtered.forEach((live) => {
      const card = createLiveCard(live, {
        currentUserId: currentUser ? String(currentUser.id) : null,
        onClick: onCardClick,
      });
      listContainer.appendChild(card);
    });
    updateCategoryLiveState(filtered);
  }

  function renderProductSkeleton() {
    listContainer.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const sk = document.createElement('div');
      sk.className = 'skeleton-card';
      sk.innerHTML =
        '<div class="skeleton-thumb"></div>' +
        '<div class="skeleton-info">' +
        '<div class="skeleton-line"></div>' +
        '<div class="skeleton-line skeleton-line--short"></div>' +
        '</div>';
      listContainer.appendChild(sk);
    }
  }

  async function renderProducts() {
    const cat = activeCategory !== '전체' ? activeCategory : null;

    if (!productsLoaded) {
      renderProductSkeleton();
    }

    try {
      productsList = await getProducts(cat ? { category: cat } : {});
      productsLoaded = true;
    } catch (err) {
      console.error('[home] getProducts error', err);
      showToast('상품 목록을 불러오지 못했습니다', { variant: 'error' });
      productsList = [];
    }

    listContainer.innerHTML = '';

    const filtered = cat
      ? productsList.filter((p) => p.category === cat)
      : productsList;

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'home-empty';
      empty.innerHTML = `
        <svg class="home-empty__svg" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="25" y="30" width="70" height="60" rx="6" stroke="currentColor" stroke-width="3" fill="none" opacity="0.3"/>
          <path d="M40 50h40M40 62h28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
          <circle cx="60" cy="90" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"/>
        </svg>
        <span class="home-empty__title">등록된 상품이 없습니다</span>
        <span class="home-empty__desc">+ 버튼으로 상품을 등록해 보세요</span>
      `;
      listContainer.appendChild(empty);
      return;
    }

    filtered.forEach((product) => {
      listContainer.appendChild(buildProductCard(product));
    });
  }

  function buildProductCard(product) {
    const card = document.createElement('article');
    card.className = 'home-product-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const thumbStyle = product.imageUrl
      ? `background-image:url('${escapeAttr(product.imageUrl)}'); background-size:cover; background-position:center;`
      : '';
    const thumbFallback = product.imageUrl
      ? ''
      : `<span class="home-product-card__fallback">🛒</span>`;

    const priceStr = Number(product.price).toLocaleString('ko-KR');
    const catLabel = product.category || '';

    const sellerLabel = product.sellerName ? escapeHtml(product.sellerName) : '';

    card.innerHTML = `
      <div class="home-product-card__thumb" style="${thumbStyle}">
        ${thumbFallback}
        ${catLabel ? `<span class="home-product-card__cat">${escapeHtml(catLabel)}</span>` : ''}
      </div>
      <div class="home-product-card__info">
        ${sellerLabel ? `<p class="home-product-card__seller">${sellerLabel}</p>` : ''}
        <p class="home-product-card__name">${escapeHtml(product.name || '')}</p>
        <p class="home-product-card__price">${priceStr}<span class="home-product-card__won">원</span></p>
      </div>
    `;

    card.addEventListener('click', () => {
      navigate(`/app/product-detail/${encodeURIComponent(product.id)}`);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });

    return card;
  }

  function updateCategoryLiveState(lives) {
    const safeLives = Array.isArray(lives) ? lives : [];
    // 예고(upcoming) 라이브는 카테고리 불에서 제외 — 실제 방송 중인 것만
    const liveLives = safeLives.filter((l) => l.status === 'live');
    const hasAnyLive = liveLives.length > 0;
    catBubbles.forEach((btn) => {
      const cat = btn.dataset.cat;
      let hasLive = false;
      if (cat === '전체') {
        hasLive = hasAnyLive;
      } else {
        hasLive = liveLives.some((l) => l.category === cat);
      }
      btn.classList.toggle('has-live', hasLive);
      const badge = btn.querySelector('.cat-bubble__live-badge');
      if (badge) badge.style.display = hasLive ? '' : 'none';
    });
  }

  // ---- Socket subscription ----
  const socket = Sock.connect();

  const unsubNew = Sock.onLobbyLiveNew(socket, (live) => {
    livesList = [live, ...livesList];
    if (activeSubtab !== '일반판매') {
      renderLivesByTab(activeSubtab);
    }
  });

  const unsubEnded = Sock.onLobbyLiveEnded(socket, ({ liveId }) => {
    livesList = livesList.filter((l) => l.id !== liveId);
    if (activeSubtab !== '일반판매') {
      renderLivesByTab(activeSubtab);
    }
  });

  setCleanup(() => {
    unsubNew();
    unsubEnded();
    socket.disconnect();
  });

  // ---- Initial fetch ----
  if (activeSubtab === '일반판매') {
    renderProducts();
  } else {
    renderSkeleton();
    try {
      livesList = await getLives();
      renderLivesByTab(activeSubtab);
    } catch (err) {
      console.error('[home] getLives error', err);
      showToast('라이브 목록을 불러오지 못했습니다', { variant: 'error' });
      livesList = [];
      renderLivesByTab(activeSubtab);
    }
  }

  return page;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;');
}
