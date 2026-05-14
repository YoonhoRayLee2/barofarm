/**
 * Home Page — Single scroll feed
 * Live broadcasts, regular products, and upcoming lives in one scroll view.
 *
 * @module pages/home
 */

import { getLives, getProducts, getUser } from '/app/scripts/api.js';
import { getSecureItem, setSecureItem } from '/app/scripts/native-bridge.js';
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
  { id: '전체', label: '전체', glyph: 'cart',  hue: '#7BC470' },
  { id: '과일', label: '과일', glyph: 'apple', hue: '#E5564A' },
  { id: '채소', label: '채소', glyph: 'leaf',  hue: '#4FA84F' },
  { id: '축산', label: '축산', glyph: 'meat',  hue: '#C84B5C' },
  { id: '수산', label: '수산', glyph: 'fish',  hue: '#4A8FBF' },
  { id: '곡물', label: '곡물', glyph: 'grain', hue: '#D6A84A' },
];

function getCatGlyphSVG(kind, color, size = 32) {
  const g = {
    cart:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M5 8h4l3 13h13l3-9H10" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13" cy="26" r="2" fill="${color}"/><circle cx="23" cy="26" r="2" fill="${color}"/></svg>`,
    apple: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M16 9c0-2 1.5-3.5 3.5-3.5M16 9c-3-2-7-1-8.5 1.5-2 3-1 8 2 11 1.5 1.5 3 2 4.5 2 1 0 1.5-.5 2-.5s1 .5 2 .5c1.5 0 3-.5 4.5-2 3-3 4-8 2-11C21 7 19 6 16 9z" fill="${color}"/></svg>`,
    leaf:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M6 22c0-9 7-16 20-16-1 13-9 20-16 20-1.5 0-3-.5-4-1.5z" fill="${color}"/></svg>`,
    meat:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M9 8c4-3 11-3 14 0 3 3 3 9 0 12-2 2-5 2.5-7 4-2 1.5-5 1-6.5-1-1.5-2-1-4 .5-5C8 16 6 11 9 8z" fill="${color}"/></svg>`,
    fish:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M4 16c4-6 10-8 16-6 3 1 5 3 6 4l4-4v12l-4-4c-1 1-3 3-6 4-6 2-12 0-16-6z" fill="${color}"/></svg>`,
    grain: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M16 4v24" stroke="${color}" stroke-width="2" stroke-linecap="round"/><path d="M16 8c-3-1-6 0-7 3 3 1 6 0 7-3zM16 8c3-1 6 0 7 3-3 1-6 0-7-3zM16 14c-3-1-6 0-7 3 3 1 6 0 7-3zM16 14c3-1 6 0 7 3-3 1-6 0-7-3zM16 20c-3-1-6 0-7 3 3 1 6 0 7-3zM16 20c3-1 6 0 7 3-3 1-6 0-7-3z" fill="${color}"/></svg>`,
  };
  return g[kind] ?? g.cart;
}

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
  page.dataset.theme = 'light';

  // ---- Header ----
  const header = document.createElement('header');
  header.className = 'home-header';
  header.innerHTML = `
    <div class="home-header__brand">
      <img src="/app/assets/home-logo.png" alt="NH바로팜" class="home-header__logo" />
    </div>
    <div class="home-header__actions">
      <button class="home-header__icon-btn" aria-label="알림">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M6 16V11a6 6 0 1112 0v5l1.5 2H4.5L6 16z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 20a2 2 0 004 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="home-header__icon-btn" aria-label="설정" onclick="window.location.href='/app/settings'">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;
  page.appendChild(header);

  // ---- Category bubbles ----
  let activeCategory = '전체';
  const catRow = document.createElement('div');
  catRow.className = 'home-categories';

  const userInterests = currentUser?.interests
    ? String(currentUser.interests).split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const orderedCategories = userInterests.length
    ? [
        ...CATEGORIES.filter(c => c.id === '전체'),
        ...CATEGORIES.filter(c => userInterests.includes(c.id)),
        ...CATEGORIES.filter(c => c.id !== '전체' && !userInterests.includes(c.id)),
      ]
    : CATEGORIES;

  orderedCategories.forEach((cat) => {
    const btn = document.createElement('button');
    const isActive = cat.id === activeCategory;
    btn.className = 'cat-circle-btn' + (isActive ? ' is-active' : '');
    btn.dataset.cat = cat.id;
    btn.setAttribute('aria-label', cat.label);
    btn.innerHTML = `
      <div class="cat-circle" style="--cat-hue: ${cat.hue}">
        <div class="cat-circle__inner">${getCatGlyphSVG(cat.glyph, isActive ? '#fff' : cat.hue, 32)}</div>
        <span class="cat-circle__live-badge">LIVE</span>
      </div>
      <span class="cat-circle__label">${cat.label}</span>
    `;
    btn.addEventListener('click', () => {
      if (activeCategory === cat.id) return;
      activeCategory = cat.id;
      catRow.querySelectorAll('.cat-circle-btn').forEach((b) => {
        const isAct = b.dataset.cat === cat.id;
        b.classList.toggle('is-active', isAct);
        const c = CATEGORIES.find((c) => c.id === b.dataset.cat);
        if (c) b.querySelector('.cat-circle__inner').innerHTML = getCatGlyphSVG(c.glyph, isAct ? '#fff' : c.hue, 32);
      });
      renderFeed();
    });
    catRow.appendChild(btn);
  });
  page.appendChild(catRow);
  const catCircles = catRow.querySelectorAll('.cat-circle-btn');

  // ---- Market price ticker ----
  const tickerWrap = document.createElement('div');
  tickerWrap.className = 'home-ticker';
  tickerWrap.innerHTML = `
    <div class="home-ticker__source" id="home-ticker-source">
      <span class="home-ticker__source-label" id="home-ticker-date">–</span>
      <span class="home-ticker__source-meta">농산물 시세</span>
    </div>
    <div class="home-ticker__scroll-area">
      <div class="home-ticker__track" id="home-ticker-track">
        <span class="home-ticker__loading">잠시만요...</span>
      </div>
    </div>`;
  page.appendChild(tickerWrap);

  // 비동기로 시세 로드
  (async () => {
    try {
      const res = await fetch('/api/market-prices');
      if (!res.ok) throw new Error('failed');
      const items = await res.json();
      const track = page.querySelector('#home-ticker-track');
      if (!track || !items.length) return;

      // 날짜 업데이트
      const dateEl = page.querySelector('#home-ticker-date');
      if (dateEl && items[0]?.priceDate) {
        const d = new Date(items[0].priceDate);
        dateEl.textContent = `${d.getMonth() + 1}월 ${d.getDate()}일`;
      }

      // 아이템을 두 번 복제 → 무한 루프 효과
      const html = items.map(it => `
        <button class="home-ticker__item" data-code="${escapeAttr(it.itemCode)}" data-kind="${escapeAttr(it.kindName)}"
                aria-label="${escapeHtml(it.itemName)} 시세 상세보기">
          <span class="home-ticker__cat home-ticker__cat--${escapeAttr(it.category)}">${escapeHtml(it.category)}</span>
          <span class="home-ticker__name">${escapeHtml(it.itemName)}</span>
          <span class="home-ticker__price">${Number(it.price).toLocaleString('ko-KR')}원</span>
          <span class="home-ticker__unit">/${escapeHtml(it.unit)}</span>
        </button>
      `).join('');
      track.innerHTML = html + html;  // duplicate for seamless loop

      // 클릭 → 상세 페이지 이동
      track.querySelectorAll('.home-ticker__item').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.dataset.code;
          const kind = encodeURIComponent(btn.dataset.kind || '');
          navigate(`/app/market-prices/${code}?kindName=${kind}`);
        });
      });
    } catch {
      const track = page.querySelector('#home-ticker-track');
      if (track) track.innerHTML = '';
    }
  })();

  // ---- Scrollable feed (3 sections: live, products, upcoming) ----
  const feed = document.createElement('div');
  feed.className = 'home-feed';
  feed.innerHTML = `
    <section class="home-section" id="section-live">
      <div class="home-section__header">
        <span class="home-section__badge home-section__badge--live">● LIVE</span>
        <h2 class="home-section__title">라이브 경매</h2>
        <span class="home-section__count" id="live-count"></span>
      </div>
      <div class="home-section__grid" id="live-grid"></div>
    </section>

    <section class="home-section" id="section-products">
      <div class="home-section__header">
        <h2 class="home-section__title">일반 상품</h2>
      </div>
      <div class="home-section__grid" id="products-grid"></div>
    </section>

    <section class="home-section" id="section-upcoming">
      <div class="home-section__header">
        <span class="home-section__badge home-section__badge--upcoming">📅</span>
        <h2 class="home-section__title">라이브 예고</h2>
        <span class="home-section__count" id="upcoming-count"></span>
      </div>
      <div class="home-section__grid" id="upcoming-grid"></div>
    </section>
  `;
  page.appendChild(feed);

  const liveGrid = feed.querySelector('#live-grid');
  const productsGrid = feed.querySelector('#products-grid');
  const upcomingGrid = feed.querySelector('#upcoming-grid');
  const sectionLive = feed.querySelector('#section-live');
  const sectionProducts = feed.querySelector('#section-products');
  const sectionUpcoming = feed.querySelector('#section-upcoming');
  const liveCountEl = feed.querySelector('#live-count');
  const upcomingCountEl = feed.querySelector('#upcoming-count');

  // ---- Bottom tab bar ----
  page.appendChild(createTabSpacer());
  page.appendChild(createBottomTabBar({ activeTab: 'home' }));

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

  function applyCategoryFilter(list) {
    if (activeCategory === '전체') return list;
    return list.filter((item) => item.category === activeCategory);
  }

  function renderLiveSkeleton(container, count = 4) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const skeletonLive = {
        id: `skel-${i}`,
        title: ' ',
        sellerId: ' ',
        viewerCount: 0,
        currentAuction: null,
      };
      const card = createLiveCard(skeletonLive);
      card.classList.add('is-skeleton');
      card.removeAttribute('role');
      card.removeAttribute('tabindex');
      container.appendChild(card);
    }
  }

  function renderProductSkeleton(container, count = 4) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const sk = document.createElement('div');
      sk.className = 'skeleton-card';
      sk.innerHTML =
        '<div class="skeleton-thumb"></div>' +
        '<div class="skeleton-info">' +
        '<div class="skeleton-line"></div>' +
        '<div class="skeleton-line skeleton-line--short"></div>' +
        '</div>';
      container.appendChild(sk);
    }
  }

  function renderEmpty(container, title, desc, iconKind = 'live') {
    const empty = document.createElement('div');
    empty.className = 'home-empty';
    const svg = iconKind === 'product'
      ? `<svg class="home-empty__svg" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="25" y="30" width="70" height="60" rx="6" stroke="currentColor" stroke-width="3" fill="none" opacity="0.3"/>
          <path d="M40 50h40M40 62h28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
          <circle cx="60" cy="90" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"/>
        </svg>`
      : `<svg class="home-empty__svg" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="20" y="35" width="80" height="50" rx="8" stroke="currentColor" stroke-width="3" fill="none" opacity="0.3"/>
          <circle cx="60" cy="60" r="14" stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.5"/>
          <circle cx="60" cy="60" r="7" fill="currentColor" opacity="0.4"/>
          <path d="M10 20 Q60 5 110 20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.25"/>
          <path d="M22 28 Q60 16 98 28" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.35"/>
        </svg>`;
    empty.innerHTML = `
      ${svg}
      <span class="home-empty__title">${title}</span>
      <span class="home-empty__desc">${desc}</span>
    `;
    container.appendChild(empty);
  }

  function renderLiveSection() {
    const liveItems = applyCategoryFilter(
      livesList.filter((l) => !l.status || l.status === 'live')
    );
    liveGrid.innerHTML = '';
    liveCountEl.textContent = liveItems.length ? liveItems.length : '';

    if (!liveItems.length) {
      renderEmpty(
        liveGrid,
        '진행 중인 라이브가 없습니다',
        '+ 버튼을 눌러 새 라이브를 시작해 보세요',
        'live'
      );
    } else {
      liveItems.forEach((live) => {
        const card = createLiveCard(live, {
          currentUserId: currentUser ? String(currentUser.id) : null,
          onClick: onCardClick,
        });
        liveGrid.appendChild(card);
      });
    }
    // 카테고리 LIVE 배지 갱신 (전체 live 기준)
    updateCategoryLiveState(livesList);
  }

  function renderUpcomingSection() {
    const upcomingItems = applyCategoryFilter(
      livesList.filter((l) => l.status === 'upcoming' || l.status === 'scheduled')
    );
    upcomingGrid.innerHTML = '';
    upcomingCountEl.textContent = upcomingItems.length ? upcomingItems.length : '';

    if (!upcomingItems.length) {
      // 예고 없을 때는 섹션 자체를 숨김
      sectionUpcoming.style.display = 'none';
      return;
    }
    sectionUpcoming.style.display = '';
    upcomingItems.forEach((live) => {
      const card = createLiveCard(live, {
        currentUserId: currentUser ? String(currentUser.id) : null,
        onClick: onCardClick,
      });
      upcomingGrid.appendChild(card);
    });
  }

  function renderProductsSection() {
    const filtered = applyCategoryFilter(productsList);
    productsGrid.innerHTML = '';

    if (!filtered.length) {
      renderEmpty(
        productsGrid,
        '등록된 상품이 없습니다',
        '+ 버튼으로 상품을 등록해 보세요',
        'product'
      );
      return;
    }
    filtered.forEach((product) => {
      productsGrid.appendChild(buildProductCard(product));
    });
  }

  async function fetchProductsIfNeeded() {
    if (productsLoaded) return;
    try {
      productsList = await getProducts();
      productsLoaded = true;
    } catch (err) {
      console.error('[home] getProducts error', err);
      showToast('상품 목록을 불러오지 못했습니다', { variant: 'error' });
      productsList = [];
      productsLoaded = true;
    }
  }

  function renderFeed() {
    renderLiveSection();
    renderProductsSection();
    renderUpcomingSection();
  }

  const CAT_GRADIENTS = {
    '과일': ['#FFC4A8', '#FF8A65'],
    '축산': ['#FFB0BA', '#D17085'],
    '채소': ['#C3E8A8', '#7BB85A'],
    '수산': ['#A8D4E8', '#5B9BC4'],
    '곡물': ['#F0DBA0', '#C49C4F'],
    '기타': ['#D0D4C0', '#9EA88A'],
  };
  const CAT_GLYPHS = { '과일': 'apple', '채소': 'leaf', '축산': 'meat', '수산': 'fish', '곡물': 'grain' };

  function buildProductCard(product) {
    const card = document.createElement('article');
    card.className = 'home-product-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    const [bg1, bg2] = CAT_GRADIENTS[product.category] ?? CAT_GRADIENTS['기타'];
    const glyph = CAT_GLYPHS[product.category] ?? 'cart';
    card.innerHTML = `
      <div class="home-product-card__thumb" style="background:linear-gradient(135deg,${bg1},${bg2})">
        <div class="home-product-card__glyph">${getCatGlyphSVG(glyph, 'rgba(255,255,255,0.45)', 100)}</div>
        ${product.imageUrl ? `<img src="${escapeAttr(product.imageUrl)}" alt="" class="home-product-card__img" loading="lazy"/>` : ''}
        <span class="home-product-card__cat">${escapeHtml(product.category || '')}</span>
      </div>
      <div class="home-product-card__info">
        <p class="home-product-card__seller">${escapeHtml(product.sellerName || '')}</p>
        <p class="home-product-card__name">${escapeHtml(product.name || '')}</p>
        <p class="home-product-card__price">${Number(product.price).toLocaleString()}<span>원</span></p>
      </div>
    `;
    card.addEventListener('click', () => navigate(`/app/product-detail/${encodeURIComponent(product.id)}`));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
    return card;
  }

  function updateCategoryLiveState(lives) {
    const safeLives = Array.isArray(lives) ? lives : [];
    const liveLives = safeLives.filter((l) => l.status === 'live');
    const hasAnyLive = liveLives.length > 0;
    catCircles.forEach((btn) => {
      const cat = btn.dataset.cat;
      const hasLive = cat === '전체' ? hasAnyLive : liveLives.some((l) => l.category === cat);
      btn.classList.toggle('has-live', hasLive);
      const badge = btn.querySelector('.cat-circle__live-badge');
      if (badge) badge.style.display = hasLive ? 'flex' : 'none';
    });
  }

  // ---- Socket subscription ----
  const socket = Sock.connect();
  socket.on('connect', () => Sock.identifyUser(socket, currentUser.id));
  // 이미 connect 된 후일 경우 즉시 emit
  if (socket.connected) Sock.identifyUser(socket, currentUser.id);

  const unsubNew = Sock.onLobbyLiveNew(socket, (live) => {
    livesList = [live, ...livesList];
    renderFeed();
  });

  const unsubEnded = Sock.onLobbyLiveEnded(socket, ({ liveId }) => {
    livesList = livesList.filter((l) => l.id !== liveId);
    renderFeed();
  });

  const unsubFollowLive = Sock.onFollowLiveStarted(socket, ({ liveId, sellerName, title }) => {
    showFollowLiveBanner(page, { liveId, sellerName, title });
  });

  setCleanup(() => {
    unsubNew();
    unsubEnded();
    unsubFollowLive();
    socket.disconnect();
  });

  // ---- Initial fetch ----
  // 유저 정보 갱신 (백그라운드, 카테고리 순서 반영)
  getUser(currentUser.id).then((fresh) => {
    if (!fresh) return;
    Object.assign(currentUser, fresh);
    setSecureItem('user', JSON.stringify(currentUser)).catch(() => {});

    // interests가 바뀌었으면 카테고리 버튼 순서 재정렬
    const freshInterests = Array.isArray(fresh.interests)
      ? fresh.interests
      : (fresh.interests ? String(fresh.interests).split(',').map(s => s.trim()).filter(Boolean) : []);
    const reordered = freshInterests.length
      ? [
          ...CATEGORIES.filter(c => c.id === '전체'),
          ...CATEGORIES.filter(c => freshInterests.includes(c.id)),
          ...CATEGORIES.filter(c => c.id !== '전체' && !freshInterests.includes(c.id)),
        ]
      : CATEGORIES;

    // 기존 버튼 순서와 다를 때만 DOM 갱신
    const currentOrder = [...catRow.querySelectorAll('.cat-circle-btn')].map(b => b.dataset.cat);
    const newOrder = reordered.map(c => c.id);
    if (currentOrder.join() !== newOrder.join()) {
      catRow.innerHTML = '';
      reordered.forEach((cat) => {
        const isAct = cat.id === activeCategory;
        const btn = document.createElement('button');
        btn.className = 'cat-circle-btn' + (isAct ? ' is-active' : '');
        btn.dataset.cat = cat.id;
        btn.setAttribute('aria-label', cat.label);
        btn.innerHTML = `
          <div class="cat-circle" style="--cat-hue: ${cat.hue}">
            <div class="cat-circle__inner">${getCatGlyphSVG(cat.glyph, isAct ? '#fff' : cat.hue, 32)}</div>
            <span class="cat-circle__live-badge">LIVE</span>
          </div>
          <span class="cat-circle__label">${cat.label}</span>
        `;
        btn.addEventListener('click', () => {
          if (activeCategory === cat.id) return;
          activeCategory = cat.id;
          catRow.querySelectorAll('.cat-circle-btn').forEach((b) => {
            const isAct2 = b.dataset.cat === cat.id;
            b.classList.toggle('is-active', isAct2);
            const c = CATEGORIES.find(c => c.id === b.dataset.cat);
            if (c) b.querySelector('.cat-circle__inner').innerHTML = getCatGlyphSVG(c.glyph, isAct2 ? '#fff' : c.hue, 32);
          });
          renderFeed();
        });
        catRow.appendChild(btn);
      });
    }
  }).catch(() => {});

  // 초기 스켈레톤
  renderLiveSkeleton(liveGrid, 2);
  renderProductSkeleton(productsGrid, 4);
  sectionUpcoming.style.display = 'none';

  // 라이브 + 상품 병렬 로드
  const [livesRes] = await Promise.allSettled([
    (async () => {
      try {
        livesList = await getLives();
      } catch (err) {
        console.error('[home] getLives error', err);
        showToast('라이브 목록을 불러오지 못했습니다', { variant: 'error' });
        livesList = [];
      }
    })(),
    fetchProductsIfNeeded(),
  ]);

  renderFeed();

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

/**
 * 팔로우한 판매자가 라이브 시작 시 페이지 상단에 클릭 가능한 배너를 띄운다.
 * 6초 후 자동 제거 또는 탭하면 라이브 입장.
 */
function showFollowLiveBanner(page, { liveId, sellerName, title }) {
  // 중복 배너 제거
  const existing = page.querySelector('.home-follow-banner');
  if (existing) existing.remove();

  const banner = document.createElement('button');
  banner.type = 'button';
  banner.className = 'home-follow-banner';
  banner.innerHTML = `
    <span class="home-follow-banner__icon">🌾</span>
    <span class="home-follow-banner__text">
      <strong>${escapeHtml(sellerName || '판매자')}</strong>님이 라이브를 시작했습니다
      ${title ? `<span class="home-follow-banner__sub">${escapeHtml(title)}</span>` : ''}
    </span>
    <span class="home-follow-banner__arrow">›</span>
  `;
  let timer;
  banner.addEventListener('click', () => {
    clearTimeout(timer);
    banner.remove();
    if (liveId) {
      import('/app/scripts/router.js').then(({ navigate }) => navigate(`/app/live-buyer/${liveId}`));
    }
  });
  page.appendChild(banner);

  // 자동 제거
  timer = setTimeout(() => banner.remove(), 6000);
}
