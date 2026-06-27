/**
 * Wishlist Page — 찜한 상품 목록
 * GET /api/wishlist?userId= 로 상품 배열 조회 후 그리드 표시.
 * 카드 마크업은 home.js buildProductCard와 동일한 .home-product-card 클래스를 사용.
 *
 * @module pages/wishlist
 */

import { getWishlist } from '/app/scripts/api.js';
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';

/* ── CSS injection ─────────────────────────────────────────── */
// home.css provides .home-product-card styles (cards are identical to home)
const _homeCssId = 'page-css-home';
if (!document.getElementById(_homeCssId)) {
  const link = document.createElement('link');
  link.id = _homeCssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/home.css';
  document.head.appendChild(link);
}

const _cssId = 'page-css-wishlist';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/wishlist.css';
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

/**
 * Build a product card identical to home.js buildProductCard.
 * Uses the same .home-product-card classes so home.css styles apply.
 * @param {Object} product
 * @returns {HTMLElement}
 */
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

/**
 * @returns {Promise<HTMLElement>}
 */
export default async function load() {
  // ---- Auth guard ----
  const stored = await getSecureItem('user');
  if (!stored) {
    await replace('/app/login');
    return document.createElement('div');
  }
  let currentUser;
  try {
    currentUser = JSON.parse(stored);
  } catch {
    await replace('/app/login');
    return document.createElement('div');
  }

  // ---- Build page DOM ----
  const page = document.createElement('section');
  page.className = 'wishlist-page';
  page.dataset.theme = 'light';

  // ---- Header ----
  const header = document.createElement('header');
  header.className = 'wishlist-header';
  header.innerHTML = `
    <button class="wishlist-header__back" id="wl-back" aria-label="뒤로">‹</button>
    <h1 class="wishlist-header__title">위시리스트</h1>
  `;
  page.appendChild(header);

  header.querySelector('#wl-back').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/app/profile');
  });

  // ---- Scroll area ----
  const scroll = document.createElement('div');
  scroll.className = 'wishlist-scroll';
  page.appendChild(scroll);

  // ---- Grid placeholder ----
  const grid = document.createElement('div');
  grid.className = 'wishlist-grid';
  scroll.appendChild(grid);

  // ---- Load wishlist ----
  try {
    const products = await getWishlist(currentUser.id);
    const list = Array.isArray(products) ? products : [];

    if (list.length === 0) {
      grid.remove();
      const empty = document.createElement('div');
      empty.className = 'wishlist-empty';
      empty.innerHTML = `
        <span class="wishlist-empty__icon">♡</span>
        <p class="wishlist-empty__text">찜한 상품이 없어요</p>
      `;
      scroll.appendChild(empty);
    } else {
      list.forEach((product) => {
        grid.appendChild(buildProductCard(product));
      });
    }
  } catch {
    grid.remove();
    const empty = document.createElement('div');
    empty.className = 'wishlist-empty';
    empty.innerHTML = `
      <span class="wishlist-empty__icon">♡</span>
      <p class="wishlist-empty__text">찜한 상품이 없어요</p>
    `;
    scroll.appendChild(empty);
  }

  return page;
}
