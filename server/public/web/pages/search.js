/**
 * Search Page — 통합 검색 (상품 + 판매자)
 * GET /api/search?q=&category=&minPrice=&maxPrice=
 *
 * 카드 마크업은 home.js buildProductCard와 동일한 .home-product-card 클래스 사용.
 * (wishlist.js 동일 패턴 — home.css inject + CAT_GRADIENTS 복제)
 *
 * @module pages/search
 */

import { search } from '/app/scripts/api.js';
import { navigate } from '/app/scripts/router.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';

/* ── CSS injection ─────────────────────────────────────────── */
const _homeCssId = 'page-css-home';
if (!document.getElementById(_homeCssId)) {
  const link = document.createElement('link');
  link.id = _homeCssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/home.css';
  document.head.appendChild(link);
}

const _cssId = 'page-css-search';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/search.css';
  document.head.appendChild(link);
}

/* ── Category gradient / glyph maps (mirrors home.js) ─────── */
const CAT_GRADIENTS = {
  '과일': ['#FFC4A8', '#FF8A65'],
  '축산': ['#FFB0BA', '#D17085'],
  '채소': ['#C3E8A8', '#7BB85A'],
  '수산': ['#A8D4E8', '#5B9BC4'],
  '곡물': ['#F0DBA0', '#C49C4F'],
  '기타': ['#D0D4C0', '#9EA88A'],
};
const CAT_GLYPHS = { '과일': 'apple', '채소': 'leaf', '축산': 'meat', '수산': 'fish', '곡물': 'grain' };

function getCatGlyphSVG(kind, color, size = 32) {
  const svgs = {
    cart:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M5 8h4l3 13h13l3-9H10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13" cy="26" r="2" fill="currentColor"/><circle cx="23" cy="26" r="2" fill="currentColor"/></svg>`,
    apple: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M16 9c0-2 1.5-3.5 3.5-3.5M16 9c-3-2-7-1-8.5 1.5-2 3-1 8 2 11 1.5 1.5 3 2 4.5 2 1 0 1.5-.5 2-.5s1 .5 2 .5c1.5 0 3-.5 4.5-2 3-3 4-8 2-11C21 7 19 6 16 9z" fill="currentColor"/></svg>`,
    leaf:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M6 22c0-9 7-16 20-16-1 13-9 20-16 20-1.5 0-3-.5-4-1.5z" fill="currentColor"/></svg>`,
    meat:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M9 8c4-3 11-3 14 0 3 3 3 9 0 12-2 2-5 2.5-7 4-2 1.5-5 1-6.5-1-1.5-2-1-4 .5-5C8 16 6 11 9 8z" fill="currentColor"/></svg>`,
    fish:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M4 16c4-6 10-8 16-6 3 1 5 3 6 4l4-4v12l-4-4c-1 1-3 3-6 4-6 2-12 0-16-6z" fill="currentColor"/></svg>`,
    grain: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M16 4v24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 8c-3-1-6 0-7 3 3 1 6 0 7-3zM16 8c3-1 6 0 7 3-3 1-6 0-7-3zM16 14c-3-1-6 0-7 3 3 1 6 0 7-3zM16 14c3-1 6 0 7 3-3 1-6 0-7-3zM16 20c-3-1-6 0-7 3 3 1 6 0 7-3zM16 20c3-1 6 0 7 3-3 1-6 0-7-3z" fill="currentColor"/></svg>`,
  };
  const svg = svgs[kind] ?? svgs.cart;
  const styleAttr = color ? ` style="color:${color}"` : '';
  return `<span class="cat-glyph-wrap"${styleAttr}>${svg}</span>`;
}

