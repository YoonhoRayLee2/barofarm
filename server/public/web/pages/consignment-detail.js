/**
 * Consignment Detail Page — 위탁 상세 + 매칭 신청
 * Route: /app/consignment/:id
 */
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { personIconSVG } from '/app/scripts/person-icon.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';
import { formatPrice } from '/app/scripts/format.js';

const _cssId = 'page-css-consignment-detail';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId; link.rel = 'stylesheet';
  link.href = '/app/pages/consignment-detail.css';
  document.head.appendChild(link);
}

export default async function load(params) {
  const id = Number(params && params.id);
  if (!id) { showToast('잘못된 요청입니다', { variant: 'error' }); await replace('/app/home'); return document.createElement('div'); }

  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'cd-page';
  page.dataset.theme = 'light';
  page.innerHTML = `
    <header class="cd-header">
      <button class="cd-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="cd-header__title">위탁 상세</h1>
    </header>
    <div class="cd-content" id="cd-content">
      <div class="cd-loading"><div class="cd-loading__dot"></div><span>불러오는 중...</span></div>
    </div>
  `;

  page.querySelector('.cd-header__back').addEventListener('click', () => window.history.back());

  let data = null;
  try {
    const res = await fetch(`/api/consignments/${id}`);
    if (!res.ok) throw new Error('failed');
    data = await res.json();
  } catch {
    const el = page.querySelector('#cd-content');
    el.innerHTML = `<div class="cd-empty"><span class="cd-empty__text">위탁 정보를 불러올 수 없습니다</span></div>`;
    return page;
  }

  renderDetail(page, data, user);
  return page;
}

function renderDetail(page, data, user) {
  const contentEl = page.querySelector('#cd-content');
  const images = Array.isArray(data.images) ? data.images : [];
  const isMatched = data.status === 'matched';

  const carouselHtml = images.length > 0
    ? `
      <div class="cd-carousel" id="cd-carousel">
        <img class="cd-carousel__img" id="cd-carousel-img" src="${escapeAttr(images[0])}" alt="">
        ${images.length > 1 ? `
          <button class="cd-carousel__nav cd-carousel__nav--prev" id="cd-prev" aria-label="이전">‹</button>
          <button class="cd-carousel__nav cd-carousel__nav--next" id="cd-next" aria-label="다음">›</button>
          <span class="cd-carousel__counter" id="cd-counter">1/${images.length}</span>
        ` : ''}
      </div>
    `
    : `<div class="cd-carousel"><span class="cd-carousel__fallback">🌿</span></div>`;

  const buyerAvatarHtml = data.buyerAvatar
    ? `<img class="cd-buyer__avatar-img" src="${escapeAttr(data.buyerAvatar)}" alt="">`
    : `<span class="cd-buyer__avatar-initial">${personIconSVG(28)}</span>`;

  contentEl.innerHTML = `
    ${carouselHtml}

    <div class="cd-buyer">
      <div class="cd-buyer__avatar">${buyerAvatarHtml}</div>
      <div class="cd-buyer__name">${escapeHtml(data.buyerName || '익명')}</div>
      <button class="cd-buyer__link" id="cd-view-profile">프로필 보기</button>
    </div>

    <section class="cd-section">
      <h2 class="cd-section__title">상품 정보</h2>
      <dl class="cd-dl">
        <div class="cd-dl__row"><dt>카테고리</dt><dd>${escapeHtml(data.category || '—')}</dd></div>
        <div class="cd-dl__row"><dt>수량</dt><dd>${Number(data.quantity).toLocaleString('ko-KR')}점</dd></div>
        <div class="cd-dl__row"><dt>희망가</dt><dd>${formatPrice(data.expectedPrice)}</dd></div>
        <div class="cd-dl__row"><dt>최저가 유형</dt><dd>${minPriceLabel(data.minPriceType)}</dd></div>
        <div class="cd-dl__row"><dt>수수료율</dt><dd>${data.commissionRate}%</dd></div>
        <div class="cd-dl__row"><dt>협상 가능</dt><dd>${data.commissionNegotiable ? '가능' : '불가'}</dd></div>
        <div class="cd-dl__row"><dt>위탁 유형</dt><dd>${consignmentTypeLabel(data.consignmentType)}</dd></div>
        <div class="cd-dl__row"><dt>등록일</dt><dd>${formatDate(data.createdAt)}</dd></div>
      </dl>
    </section>

    <section class="cd-section">
      <h2 class="cd-section__title">상품 설명</h2>
      <p class="cd-desc">${escapeHtml(data.description || '')}</p>
    </section>

    <div class="cd-action-wrap">
      <button class="cd-action-btn" id="cd-action" ${isMatched ? 'disabled' : ''}>
        ${isMatched ? '이미 매칭된 상품입니다' : '매칭 신청하기'}
      </button>
    </div>
  `;

  // Profile link
  contentEl.querySelector('#cd-view-profile').addEventListener('click', () => {
    navigate('/app/user/' + data.buyerId);
  });

  // Carousel
  if (images.length > 1) {
    let idx = 0;
    const imgEl = contentEl.querySelector('#cd-carousel-img');
    const counterEl = contentEl.querySelector('#cd-counter');
    const update = () => {
      imgEl.src = images[idx];
      counterEl.textContent = `${idx + 1}/${images.length}`;
    };
    contentEl.querySelector('#cd-prev').addEventListener('click', () => {
      idx = (idx - 1 + images.length) % images.length;
      update();
    });
    contentEl.querySelector('#cd-next').addEventListener('click', () => {
      idx = (idx + 1) % images.length;
      update();
    });
  }

  // Match action
  if (!isMatched) {
    const actionBtn = contentEl.querySelector('#cd-action');
    actionBtn.addEventListener('click', async () => {
      actionBtn.disabled = true;
      try {
        const res = await fetch(`/api/consignments/${data.id}/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sellerId: user.id }),
        });
        if (res.status === 409) {
          showToast('이미 매칭된 상품입니다', { variant: 'error', duration: 2000 });
          return;
        }
        if (!res.ok) throw new Error('failed');
        const json = await res.json();
        navigate('/app/chat-room/' + json.roomId);
      } catch {
        actionBtn.disabled = false;
        showToast('매칭 신청에 실패했습니다', { variant: 'error', duration: 2000 });
      }
    });
  }
}

function consignmentTypeLabel(t) {
  if (t === 'full') return '위탁 판매 (배송까지 위탁)';
  if (t === 'live_only') return '대리 진행 (방송만)';
  return t || '—';
}
function minPriceLabel(t) {
  if (t === 'none') return '최소 시작가 없음';
  if (t === 'some') return '특정 물건 최소가 있음';
  return t || '—';
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}
