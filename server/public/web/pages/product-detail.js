/**
 * Product Detail Page — 상품 상세
 * GET /api/products/:id 로 단건 조회 후 이미지·정보·판매자 표시.
 * 본인 상품: 수정/삭제 버튼, 타인 상품: 구매 버튼.
 *
 * @module pages/product-detail
 */

import * as api from '/app/scripts/api.js';
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { showConfirmDialog } from '/app/components/confirm-dialog.js';
import { personIconSVG } from '/app/scripts/person-icon.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';
import { formatPriceRaw } from '/app/scripts/format.js';

/* ── CSS injection ─────────────────────────────────────────── */
const _cssId = 'page-css-product-detail';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/product-detail.css';
  document.head.appendChild(link);
}

/**
 * @param {{ id?: string }} [params]
 * @returns {Promise<HTMLElement>}
 */
export default async function load(params = {}) {
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

  // ---- Resolve product id ----
  const productId =
    params.id || new URLSearchParams(window.location.search).get('id');
  if (!productId) {
    showToast('상품 정보가 올바르지 않습니다', { variant: 'error' });
    await replace('/app/home');
    return document.createElement('div');
  }

  // ---- Fetch product ----
  let product;
  try {
    product = await api.getProduct(productId);
  } catch (err) {
    showToast(
      '상품을 찾을 수 없습니다' +
        (err && err.message ? ': ' + err.message : ''),
      { variant: 'error' }
    );
    await navigate('/app/home');
    return document.createElement('div');
  }

  const isMine = String(product.sellerId) === String(currentUser.id);

  // ---- Build images list ----
  const allImages = [product.imageUrl, ...(product.images || [])].filter(
    Boolean
  );
  let currentImgIndex = 0;

  // ---- Build page DOM ----
  const page = document.createElement('section');
  page.className = 'product-detail';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <header class="pd-header">
      <button class="pd-header__back" id="pd-back" aria-label="뒤로">‹</button>
      <h1 class="pd-header__title">상품 상세</h1>
      <span class="pd-header__spacer" aria-hidden="true"></span>
    </header>

    <div class="pd-scroll">
      <div class="pd-gallery" id="pd-gallery">
        <div class="pd-gallery__main" id="pd-gallery-main"></div>
        <div class="pd-gallery__strip" id="pd-gallery-strip"></div>
      </div>

      <div class="pd-body">
        <div class="pd-title-area">
          ${
            product.category
              ? `<span class="pd-category-badge">${escapeHtml(
                  product.category
                )}</span>`
              : ''
          }
          <h2 class="pd-name">${escapeHtml(product.name || '')}</h2>
        </div>

        <div class="pd-price-area">
          <span class="pd-price">${formatPriceRaw(product.price)}</span>
          <span class="pd-price__won">원</span>
        </div>

        ${renderChips(product.attributes, 'pd-attr-chips')}
        ${renderChips(product.features, 'pd-feat-chips')}

        ${
          product.description
            ? `
          <div class="pd-section">
            <h3 class="pd-section__title">상품 설명</h3>
            <p class="pd-description">${escapeHtml(product.description)}</p>
          </div>
        `
            : ''
        }

        <div class="pd-seller" id="pd-seller" style="display:none">
          <div class="pd-seller__avatar" id="pd-seller-avatar"></div>
          <div class="pd-seller__info">
            <span class="pd-seller__label">판매자</span>
            <span class="pd-seller__name" id="pd-seller-name">—</span>
          </div>
        </div>
      </div>
    </div>

    <div class="pd-bottom-bar" id="pd-bottom-bar"></div>
  `;

  // ---- Header back ----
  page.querySelector('#pd-back').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/app/home');
  });

  // ---- Render gallery ----
  const galleryMain = page.querySelector('#pd-gallery-main');
  const galleryStrip = page.querySelector('#pd-gallery-strip');

  function renderMainImage() {
    if (!allImages.length) {
      galleryMain.innerHTML =
        '<div class="pd-gallery__main-placeholder" aria-hidden="true">🛒</div>';
      return;
    }
    const url = allImages[currentImgIndex];
    galleryMain.innerHTML = `<img src="${escapeAttr(url)}" alt="${escapeAttr(
      product.name || ''
    )}" />`;
  }

  function renderStrip() {
    if (allImages.length <= 1) {
      galleryStrip.style.display = 'none';
      return;
    }
    galleryStrip.style.display = '';
    galleryStrip.innerHTML = '';
    allImages.forEach((url, idx) => {
      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className =
        'pd-gallery__strip-thumb' +
        (idx === currentImgIndex ? ' is-active' : '');
      thumb.innerHTML = `<img src="${escapeAttr(url)}" alt="" />`;
      thumb.addEventListener('click', () => {
        if (idx === currentImgIndex) return;
        currentImgIndex = idx;
        renderMainImage();
        galleryStrip
          .querySelectorAll('.pd-gallery__strip-thumb')
          .forEach((t, i) => {
            t.classList.toggle('is-active', i === currentImgIndex);
          });
      });
      galleryStrip.appendChild(thumb);
    });
  }

  renderMainImage();
  renderStrip();

  // ---- Load seller info (best-effort) ----
  if (product.sellerId) {
    (async () => {
      try {
        const seller = await api.getUser(product.sellerId);
        if (!seller) return;
        const sellerEl = page.querySelector('#pd-seller');
        const nameEl = page.querySelector('#pd-seller-name');
        const avatarEl = page.querySelector('#pd-seller-avatar');
        sellerEl.style.display = '';
        nameEl.textContent =
          seller.nickname || seller.displayName || '판매자';
        // NH 조합원 인증 뱃지
        if (seller.isNhMember && seller.bankVerifiedAt) {
          const badge = document.createElement('span');
          badge.className = 'nh-badge';
          badge.textContent = '🏦 조합원 인증';
          nameEl.insertAdjacentElement('afterend', badge);
        }
        if (seller.avatarUrl) {
          avatarEl.innerHTML = `<img src="${escapeAttr(
            seller.avatarUrl
          )}" alt="" />`;
        } else {
          avatarEl.innerHTML = personIconSVG(32);
        }
      } catch {
        // 판매자 조회 실패 시 영역은 숨겨진 상태로 둔다.
      }
    })();
  }

  // ---- Bottom bar buttons ----
  const bottomBar = page.querySelector('#pd-bottom-bar');

  if (isMine) {
    bottomBar.innerHTML = `
      <button class="pd-btn pd-btn--secondary" id="pd-delete-btn">삭제하기</button>
      <button class="pd-btn pd-btn--primary" id="pd-edit-btn">수정하기</button>
    `;
    page.querySelector('#pd-edit-btn').addEventListener('click', () => {
      navigate(
        `/app/product-register?id=${encodeURIComponent(productId)}`
      );
    });
    page
      .querySelector('#pd-delete-btn')
      .addEventListener('click', async () => {
        const ok = await showConfirmDialog({
          title: '상품 삭제',
          message: `"${product.name}" 상품을 삭제하시겠습니까?`,
          confirmLabel: '삭제',
          cancelLabel: '취소',
          danger: true,
        });
        if (!ok) return;
        try {
          await api.deleteProduct(productId);
          showToast('상품이 삭제되었습니다', { variant: 'success' });
          navigate('/app/my-products');
        } catch (err) {
          showToast(
            '삭제 실패: ' + (err.message || String(err)),
            { variant: 'error' }
          );
        }
      });
  } else {
    bottomBar.innerHTML = `
      <button class="pd-btn pd-btn--cta" id="pd-buy-btn">구매하기</button>
    `;
    page.querySelector('#pd-buy-btn').addEventListener('click', async () => {
      // 최신 배송지 정보를 서버에서 직접 조회 (캐시된 user 객체는 delivery 필드가 없을 수 있음)
      let freshUser;
      try {
        freshUser = await api.getUser(currentUser.id);
      } catch {
        freshUser = currentUser;
      }
      const deliveryAddr = freshUser.delivery?.address || freshUser.deliveryAddress || null;

      if (!deliveryAddr) {
        showToast('배송지를 먼저 등록해주세요');
        navigate('/app/delivery-addresses');
        return;
      }

      // 등급 기반 예상 할인 조회 (실패 시 할인 없이 표시)
      let tier = null;
      try {
        tier = await api.getUserTier(currentUser.id);
      } catch { /* ignore; show base price */ }
      const basePrice    = Number(product.price) || 0;
      const discountRate = Number(tier && tier.buyerDiscountRate) || 0;
      const discountAmt  = Math.round(basePrice * discountRate / 100);
      const finalPrice   = Math.max(0, basePrice - discountAmt);
      const priceRowHtml = discountAmt > 0
        ? `<span class="pd-confirm-sheet__value">
             <span class="pd-confirm-sheet__price-original">${basePrice.toLocaleString('ko-KR')}원</span>
             <span class="pd-confirm-sheet__price-arrow">→</span>
             <span class="pd-confirm-sheet__price-final">${finalPrice.toLocaleString('ko-KR')}원</span>
             <span class="pd-confirm-sheet__price-tag">(${escapeHtml(tier.label || '')} 등급 ${discountRate}% 할인)</span>
           </span>`
        : `<span class="pd-confirm-sheet__value">${basePrice.toLocaleString('ko-KR')}원</span>`;

      // 구매 확인 바텀시트
      const overlay = document.createElement('div');
      overlay.className = 'pd-confirm-overlay';
      overlay.dataset.theme = 'light';
      overlay.innerHTML = `
        <div class="pd-confirm-sheet">
          <div class="pd-confirm-sheet__title">구매 확인</div>
          <div class="pd-confirm-sheet__row">
            <span class="pd-confirm-sheet__label">상품</span>
            <span class="pd-confirm-sheet__value">${escapeHtml(product.name)}</span>
          </div>
          <div class="pd-confirm-sheet__row">
            <span class="pd-confirm-sheet__label">가격</span>
            ${priceRowHtml}
          </div>
          <div class="pd-confirm-sheet__row">
            <span class="pd-confirm-sheet__label">배송지</span>
            <span class="pd-confirm-sheet__value pd-confirm-sheet__value--addr">${escapeHtml(deliveryAddr)}</span>
          </div>
          <div class="pd-confirm-sheet__actions">
            <button class="pd-confirm-sheet__cancel">취소</button>
            <button class="pd-confirm-sheet__ok">구매 확정</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('.pd-confirm-sheet__cancel').addEventListener('click', () => {
        overlay.remove();
      });
      overlay.querySelector('.pd-confirm-sheet__ok').addEventListener('click', async () => {
        overlay.querySelector('.pd-confirm-sheet__ok').disabled = true;
        try {
          const res = await fetch(`/api/products/${product.id}/purchase`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buyerId: currentUser.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '구매 실패');
          overlay.remove();
          navigate('/app/order-detail/' + data.orderId);
        } catch (err) {
          showToast(err.message || '구매 중 오류가 발생했습니다');
          const okBtn = overlay.querySelector('.pd-confirm-sheet__ok');
          if (okBtn) okBtn.disabled = false;
        }
      });
    });
  }

  return page;
}

/* ─── Helpers ─────────────────────────────────────────────── */

function renderChips(jsonStr, className) {
  if (!jsonStr) return '';
  let arr;
  try {
    arr = JSON.parse(jsonStr);
  } catch {
    return '';
  }
  if (!Array.isArray(arr) || !arr.length) return '';
  return `<div class="${className}">${arr
    .map((v) => `<span class="pd-chip">${escapeHtml(v)}</span>`)
    .join('')}</div>`;
}
