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
import { thumbFallback } from '/app/components/brand-assets.js';

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
      <button class="pd-header__wish" id="pd-wish-btn" aria-label="찜하기" aria-pressed="false">♡</button>
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
          ${product.stock > 0
            ? `<span class="pd-stock">재고 ${product.stock}개</span>`
            : `<span class="pd-stock pd-stock--out">품절</span>`}
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

      <section class="pd-market is-hidden" id="pd-market"></section>

      <section class="pd-rec is-hidden" id="pd-rec">
        <h2 class="pd-rec__title">
          <img src="/app/images/chunsim_logo_v3.png" alt="농협몰" class="pd-rec__logo">
          추천 상품
        </h2>
        <div class="pd-rec__scroll" id="pd-rec-scroll"></div>
      </section>
    </div>

    <div class="pd-bottom-bar" id="pd-bottom-bar"></div>
  `;

  // ---- Header back ----
  page.querySelector('#pd-back').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/app/home');
  });

  // ---- Wishlist heart button ----
  const wishBtn = page.querySelector('#pd-wish-btn');
  let wishlisted = false;

  function setWishState(state) {
    wishlisted = state;
    wishBtn.textContent = wishlisted ? '♥' : '♡';
    wishBtn.setAttribute('aria-pressed', String(wishlisted));
    wishBtn.classList.toggle('pd-header__wish--active', wishlisted);
  }

  // Load initial wish state (best-effort)
  (async () => {
    try {
      const list = await api.getWishlist(currentUser.id);
      const ids = Array.isArray(list) ? list.map((p) => String(p.id)) : [];
      setWishState(ids.includes(String(productId)));
    } catch { /* ignore — defaults to un-wishlisted */ }
  })();

  wishBtn.addEventListener('click', async () => {
    try {
      const res = await api.toggleWishlist({ userId: currentUser.id, productId });
      setWishState(res.wishlisted);
      showToast(res.wishlisted ? '찜 목록에 추가됐어요' : '찜 목록에서 제거됐어요', { variant: 'success', duration: 1800 });
    } catch (err) {
      showToast('찜 처리에 실패했습니다', { variant: 'error' });
    }
  });

  // ---- Render gallery ----
  const galleryMain = page.querySelector('#pd-gallery-main');
  const galleryStrip = page.querySelector('#pd-gallery-strip');

  function renderMainImage() {
    if (!allImages.length) {
      galleryMain.innerHTML =
        `<div class="pd-gallery__main-placeholder" aria-hidden="true" style="width:100%;height:100%;line-height:0;overflow:hidden">${thumbFallback(product.category || '기타')}</div>`;
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

      // 판매자 평점 뱃지 (best-effort)
      try {
        const reviews = await api.getSellerReviews(product.sellerId);
        const sellerEl = page.querySelector('#pd-seller');
        if (!sellerEl) return;
        if (reviews.count > 0 && reviews.average != null) {
          const badge = document.createElement('span');
          badge.className = 'pd-seller-rating';
          badge.setAttribute('aria-label', `판매자 평점 ${Number(reviews.average).toFixed(1)}점 (리뷰 ${reviews.count}건)`);
          badge.innerHTML = `<span class="pd-seller-rating__star" aria-hidden="true">★</span>${Number(reviews.average).toFixed(1)} <span class="pd-seller-rating__count">(${reviews.count})</span>`;
          sellerEl.appendChild(badge);
        } else if (reviews.count === 0) {
          const badge = document.createElement('span');
          badge.className = 'pd-seller-rating pd-seller-rating--new';
          badge.textContent = '신규 판매자';
          sellerEl.appendChild(badge);
        }
      } catch { /* 평점 조회 실패 시 뱃지 생략 */ }
    })();
  }

  // ---- Market reference price ----
  loadMarketReference(page, product.name, product.category);

  // ---- Recommendations ----
  loadProductRecommendations(page, product.category);

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
    const maxStock = Number(product.stock) || 1;
    bottomBar.innerHTML = `
      <div class="pd-qty-row">
        <span class="pd-qty-label">수량</span>
        <div class="pd-qty-ctrl">
          <button class="pd-qty-btn" id="pd-qty-minus" aria-label="수량 감소">−</button>
          <span class="pd-qty-val" id="pd-qty-val">1</span>
          <button class="pd-qty-btn" id="pd-qty-plus" aria-label="수량 증가">+</button>
        </div>
      </div>
      <button class="pd-btn pd-btn--cta" id="pd-buy-btn">구매하기</button>
    `;
    let selectedQty = 1;
    const qtyValEl = page.querySelector('#pd-qty-val');
    page.querySelector('#pd-qty-minus').addEventListener('click', () => {
      if (selectedQty > 1) { selectedQty--; qtyValEl.textContent = selectedQty; }
    });
    page.querySelector('#pd-qty-plus').addEventListener('click', () => {
      if (selectedQty < maxStock) { selectedQty++; qtyValEl.textContent = selectedQty; }
    });
    page.querySelector('#pd-buy-btn').addEventListener('click', async () => {
      // 배송지 조회: 일반배송(delivery-addresses) 또는 하나로마트 반값택배(users.deliveryOption)
      let deliveryAddr = null;
      try {
        const res = await fetch(`/api/delivery-addresses?userId=${encodeURIComponent(currentUser.id)}`);
        if (res.ok) {
          const addresses = await res.json();
          const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
          if (defaultAddr) {
            deliveryAddr = `${defaultAddr.address}${defaultAddr.detail ? ' ' + defaultAddr.detail : ''}`;
          }
        }
      } catch { /* ignore */ }

      // 하나로마트 반값택배 설정 시 마트 주소를 배송지로 인정
      if (!deliveryAddr) {
        try {
          const u = await api.getUser(currentUser.id);
          if (u && u.deliveryOption === 'hanaro' && u.hanaroMartAddr) {
            deliveryAddr = `[하나로마트 수령] ${u.hanaroMartName || ''} ${u.hanaroMartAddr}`.trim();
          }
        } catch { /* ignore */ }
      }

      if (!deliveryAddr) {
        showToast('배송지를 먼저 등록해주세요');
        const returnTo = window.location.pathname + window.location.search;
        navigate('/app/delivery-addresses?returnTo=' + encodeURIComponent(returnTo));
        return;
      }

      // 등급 기반 예상 할인 조회 (실패 시 할인 없이 표시)
      let tier = null;
      try {
        tier = await api.getUserTier(currentUser.id);
      } catch { /* ignore; show base price */ }
      const unitPrice    = Number(product.price) || 0;
      const totalBase    = unitPrice * selectedQty;
      const discountRate = Number(tier && tier.buyerDiscountRate) || 0;
      const discountAmt  = Math.round(totalBase * discountRate / 100);
      const finalPrice   = Math.max(0, totalBase - discountAmt);
      const priceRowHtml = discountAmt > 0
        ? `<span class="pd-confirm-sheet__value">
             <span class="pd-confirm-sheet__price-original">${totalBase.toLocaleString('ko-KR')}원</span>
             <span class="pd-confirm-sheet__price-arrow">→</span>
             <span class="pd-confirm-sheet__price-final">${finalPrice.toLocaleString('ko-KR')}원</span>
             <span class="pd-confirm-sheet__price-tag">(${escapeHtml(tier.label || '')} 등급 ${discountRate}% 할인)</span>
           </span>`
        : `<span class="pd-confirm-sheet__value">${finalPrice.toLocaleString('ko-KR')}원</span>`;

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
            <span class="pd-confirm-sheet__label">수량</span>
            <span class="pd-confirm-sheet__value">${selectedQty}개</span>
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
            body: JSON.stringify({ buyerId: currentUser.id, quantity: selectedQty }),
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

/* ─── Market reference price (KAMIS) ──────────────────────── */

async function loadMarketReference(page, name, category) {
  const section = page.querySelector('#pd-market');
  if (!section || !name) return;

  try {
    const params = new URLSearchParams({ name });
    if (category) params.set('category', category);
    const res = await fetch(`/api/market-prices/match?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !data.matched || !data.price) return;

    const p = data.price;
    const itemLabel = p.kindName
      ? `${escapeHtml(p.itemName)}(${escapeHtml(p.kindName)})`
      : escapeHtml(p.itemName);
    const priceStr = Number(p.price).toLocaleString('ko-KR');
    const unit = escapeHtml(p.unit || '');

    section.innerHTML = `
      <div class="pd-market__card">
        <p class="pd-market__line">
          📊 오늘 ${itemLabel} 소매시세
          <strong class="pd-market__price">${priceStr}원/${unit}</strong>
        </p>
        <p class="pd-market__source">KAMIS 농산물유통정보 · ${escapeHtml(p.priceDate || '')} 기준</p>
      </div>
    `;
    section.classList.remove('is-hidden');
  } catch (err) {
    console.error('[product-detail] loadMarketReference error:', err);
    // 실패 시 섹션 숨김 유지
  }
}

