/**
 * My Products Page — 내 상품 수정 · 관리
 * 판매자가 등록한 상품 목록을 관리한다 (모든 status 표시).
 *
 * 흐름:
 *  - GET /api/products?sellerId={id} 로 본인 상품 목록 조회
 *  - 리스트 아이템: 썸네일 + 이름 + 가격 + 카테고리 + 상태 뱃지 + 수정/삭제 버튼
 *  - 수정 → /app/product-register?id=xxx
 *  - 삭제 → confirm → DELETE /api/products/:id → 목록 리프레시
 *  - 하단 고정 "상품 등록하기" 버튼 → /app/product-register
 *
 * @module pages/my-products
 */

import * as api from '/app/scripts/api.js';
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { showConfirmDialog } from '/app/components/confirm-dialog.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';
import { formatPriceRaw } from '/app/scripts/format.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';

/* ── CSS injection ─────────────────────────────────────────── */
const _cssId = 'page-css-my-products';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/my-products.css';
  document.head.appendChild(link);
}

/* ── Status badge mapping ──────────────────────────────────── */
const STATUS_META = {
  active: { label: '판매중', cls: 'is-active' },
  sold:   { label: '완판',   cls: 'is-sold'   },
  hidden: { label: '숨김',   cls: 'is-hidden' },
};

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
  let user;
  try {
    user = JSON.parse(stored);
  } catch {
    await replace('/app/login');
    return document.createElement('div');
  }

  // ---- Page shell ----
  const page = document.createElement('section');
  page.className = 'my-products';
  page.dataset.theme = 'light';
  page.innerHTML = `
    <header class="mp-header">
      <button class="mp-header__back" id="mp-back" aria-label="뒤로">‹</button>
      <h1 class="mp-header__title">내 상품 관리</h1>
      <span class="mp-header__spacer" aria-hidden="true"></span>
    </header>

    <div class="mp-content" id="mp-content">
      <div class="mp-loading">불러오는 중...</div>
    </div>

    <div class="mp-bottom-bar">
      <button class="mp-register-btn" id="mp-register-btn">+ 상품 등록하기</button>
    </div>
  `;

  const backBtn     = page.querySelector('#mp-back');
  const registerBtn = page.querySelector('#mp-register-btn');
  const content     = page.querySelector('#mp-content');
  page.appendChild(createBottomTabBar());

  backBtn.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/app/profile');
  });
  registerBtn.addEventListener('click', () => navigate('/app/product-register'));

  // ---- Render helpers ----
  function renderEmpty() {
    content.innerHTML = `
      <div class="mp-empty">
        <span class="mp-empty__icon" aria-hidden="true">📦</span>
        <p class="mp-empty__title">등록된 상품이 없습니다</p>
        <p class="mp-empty__desc">아래 버튼을 눌러 첫 상품을 등록해 보세요.</p>
      </div>
    `;
    content.appendChild(createTabSpacer());
  }

  function renderList(products) {
    const list = document.createElement('ul');
    list.className = 'mp-list';

    products.forEach((p) => {
      list.appendChild(buildItem(p));
    });

    content.innerHTML = '';
    content.appendChild(list);
    content.appendChild(createTabSpacer());
  }

  function buildItem(product) {
    const item = document.createElement('li');
    item.className = 'mp-item';
    item.dataset.id = String(product.id);

    const meta = STATUS_META[product.status] || { label: product.status || '-', cls: '' };

    const thumbInner = product.imageUrl
      ? `<img src="${escapeAttr(product.imageUrl)}" alt="" />`
      : `<span class="mp-item__thumb-fallback" aria-hidden="true">🛒</span>`;

    const categoryHtml = product.category
      ? `<span class="mp-item__category">${escapeHtml(product.category)}</span>`
      : '';

    item.innerHTML = `
      <div class="mp-item__thumb">${thumbInner}</div>
      <div class="mp-item__body">
        <div class="mp-item__title-row">
          <span class="mp-item__name">${escapeHtml(product.name || '')}</span>
          <span class="mp-status-badge ${meta.cls}">${escapeHtml(meta.label)}</span>
        </div>
        <div class="mp-item__meta">
          <span class="mp-item__price">${formatPriceRaw(product.price)}원</span>
          ${categoryHtml}
        </div>
      </div>
      <div class="mp-item__actions">
        <button class="mp-item__btn mp-item__btn--edit" data-action="edit">수정</button>
        <button class="mp-item__btn mp-item__btn--delete" data-action="delete">삭제</button>
      </div>
    `;

    item.querySelector('.mp-item__body').addEventListener('click', () => {
      navigate(`/app/product-detail/${encodeURIComponent(product.id)}`);
    });

    item.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
      e.stopPropagation();
      navigate(`/app/product-register?id=${encodeURIComponent(product.id)}`);
    });

    item.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await showConfirmDialog({
        title: '상품 삭제',
        message: `"${product.name}" 상품을 삭제하시겠습니까?`,
        confirmLabel: '삭제',
        cancelLabel: '취소',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteProduct(product.id);
        showToast('상품이 삭제되었습니다', { variant: 'success' });
        await refresh();
      } catch (err) {
        showToast('삭제 실패: ' + (err.message || String(err)), { variant: 'error' });
      }
    });

    return item;
  }

  // ---- Fetch + render ----
  async function refresh() {
    content.innerHTML = '<div class="mp-loading">불러오는 중...</div>';
    try {
      const products = await api.getProducts({ sellerId: String(user.id) });
      if (!Array.isArray(products) || products.length === 0) {
        renderEmpty();
      } else {
        renderList(products);
      }
    } catch (err) {
      content.innerHTML = `
        <div class="mp-empty">
          <span class="mp-empty__icon" aria-hidden="true">⚠️</span>
          <p class="mp-empty__title">목록을 불러오지 못했습니다</p>
          <p class="mp-empty__desc">${escapeHtml(err.message || String(err))}</p>
        </div>
      `;
      content.appendChild(createTabSpacer());
    }
  }

  await refresh();

  return page;
}