function buildProductCard(product) {
  const card = document.createElement('article');
  card.className = 'home-product-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  const [bg1, bg2] = CAT_GRADIENTS[product.category] ?? CAT_GRADIENTS['기타'];
  const glyph = CAT_GLYPHS[product.category] ?? 'cart';
  card.innerHTML = `
    <div class="home-product-card__thumb" style="background:linear-gradient(135deg,${bg1},${bg2})">
      <div class="home-product-card__glyph">${getCatGlyphSVG(glyph, 'var(--color-white-tint-30)', 100)}</div>
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

const CATEGORIES = ['전체', '과일', '채소', '수산', '축산', '곡물', '기타'];

/** @returns {Promise<HTMLElement>} */
export default async function load() {
  const page = document.createElement('section');
  page.className = 'search-page';
  page.dataset.theme = 'light';

  /* ── Header ── */
  const header = document.createElement('header');
  header.className = 'search-header';
  header.innerHTML = `
    <button class="search-header__back" id="search-back" aria-label="뒤로">‹</button>
    <div class="search-header__input-wrap">
      <span class="search-header__icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
          <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </span>
      <input class="search-header__input" id="search-input" type="search"
             placeholder="상품, 판매자 검색" autocomplete="off" autocorrect="off" />
    </div>
  `;
  page.appendChild(header);

  header.querySelector('#search-back').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/app/');
  });

  /* ── Filters ── */
  const filters = document.createElement('div');
  filters.className = 'search-filters';

  const catRow = document.createElement('div');
  catRow.className = 'search-filters__cats';
  CATEGORIES.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'search-cat-chip' + (cat === '전체' ? ' is-active' : '');
    btn.dataset.cat = cat;
    btn.textContent = cat;
    catRow.appendChild(btn);
  });
  filters.appendChild(catRow);

  const priceRow = document.createElement('div');
  priceRow.className = 'search-filters__price';
  priceRow.innerHTML = `
    <span class="search-filters__price-label">가격</span>
    <input class="search-price-input" id="search-min-price" type="number" min="0" placeholder="최소" />
    <span class="search-filters__price-sep">~</span>
    <input class="search-price-input" id="search-max-price" type="number" min="0" placeholder="최대" />
  `;
  filters.appendChild(priceRow);
  page.appendChild(filters);

  const searchInput = header.querySelector('#search-input');
  const minPriceInput = priceRow.querySelector('#search-min-price');
  const maxPriceInput = priceRow.querySelector('#search-max-price');

  /* ── Scroll area ── */
  const scroll = document.createElement('div');
  scroll.className = 'search-scroll';
  page.appendChild(scroll);

  /* ── State ── */
  let activeCategory = '전체';
  let debounceTimer = null;
  let hasSearched = false;

  /* ── Render results ── */
  function renderEmpty(preSearch) {
    scroll.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'search-empty';
    if (preSearch) {
      el.innerHTML = `
        <span class="search-empty__icon">&#128270;</span>
        <p class="search-empty__text">상품이나 판매자를<br>검색해보세요</p>
      `;
    } else {
      el.innerHTML = `
        <span class="search-empty__icon">&#128556;</span>
        <p class="search-empty__text">검색 결과가 없어요</p>
      `;
    }
    scroll.appendChild(el);
  }

  function renderResults(products, sellers) {
    scroll.innerHTML = '';

    let hasAny = false;

    if (sellers && sellers.length > 0) {
      hasAny = true;
      const title = document.createElement('h2');
      title.className = 'search-section-title';
      title.textContent = '판매자';
      scroll.appendChild(title);

      const list = document.createElement('div');
      list.className = 'search-sellers';

      sellers.forEach((seller) => {
        const item = document.createElement('div');
        item.className = 'search-seller-item';
        const avatarInner = seller.avatarUrl
          ? `<img src="${escapeAttr(seller.avatarUrl)}" alt="" loading="lazy" />`
          : `<span class="search-seller-item__avatar-placeholder">&#128100;</span>`;
        item.innerHTML = `
          <div class="search-seller-item__avatar">${avatarInner}</div>
          <div class="search-seller-item__info">
            <p class="search-seller-item__name">${escapeHtml(seller.nickname || '')}</p>
            <p class="search-seller-item__meta">판매 ${Number(seller.salesCount || 0).toLocaleString()}건</p>
          </div>
          <span class="search-seller-item__arrow">›</span>
        `;
        item.addEventListener('click', () => navigate(`/app/user/${encodeURIComponent(seller.id)}`));
        list.appendChild(item);
      });
      scroll.appendChild(list);
    }

    if (products && products.length > 0) {
      hasAny = true;
      const title = document.createElement('h2');
      title.className = 'search-section-title';
      title.textContent = '상품';
      scroll.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'search-product-grid';
      products.forEach((product) => grid.appendChild(buildProductCard(product)));
      scroll.appendChild(grid);
    }

    if (!hasAny) {
      renderEmpty(false);
    }
  }

  async function doSearch() {
    const q = searchInput.value.trim();
    const minPrice = minPriceInput.value.trim();
    const maxPrice = maxPriceInput.value.trim();
    const category = activeCategory === '전체' ? '' : activeCategory;

    if (!q && !category && !minPrice && !maxPrice) {
      hasSearched = false;
      renderEmpty(true);
      return;
    }

    hasSearched = true;
    try {
      const result = await search({ q, category, minPrice, maxPrice });
      const products = Array.isArray(result.products) ? result.products : [];
      const sellers = Array.isArray(result.sellers) ? result.sellers : [];
      renderResults(products, sellers);
    } catch {
      renderEmpty(false);
    }
  }

  function scheduleSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSearch, 300);
  }

  /* ── Event wiring ── */
  searchInput.addEventListener('input', scheduleSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      doSearch();
    }
  });

  minPriceInput.addEventListener('input', scheduleSearch);
  maxPriceInput.addEventListener('input', scheduleSearch);

  catRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.search-cat-chip');
    if (!btn) return;
    const cat = btn.dataset.cat;
    if (cat === activeCategory) return;
    activeCategory = cat;
    catRow.querySelectorAll('.search-cat-chip').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.cat === cat);
    });
    scheduleSearch();
  });

  /* ── Initial state ── */
  renderEmpty(true);

  // Autofocus after mount (slight delay to allow DOM attachment)
  requestAnimationFrame(() => {
    searchInput.focus();
  });

  return page;
}
