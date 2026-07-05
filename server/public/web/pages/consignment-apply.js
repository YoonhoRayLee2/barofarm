/**
 * Consignment Apply Page — 딜러 위탁 신청하기
 * Route: /app/consignment/apply
 */
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';

const _cssId = 'page-css-consignment-apply';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId; link.rel = 'stylesheet';
  link.href = '/app/pages/consignment-apply.css';
  document.head.appendChild(link);
}

const CATEGORIES = ['과일', '채소', '수산', '축산', '곡물', '기타'];

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'ca-page';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <header class="ca-header">
      <button class="ca-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="ca-header__title">딜러 위탁 신청하기</h1>
      <button class="ca-header__help" aria-label="도움말">?</button>
    </header>
    <form class="ca-form" id="ca-form" autocomplete="off">

      <section class="ca-section">
        <h2 class="ca-section__title">위탁 희망 방식 <span class="ca-required">*</span></h2>
        <label class="ca-radio">
          <input type="radio" name="consignmentType" value="full" required>
          <span class="ca-radio__circle"></span>
          <span class="ca-radio__label">위탁 판매<span class="ca-radio__sub">(배송까지 위탁)</span></span>
        </label>
        <label class="ca-radio">
          <input type="radio" name="consignmentType" value="live_only">
          <span class="ca-radio__circle"></span>
          <span class="ca-radio__label">대리 진행<span class="ca-radio__sub">(방송 진행만 대행)</span></span>
        </label>
        <div class="ca-info">ⓘ 위탁 판매: 물건 발송 후 진행자가 판매·배송·CS까지 전담<br>대리 진행: 라이브 진행만, 배송·CS는 직접 처리</div>
      </section>

      <section class="ca-section">
        <h2 class="ca-section__title">위탁 상품의 카테고리 <span class="ca-required">*</span></h2>
        <div class="ca-radio-grid">
          ${CATEGORIES.map(c => `
            <label class="ca-radio">
              <input type="radio" name="category" value="${c}" required>
              <span class="ca-radio__circle"></span>
              <span class="ca-radio__label">${c}</span>
            </label>
          `).join('')}
        </div>
      </section>

      <section class="ca-section ca-row-section">
        <div class="ca-field">
          <label class="ca-label">위탁 물량 <span class="ca-required">*</span></label>
          <input class="ca-input" type="number" name="quantity" placeholder="예: 100 (최소 50개)" min="1" required>
        </div>
        <div class="ca-field">
          <label class="ca-label">예상 총 금액 <span class="ca-required">*</span></label>
          <input class="ca-input" type="number" name="expectedPrice" placeholder="최소 50만 원" min="1" required>
        </div>
      </section>

      <section class="ca-section">
        <h2 class="ca-section__title">상세 내용(대표 상품 포함 구성) <span class="ca-required">*</span></h2>
        <textarea class="ca-textarea" name="description" rows="4" placeholder="예: 제주 감귤 5kg 50박스 / 친환경 청양고추 1kg" required></textarea>
      </section>

      <section class="ca-section">
        <h2 class="ca-section__title">상품 사진(최대 5장) <span class="ca-required">*</span></h2>
        <div class="ca-photo-row" id="ca-photo-row">
          ${[0,1,2,3,4].map(i => `
            <label class="ca-photo-slot" data-index="${i}">
              <input type="file" accept="image/*" class="ca-photo-input" style="display:none">
              <div class="ca-photo-slot__inner" id="ca-photo-${i}">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span>${i === 0 ? '대표 이미지' : '추가 이미지'}</span>
              </div>
            </label>
          `).join('')}
        </div>
        <div class="ca-info">ⓘ 대표 상품 또는 수량이 보여지게 촬영해 주세요.</div>
      </section>

      <section class="ca-section">
        <h2 class="ca-section__title">최소 시작가 기준</h2>
        <label class="ca-radio">
          <input type="radio" name="minPriceType" value="none" checked>
          <span class="ca-radio__circle"></span>
          <span class="ca-radio__label">최소 시작가 없음</span>
        </label>
        <label class="ca-radio">
          <input type="radio" name="minPriceType" value="some">
          <span class="ca-radio__circle"></span>
          <span class="ca-radio__label">특정 물건에 최소 시작가 있음</span>
        </label>
      </section>

      <section class="ca-section">
        <h2 class="ca-section__title">희망 수수료율 <span class="ca-required">*</span></h2>
        <input class="ca-input" type="number" name="commissionRate" placeholder="숫자만 입력 (예: 10)" min="0" max="100" step="0.1" required>
        <div class="ca-info">ⓘ 진행자에게 지급할 수수료를 입력합니다(와이스 수수료 5.8% 별도, 위탁자 부담).</div>
        <label class="ca-check">
          <input type="checkbox" name="commissionNegotiable">
          <span class="ca-check__box"></span>
          <span>수수료율은 진행자와 협의 가능합니다</span>
        </label>
        <label class="ca-check" id="ca-agree-wrap">
          <input type="checkbox" name="agree" required>
          <span class="ca-check__box"></span>
          <span><strong>(필수)</strong> 수수료 안내를 확인했으며, 진행자 매칭 후 최종 수수료율에 동의할 예정입니다.</span>
        </label>
      </section>

      <div class="ca-submit-wrap">
        <button type="submit" class="ca-submit" id="ca-submit">위탁 신청서 제출하기</button>
      </div>
    </form>
  `;

  page.querySelector('.ca-header__back').addEventListener('click', () => window.history.back());
  page.querySelector('.ca-header__help').addEventListener('click', () =>
    showToast('위탁 신청에 대한 문의는 고객센터를 이용해 주세요', { duration: 2400 }));

  // Photo slot previews
  page.querySelectorAll('.ca-photo-slot').forEach((slot) => {
    const idx = Number(slot.dataset.index);
    const input = slot.querySelector('.ca-photo-input');
    const inner = slot.querySelector(`#ca-photo-${idx}`);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      inner.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-sm);">`;
    });
  });

  // Form submit
  const formEl = page.querySelector('#ca-form');
  formEl.appendChild(createTabSpacer());
  page.appendChild(createBottomTabBar());
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = page.querySelector('#ca-submit');
    submitBtn.disabled = true;

    const fd = new FormData();
    fd.append('buyerId', String(user.id));
    fd.append('consignmentType', formEl.consignmentType.value);
    fd.append('category', formEl.category.value);
    fd.append('quantity', formEl.quantity.value);
    fd.append('expectedPrice', formEl.expectedPrice.value);
    fd.append('description', formEl.description.value);
    fd.append('minPriceType', formEl.minPriceType.value);
    fd.append('commissionRate', formEl.commissionRate.value);
    fd.append('commissionNegotiable', String(formEl.commissionNegotiable.checked));

    // Attach image files
    page.querySelectorAll('.ca-photo-input').forEach((input) => {
      if (input.files && input.files[0]) fd.append('images', input.files[0]);
    });

    try {
      const res = await fetch('/api/consignments', { method: 'POST', body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      showToast('위탁 신청이 완료되었습니다!', { variant: 'success', duration: 2000 });
      setTimeout(() => window.history.back(), 1500);
    } catch (err) {
      submitBtn.disabled = false;
      showToast(err.message || '신청에 실패했습니다', { variant: 'error', duration: 2400 });
    }
  });

  return page;
}
