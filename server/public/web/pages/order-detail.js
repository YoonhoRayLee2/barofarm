/**
 * Order Detail Page — 주문/판매 상세 + 배송 상태 스테퍼
 * Route: /app/order-detail/:id  (params.id = auctionId)
 *
 * @module pages/order-detail
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';
import { formatPrice, formatDate } from '/app/scripts/format.js';

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

const BUYER_TIER_INFO = {
  sprout: { emoji: '🌱', label: '새싹' },
  farmer: { emoji: '🌿', label: '농부' },
  elite:  { emoji: '🌾', label: '명예농부' },
  master: { emoji: '🏆', label: '마스터' },
};
const SELLER_TIER_INFO = [
  { maxRate: 0.021, emoji: '🏆', label: '마스터' },
  { maxRate: 0.031, emoji: '🌾', label: '명예농부' },
  { maxRate: 0.040, emoji: '🌿', label: '농부' },
  { maxRate: 1.000, emoji: '🌱', label: '새싹' },
];
function sellerTierFromRate(rate) {
  return SELLER_TIER_INFO.find(t => rate <= t.maxRate) || SELLER_TIER_INFO[3];
}

function showFeeHelp(isSeller) {
  const overlay = document.createElement('div');
  overlay.className = 'od-help-overlay';

  if (isSeller) {
    overlay.innerHTML = `
      <div class="od-help-sheet">
        <div class="od-help-handle"></div>
        <h3 class="od-help-title">💸 정산 수수료 안내</h3>
        <div class="od-help-formula">
          <span>낙찰가 × 수수료율 = 수수료</span>
          <span>낙찰가 − 수수료 = <strong>정산금액</strong></span>
        </div>
        <table class="od-help-table">
          <thead><tr><th>등급</th><th>3개월 판매</th><th>수수료율</th></tr></thead>
          <tbody>
            <tr><td>🌱 새싹</td><td>0 ~ 49.9만원</td><td class="od-help-benefit">4.9%</td></tr>
            <tr><td>🌿 농부</td><td>50 ~ 199.9만원</td><td class="od-help-benefit">3.9%</td></tr>
            <tr><td>🌾 명예농부</td><td>200 ~ 499.9만원</td><td class="od-help-benefit">3.0%</td></tr>
            <tr><td>🏆 마스터</td><td>500만원 이상</td><td class="od-help-benefit">2.0%</td></tr>
          </tbody>
        </table>
        <p class="od-help-note">정산은 구매자 구매확정 후 3영업일 이내에 등록 계좌로 입금됩니다.</p>
      </div>
    `;
  } else {
    overlay.innerHTML = `
      <div class="od-help-sheet">
        <div class="od-help-handle"></div>
        <h3 class="od-help-title">🎁 등급 할인 안내</h3>
        <div class="od-help-formula">
          <span>낙찰가 × 할인율 = 할인금액</span>
          <span>낙찰가 − 할인금액 = <strong>실결제액</strong></span>
        </div>
        <table class="od-help-table">
          <thead><tr><th>등급</th><th>3개월 구매</th><th>할인율</th></tr></thead>
          <tbody>
            <tr><td>🌱 새싹</td><td>0 ~ 9.9만원</td><td class="od-help-benefit">없음</td></tr>
            <tr><td>🌿 농부</td><td>10 ~ 49.9만원</td><td class="od-help-benefit">0.5%</td></tr>
            <tr><td>🌾 명예농부</td><td>50 ~ 199.9만원</td><td class="od-help-benefit">1.0%</td></tr>
            <tr><td>🏆 마스터</td><td>200만원 이상</td><td class="od-help-benefit">1.5%</td></tr>
          </tbody>
        </table>
        <p class="od-help-note">최근 3개월 구매 합산 기준으로 자동 산정됩니다.</p>
      </div>
    `;
  }

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-open'));
}

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

    /* Fee / discount card — buyer or seller view of tier-based amounts */
    let feeHtml = '';
    {
      const buyerKey   = data.buyerTier || 'sprout';
      const buyerInfo  = BUYER_TIER_INFO[buyerKey] || BUYER_TIER_INFO.sprout;
      const discountAmt  = Number(data.buyerDiscountAmt || 0);
      const discountRate = Number(data.buyerDiscountRate || 0);
      const feeRate      = Number(data.sellerFeeRate || 0);
      const feeAmt       = Number(data.sellerFeeAmt || 0);
      const finalPrice   = Number(data.finalPrice || 0);
      const settleAmt    = Math.max(0, finalPrice - feeAmt);

      if (!isSeller) {
        const showDiscount = discountAmt > 0;
        const shippingFeeStatus = data.shippingFeeStatus || 'none';
        const shippingFee = Number(data.shippingFee || 0);
        const shippingFeePaid = shippingFeeStatus === 'paid';
        const shippingFeePending = shippingFeeStatus === 'pending';
        const netPay = Math.max(0, finalPrice - discountAmt) + (shippingFeePaid ? shippingFee : 0);
        feeHtml = `
          <section class="od-fee">
            <div class="od-fee__title-row">
              <h2 class="od-fee__title">결제 정보</h2>
              <button class="od-fee__help" aria-label="결제 정보 안내">ⓘ</button>
            </div>
            <div class="od-fee__row">
              <span class="od-fee__label">적용 등급</span>
              <span class="od-fee__value">${buyerInfo.emoji} ${escapeHtml(buyerInfo.label)}</span>
            </div>
            ${showDiscount ? `
              <div class="od-fee__row">
                <span class="od-fee__label">할인 금액</span>
                <span class="od-fee__value od-fee__value--minus">-${discountAmt.toLocaleString('ko-KR')}원 (${(discountRate * 100).toFixed(1)}%)</span>
              </div>` : ''}
            ${shippingFeePaid ? `
              <div class="od-fee__row">
                <span class="od-fee__label">배송비 (합배송)</span>
                <span class="od-fee__value od-fee__value--plus">+${shippingFee.toLocaleString('ko-KR')}원</span>
              </div>` : ''}
            ${shippingFeePending ? `
              <div class="od-fee__row">
                <span class="od-fee__label">배송비 (합배송)</span>
                <span class="od-fee__value od-fee__value--pending">${shippingFee.toLocaleString('ko-KR')}원 결제 대기</span>
              </div>` : ''}
            <div class="od-fee__row od-fee__row--total">
              <span class="od-fee__label">실결제액</span>
              <span class="od-fee__value od-fee__value--strong">${netPay.toLocaleString('ko-KR')}원</span>
            </div>
          </section>
        `;
      } else {
        const sellerInfo = sellerTierFromRate(feeRate);
        feeHtml = `
          <section class="od-fee">
            <div class="od-fee__title-row">
              <h2 class="od-fee__title">정산 정보</h2>
              <button class="od-fee__help" aria-label="정산 정보 안내">ⓘ</button>
            </div>
            <div class="od-fee__row">
              <span class="od-fee__label">수수료율</span>
              <span class="od-fee__value">${(feeRate * 100).toFixed(1)}% (${sellerInfo.emoji} ${escapeHtml(sellerInfo.label)} 등급 적용)</span>
            </div>
            <div class="od-fee__row">
              <span class="od-fee__label">수수료</span>
              <span class="od-fee__value od-fee__value--minus">-${feeAmt.toLocaleString('ko-KR')}원</span>
            </div>
            <div class="od-fee__row od-fee__row--total">
              <span class="od-fee__label">정산 예정액</span>
              <span class="od-fee__value od-fee__value--strong">${settleAmt.toLocaleString('ko-KR')}원</span>
            </div>
          </section>
        `;
      }
    }

    /* Shipping fee card — 합배송 배송비 결제 흐름 (deliveryStatus와 독립) */
    const shippingFeeStatus = data.shippingFeeStatus || 'none';
    const shippingFee = Number(data.shippingFee || 0);
    let shippingFeeHtml = '';
    if (shippingFeeStatus === 'pending') {
      shippingFeeHtml = isSeller
        ? `<section class="od-shipping-fee-card od-shipping-fee-card--pending">
            <div>
              <span style="font-size:13px;color:var(--color-ink-soft)">배송비 결제 대기 중</span><br>
              <strong>₩${shippingFee.toLocaleString('ko-KR')}</strong>
            </div>
            <span style="font-size:12px;color:var(--color-ink-soft)">구매자 결제 대기</span>
          </section>`
        : `<section class="od-shipping-fee-card od-shipping-fee-card--pending">
            <div>
              <span style="font-size:13px;color:var(--color-ink-soft)">배송비 결제 대기</span><br>
              <strong>₩${shippingFee.toLocaleString('ko-KR')}</strong>
            </div>
            <button id="od-pay-shipping-btn">배송비 결제하기</button>
          </section>`;
    } else if (shippingFeeStatus === 'paid') {
      shippingFeeHtml = `
        <section class="od-shipping-fee-card od-shipping-fee-card--paid">
          <span>✅ 배송비결제완료(합배송)</span>
          <strong>₩${shippingFee.toLocaleString('ko-KR')}</strong>
        </section>
      `;
    }

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
      if (d.option === 'hanaro') {
        deliveryHtml = `
          <section class="od-delivery-info">
            <h2 class="od-delivery-info__title">배송지 정보 <span class="od-hanaro-badge">🏬 하나로마트 반값택배</span></h2>
            <dl class="od-delivery-info__list">
              ${d.name           ? `<div class="od-delivery-info__row"><dt>받는 분</dt><dd>${escapeHtml(d.name)}</dd></div>` : ''}
              ${d.phone          ? `<div class="od-delivery-info__row"><dt>연락처</dt><dd>${escapeHtml(d.phone)}</dd></div>` : ''}
              ${d.hanaroMartName ? `<div class="od-delivery-info__row"><dt>수령 마트</dt><dd>${escapeHtml(d.hanaroMartName)}</dd></div>` : ''}
              ${d.hanaroMartAddr ? `<div class="od-delivery-info__row"><dt>마트 주소</dt><dd>${escapeHtml(d.hanaroMartAddr)}</dd></div>` : ''}
            </dl>
            <p class="od-hanaro-note">판매자가 인근 하나로마트에 발송하면 위 매장에서 수령하세요.</p>
          </section>
        `;
      } else {
        deliveryHtml = `
          <section class="od-delivery-info">
            <h2 class="od-delivery-info__title">배송지 정보</h2>
            <dl class="od-delivery-info__list">
              ${d.name    ? `<div class="od-delivery-info__row"><dt>받는 분</dt><dd>${escapeHtml(d.name)}</dd></div>` : ''}
              ${d.phone   ? `<div class="od-delivery-info__row"><dt>연락처</dt><dd>${escapeHtml(d.phone)}</dd></div>` : ''}
              ${d.zipcode ? `<div class="od-delivery-info__row"><dt>우편번호</dt><dd>${escapeHtml(d.zipcode)}</dd></div>` : ''}
              ${d.address ? `<div class="od-delivery-info__row"><dt>주소</dt><dd>${escapeHtml(d.address)}</dd></div>` : ''}
              ${d.detail  ? `<div class="od-delivery-info__row"><dt>상세주소</dt><dd>${escapeHtml(d.detail)}</dd></div>` : ''}
            </dl>
          </section>
        `;
      }
    }

    /* Carbon footprint card — shown when both farm + buyer zipcode available */
    let carbonHtml = '';
    const farmZip  = data.sellerFarmZipcode;
    const buyerZip = data.buyerDelivery && data.buyerDelivery.zipcode;
    const carbon = (farmZip && buyerZip) ? calcCarbon(farmZip, buyerZip) : null;
    if (carbon) {
      carbonHtml = `
        <section class="od-carbon">
          <div class="od-carbon__head">
            <span class="od-carbon__leaf">🌱</span>
            <span class="od-carbon__title">이 주문의 탄소발자국</span>
          </div>
          <div class="od-carbon__row">
            <span class="od-carbon__label">마트 대비</span>
            <span class="od-carbon__value">${carbon.savedKm.toLocaleString('ko-KR')}km 단축</span>
          </div>
          <div class="od-carbon__row">
            <span class="od-carbon__label">CO2 약</span>
            <span class="od-carbon__value">${carbon.savedCo2g.toLocaleString('ko-KR')}g 절감 (${carbon.savedPct}%)</span>
          </div>
          <p class="od-carbon__caption">산지직송으로 지구를 지켰어요</p>
        </section>
      `;
    }

    /* Action area */
    let actionHtml = '';
    if (isSeller && status === 'payment_complete') {
      if (shippingFeeStatus === 'none') {
        actionHtml = `<p class="od-batch-ship-hint">발송 처리는 미발송 주문 페이지에서 합배송으로 진행해주세요.</p>`;
      } else if (shippingFeeStatus === 'pending') {
        actionHtml = `<p class="od-batch-ship-hint">구매자가 배송비를 결제하면 발송 처리가 가능합니다.</p>`;
      } else if (shippingFeeStatus === 'paid') {
        const hanaroNotice = data.buyerDelivery?.option === 'hanaro'
          ? `<div class="od-hanaro-seller-notice">🏬 <strong>하나로마트 반값택배</strong> — 인근 하나로마트로 발송해주세요.<br><small>${escapeHtml(data.buyerDelivery.hanaroMartName || '')} · ${escapeHtml(data.buyerDelivery.hanaroMartAddr || '')}</small></div>`
          : '';
        actionHtml = `
          <section class="od-ship-form" id="od-ship-form">
            ${hanaroNotice}
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
      }
    } else if (!isSeller && status === 'shipped') {
      actionHtml = `<button class="od-action-btn" id="od-action">구매 확정</button>`;
    } else if (isSeller && status === 'purchase_confirmed') {
      actionHtml = `<button class="od-action-btn" id="od-action">정산 완료 처리</button>`;
    }

    container.innerHTML = card + stepperHtml + feeHtml + shippingFeeHtml + trackingHtml + deliveryHtml + carbonHtml + actionHtml;

    /* Bind shipping fee payment button */
    const payShippingBtn = container.querySelector('#od-pay-shipping-btn');
    if (payShippingBtn) {
      payShippingBtn.addEventListener('click', async () => {
        payShippingBtn.disabled = true;
        try {
          const res = await fetch(`/api/auctions/${encodeURIComponent(data.auctionId)}/pay-shipping-fee`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          });
          if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
          showToast('배송비 결제가 완료되었습니다', { variant: 'success', duration: 1800 });
          await loadDetail();
        } catch (err) {
          payShippingBtn.disabled = false;
          showToast(err.message || '배송비 결제에 실패했습니다', { duration: 2000 });
        }
      });
    }

    /* Bind fee help button */
    const feeHelpBtn = container.querySelector('.od-fee__help');
    if (feeHelpBtn) feeHelpBtn.addEventListener('click', () => showFeeHelp(isSeller));

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

    if (isSeller && status === 'payment_complete' && shippingFeeStatus === 'paid') {
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

/* ── Carbon footprint helper ──────────────────────────────── */
const ZIPCODE_COORDS = {
  '01':[37.60,127.02],'02':[37.56,126.97],'03':[37.57,126.96],
  '04':[37.50,127.03],'05':[37.50,127.12],'06':[37.48,127.03],
  '07':[37.52,126.85],'08':[37.49,126.86],'09':[37.64,127.06],
  '10':[37.73,127.05],'11':[37.66,127.23],'12':[37.68,127.45],
  '13':[37.44,126.70],'14':[37.39,126.64],'15':[37.35,126.92],
  '16':[37.27,127.00],'17':[37.28,127.28],'18':[37.21,127.09],
  '21':[37.48,126.62],'22':[37.52,126.52],'23':[37.55,126.68],
  '24':[37.88,127.73],'25':[37.34,128.01],'26':[37.15,128.48],
  '27':[36.99,127.92],'28':[36.64,127.49],'29':[36.36,127.93],
  '30':[36.35,127.38],'31':[36.81,127.11],'32':[36.47,126.64],
  '33':[36.79,126.45],'34':[36.02,127.14],'35':[36.34,126.59],
  '36':[36.57,128.73],'37':[36.11,128.34],'38':[36.21,129.27],
  '39':[37.11,129.37],'40':[35.87,128.60],'41':[35.93,128.79],
  '42':[36.11,128.73],'43':[36.57,128.21],'44':[35.54,129.31],
  '45':[35.18,129.08],'46':[35.15,128.10],'47':[35.22,128.68],
  '48':[35.13,128.99],'49':[35.34,128.70],
  '54':[35.82,127.15],'55':[35.57,127.17],'56':[35.69,126.85],
  '57':[34.77,126.46],'58':[34.81,127.66],'59':[34.95,127.49],
  '60':[35.16,126.85],'61':[34.74,126.71],'62':[35.02,126.72],
  '63':[33.50,126.53],
};

function calcCarbon(farmZip, buyerZip) {
  const f = ZIPCODE_COORDS[String(farmZip || '').slice(0, 2)];
  const b = ZIPCODE_COORDS[String(buyerZip || '').slice(0, 2)];
  if (!f || !b) return null;
  const R = 6371;
  const dLat = (b[0] - f[0]) * Math.PI / 180;
  const dLon = (b[1] - f[1]) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(f[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180)
            * Math.sin(dLon / 2) ** 2;
  const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  const savedKm = Math.max(0, 800 - dist);
  const savedCo2g = Math.round(savedKm * 0.000166 * 3 * 1000);
  const savedPct = Math.round(savedKm / 800 * 100);
  return { dist, savedKm, savedCo2g, savedPct };
}