/* ─── Recommendations ─────────────────────────────────────── */

async function loadProductRecommendations(page, category) {
  const section = page.querySelector('#pd-rec');
  const scrollEl = page.querySelector('#pd-rec-scroll');
  if (!section || !scrollEl) return;

  // 농협몰 추천 한시적 숨김 (2026-06-25)
  const { isNhmallRecHidden } = await import('/app/scripts/nhmall-rec-flag.js');
  if (isNhmallRecHidden()) { section.classList.add('is-hidden'); return; }

  try {
    const params = category
      ? `categories=${encodeURIComponent(category)}&limit=6`
      : 'limit=6';
    const res = await fetch(`/api/recommendations/by-interests?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { recommendations } = await res.json();

    if (!recommendations || recommendations.length === 0) return;

    scrollEl.innerHTML = recommendations.map((p) => {
      const hasDiscount = p.discountRate > 0;
      const discountBadge = hasDiscount
        ? `<span class="pd-rec-card__discount-badge">${p.discountRate}%</span>`
        : '';
      const priceHtml = hasDiscount
        ? `<div class="pd-rec-card__price-wrap">
             <span class="pd-rec-card__list-price">${p.listPrice.toLocaleString('ko-KR')}원</span>
             <span class="pd-rec-card__price pd-rec-card__price--sale">${p.price.toLocaleString('ko-KR')}원</span>
           </div>`
        : `<div class="pd-rec-card__price-wrap">
             <span class="pd-rec-card__price">${p.price.toLocaleString('ko-KR')}원</span>
           </div>`;
      return `
        <div class="pd-rec-card" role="button" tabindex="0" data-product-url="${escapeAttr(p.detailUrl || '#')}">
          <div class="pd-rec-card__thumb">
            ${discountBadge}
            ${p.imgUrl ? `<img src="${escapeAttr(p.imgUrl)}" alt="${escapeHtml(p.name)}" loading="lazy">` : '<span class="pd-rec-card__no-img">🌿</span>'}
          </div>
          <div class="pd-rec-card__body">
            <div class="pd-rec-card__name">${escapeHtml(p.name)}</div>
            ${priceHtml}
          </div>
        </div>
      `;
    }).join('');

    scrollEl.querySelectorAll('.pd-rec-card').forEach(card => {
      const url = card.dataset.productUrl;
      card.addEventListener('click', (e) => {
        e.preventDefault();
        if (url && url !== '#') window.open(url, '_blank', 'noopener');
      });
      card.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (url && url !== '#') window.open(url, '_blank', 'noopener');
        }
      });
    });

    section.classList.remove('is-hidden');
  } catch (err) {
    console.error('[product-detail] loadProductRecommendations error:', err);
    // 실패 시 섹션 숨김 유지
  }
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
