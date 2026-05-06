/**
 * Order Detail Page — 주문/판매 상세 + 배송 상태 스테퍼
 * Route: /app/order-detail/:id  (params.id = auctionId)
 *
 * @module pages/order-detail
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';

const _cssId = 'page-css-order-detail';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/order-detail.css';
  document.head.appendChild(link);
}

const STEPS = [
  { key: 'payment_complete',    label: '결제완료' },
  { key: 'shipped',             label: '발송완료' },
  { key: 'purchase_confirmed',  label: '구매확정' },
  { key: 'settlement_complete', label: '정산완료' },
];

function stepIndex(status) {
  const idx = STEPS.findIndex(s => s.key === status);
  return idx < 0 ? 0 : idx;
}

export default async function load(params) {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const auctionId = params && params.id;

  const page = document.createElement('div');
  page.className = 'od-page';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <header class="od-header">
      <button class="od-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="od-header__title" id="od-title">주문 상세</h1>
    </header>
    <div class="od-content" id="od-content">
      <div class="od-loading">
        <div class="od-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    </div>
  `;

  page.querySelector('.od-header__back').addEventListener('click', () => window.history.back());

  async function loadDetail() {
    const contentEl = page.querySelector('#od-content');
    contentEl.innerHTML = `
      <div class="od-loading">
        <div class="od-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    `;
    try {
      const res = await fetch(`/api/auctions/${encodeURIComponent(auctionId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderDetail(contentEl, data);
    } catch (err) {
      contentEl.innerHTML = `
        <div class="od-empty">
          <span class="od-empty__icon">⚠️</span>
          <span class="od-empty__title">데이터를 불러올 수 없습니다</span>
          <button class="od-empty__retry" id="od-retry">다시 시도</button>
        </div>
      `;
      contentEl.querySelector('#od-retry').addEventListener('click', loadDetail);
    }
  }

  function renderDetail(container, data) {
    const isSeller = String(user.id) === String(data.sellerId);
    const status   = data.deliveryStatus || 'payment_complete';
    const idx      = stepIndex(status);

    /* Title */
    const titleEl = page.querySelector('#od-title');
    if (titleEl) titleEl.textContent = isSeller ? '판매 상세' : '주문 상세';

    const dateStr   = data.endsAt ? formatDate(data.endsAt) : '—';
    const modeLabel = data.mode === 'blind' ? '블라인드' : data.mode === 'fcfs' ? '선착순' : '경매';
    const imgSrc    = data.imageUrl || null;

    /* Card */
    const card = `
      <section class="od-card">
        <div class="od-card__thumb">
          ${imgSrc
            ? `<img src="${escapeAttr(imgSrc)}" alt="${escapeHtml(data.productName)}" loading="lazy">`
            : `<span class="od-card__thumb-fallback">🌿</span>`}
        </div>
        <div class="od-card__body">
          <div class="od-card__name">${escapeHtml(data.productName || '상품')}</div>
          <div class="od-card__price">${formatPrice(data.finalPrice)}</div>
          <div class="od-card__meta">
            <span class="od-card__mode">${modeLabel}</span>
            <span class="od-card__date">${dateStr}</span>
          </div>
          ${isSeller && data.buyerName
            ? `<div class="od-card__party">구매자 <span class="od-card__party-name">${escapeHtml(data.buyerName)}</span></div>`
            : !isSeller && data.sellerName
            ? `<div class="od-card__party">판매자 <span class="od-card__party-name">${escapeHtml(data.sellerName)}</span></div>`
            : ''}
        </div>
      </section>
    `;

    /* Stepper */
    const stepperHtml = `
      <section class="od-stepper" aria-label="배송 상태">
        ${STEPS.map((s, i) => {
          const state = i < idx ? 'done' : i === idx ? 'active' : 'future';
          const icon  = state === 'done' ? '✓' : String(i + 1);
          const label = (isSeller && s.key === 'purchase_confirmed') ? '정산대기' : s.label;
          return `
            <div class="od-step od-step--${state}">
              <div class="od-step__circle">${icon}</div>
              <div class="od-step__label">${label}</div>
            </div>
          `;
        }).join('')}
      </section>
    `;

    /* Tracking info — shown whenever status is shipped or later */
    const hasTracking = !!(data.trackingCompany && data.trackingNumber);
    const isPostShip  = ['shipped', 'purchase_confirmed', 'settlement_complete'].includes(status);
    let trackingHtml  = '';
    if (isPostShip) {
      trackingHtml = `
        <section class="od-delivery-info od-tracking-info" id="od-tracking-section">
          <div class="od-tracking-header">
            <h2 class="od-delivery-info__title">배송 정보</h2>
            ${hasTracking
              ? `<button class="od-tracking-btn" id="od-tracking-btn">배송 조회</button>`
              : ''}
          </div>
          ${hasTracking
            ? `<dl class="od-delivery-info__list">
                 <div class="od-delivery-info__row"><dt>택배사</dt><dd>${escapeHtml(data.trackingCompany)}</dd></div>
                 <div class="od-delivery-info__row"><dt>운송장 번호</dt><dd>${escapeHtml(data.trackingNumber)}</dd></div>
               </dl>`
            : `<p class="od-tracking-no-info">배송 정보가 없습니다</p>`}
        </section>
      `;
    }

    /* Delivery info — buyer side */
    let deliveryHtml = '';
    if (!isSeller && data.buyerDelivery) {
      const d = data.buyerDelivery;
      deliveryHtml = `
        <section class="od-delivery-info">
          <h2 class="od-delivery-info__title">배송지 정보</h2>
          <dl class="od-delivery-info__list">
            ${d.name     ? `<div class="od-delivery-info__row"><dt>받는 분</dt><dd>${escapeHtml(d.name)}</dd></div>` : ''}
            ${d.phone    ? `<div class="od-delivery-info__row"><dt>연락처</dt><dd>${escapeHtml(d.phone)}</dd></div>` : ''}
            ${d.zipcode  ? `<div class="od-delivery-info__row"><dt>우편번호</dt><dd>${escapeHtml(d.zipcode)}</dd></div>` : ''}
            ${d.address  ? `<div class="od-delivery-info__row"><dt>주소</dt><dd>${escapeHtml(d.address)}</dd></div>` : ''}
            ${d.detail   ? `<div class="od-delivery-info__row"><dt>상세주소</dt><dd>${escapeHtml(d.detail)}</dd></div>` : ''}
          </dl>
        </section>
      `;
    }

    /* Action area */
    let actionHtml = '';
    if (isSeller && status === 'payment_complete') {
      actionHtml = `
        <section class="od-ship-form" id="od-ship-form">
          <h2 class="od-ship-form__title">발송 처리</h2>
          <label class="od-ship-form__label">택배사 <span class="od-ship-form__required">*</span></label>
          <select class="od-ship-form__select" id="od-courier">
            <option value="">택배사 선택</option>
            <option value="CJ대한통운">CJ대한통운</option>
            <option value="우체국택배">우체국택배</option>
            <option value="한진택배">한진택배</option>
            <option value="롯데택배">롯데택배</option>
            <option value="로젠택배">로젠택배</option>
            <option value="경동택배">경동택배</option>
            <option value="기타">기타</option>
          </select>
          <label class="od-ship-form__label">운송장 번호 <span class="od-ship-form__required">*</span></label>
          <input class="od-ship-form__input" id="od-tracking" type="text" placeholder="운송장 번호 입력" inputmode="numeric">
          <button class="od-action-btn" id="od-action">발송 처리 완료</button>
        </section>
      `;
    } else if (!isSeller && status === 'shipped') {
      actionHtml = `<button class="od-action-btn" id="od-action">구매 확정</button>`;
    } else if (isSeller && status === 'purchase_confirmed') {
      actionHtml = `<button class="od-action-btn" id="od-action">정산 완료 처리</button>`;
    }

    container.innerHTML = card + stepperHtml + trackingHtml + deliveryHtml + actionHtml;

    /* Bind tracking button — opens carrier site directly */
    const trackingBtn = container.querySelector('#od-tracking-btn');
    if (trackingBtn && hasTracking) {
      trackingBtn.addEventListener('click', () => {
        const url = carrierTrackingUrl(data.trackingCompany, data.trackingNumber);
        if (url) {
          window.open(url, '_blank', 'noopener');
        } else {
          showToast('해당 택배사의 조회 링크를 지원하지 않습니다', { duration: 2000 });
        }
      });
    }

    /* Bind action */
    const actionBtn = container.querySelector('#od-action');
    if (!actionBtn) return;

    if (isSeller && status === 'payment_complete') {
      actionBtn.addEventListener('click', async () => {
        const courierEl = container.querySelector('#od-courier');
        const trackingEl = container.querySelector('#od-tracking');
        const courier = courierEl ? courierEl.value.trim() : '';
        const tracking = trackingEl ? trackingEl.value.trim() : '';
        if (!courier) { showToast('택배사를 선택해주세요', { duration: 1800 }); courierEl && courierEl.focus(); return; }
        if (!tracking) { showToast('운송장 번호를 입력해주세요', { duration: 1800 }); trackingEl && trackingEl.focus(); return; }
        actionBtn.disabled = true;
        try {
          const res = await fetch(`/api/auctions/${encodeURIComponent(data.auctionId)}/delivery-status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'shipped', userId: user.id, trackingCompany: courier, trackingNumber: tracking }),
          });
          if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
          showToast('발송 처리가 완료되었습니다', { variant: 'success', duration: 1800 });
          await loadDetail();
        } catch (err) {
          actionBtn.disabled = false;
          showToast(err.message || '발송 처리에 실패했습니다', { duration: 2000 });
        }
      });
    } else {
      const targetMap = { shipped: 'purchase_confirmed', purchase_confirmed: 'settlement_complete' };
      const nextStatus = targetMap[status];
      actionBtn.addEventListener('click', async () => {
        actionBtn.disabled = true;
        try {
          const res = await fetch(`/api/auctions/${encodeURIComponent(data.auctionId)}/delivery-status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus, userId: user.id }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          showToast('상태가 변경되었습니다', { variant: 'success', duration: 1600 });
          await loadDetail();
        } catch (err) {
          actionBtn.disabled = false;
          showToast('상태 변경에 실패했습니다', { duration: 2000 });
        }
      });
    }
  }

  loadDetail();
  return page;
}

const CARRIER_URLS = {
  'CJ대한통운': (n) => `https://trace.cjlogistics.com/next/tracking.html?wblNo=${n}`,
  '우체국택배': (n) => `https://service.epost.go.kr/trace.RetrieveDomRipTraceList.comm?sid1=${n}`,
  '한진택배':   (n) => `https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${n}`,
  '롯데택배':   (n) => `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${n}`,
  '로젠택배':   (n) => `https://www.ilogen.com/iLogenHub/tracking/${n}`,
  '경동택배':   (n) => `https://kdexp.com/newDeliverySearch.ekd?barcode=${n}`,
};

function carrierTrackingUrl(company, number) {
  const fn = CARRIER_URLS[company];
  return fn ? fn(encodeURIComponent(number)) : null;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(iso); }
}

function formatPrice(price) {
  if (price == null) return '—';
  return Number(price).toLocaleString('ko-KR') + '원';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
