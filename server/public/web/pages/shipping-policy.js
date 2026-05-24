/**
 * Shipping Policy Page — 배송비 정책
 * Route: /app/seller/shipping-policy
 *
 * @module pages/shipping-policy
 */

import { getSecureItem, setSecureItem } from '/app/scripts/native-bridge.js';
import { replace } from '/app/scripts/router.js';
import * as api from '/app/scripts/api.js';
import { showToast } from '/app/components/toast.js';

/* ── CSS injection ─────────────────────────────────────────── */
const _cssId = 'page-css-shipping-policy';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/shipping-policy.css';
  document.head.appendChild(link);
}

const DEFAULTS = {
  sellerShippingFee:    3000,
  freeShippingThreshold: 0,
  shippingLeadDays:     '2일 이내',
  courierName:          'CJ대한통운',
  jejuExtraFee:         3000,
  remoteExtraFee:       5000,
  returnShippingFee:    6000,
  exchangeShippingFee:  6000,
  noDeliveryZones:      '',
};

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'sp-page';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <header class="sp-header">
      <button class="sp-header__back" type="button" aria-label="뒤로 가기">‹</button>
      <h1 class="sp-header__title">배송비 정책</h1>
    </header>

    <div class="sp-scroll">

      <!-- 섹션 1: 기본 배송 설정 -->
      <section class="sp-card">
        <h2 class="sp-card__title">기본 배송 설정</h2>

        <div class="sp-field">
          <label class="sp-field__label" for="sp-shipping-fee">기본 배송비</label>
          <div class="sp-input-group">
            <input class="sp-input" type="number" id="sp-shipping-fee" min="0" step="500" placeholder="3000">
            <span class="sp-input-unit">원</span>
          </div>
        </div>

        <div class="sp-field">
          <label class="sp-field__label" for="sp-free-threshold">무료배송 기준금액</label>
          <div class="sp-input-group">
            <input class="sp-input" type="number" id="sp-free-threshold" min="0" step="1000" placeholder="0">
            <span class="sp-input-unit">원</span>
          </div>
          <p class="sp-field__hint">0원 입력 시 무료배송 없음</p>
        </div>

        <div class="sp-field">
          <label class="sp-field__label" for="sp-lead-days">출고 소요일</label>
          <select class="sp-select" id="sp-lead-days">
            <option value="당일">당일</option>
            <option value="1일 이내">1일 이내</option>
            <option value="2일 이내">2일 이내</option>
            <option value="3일 이내">3일 이내</option>
            <option value="5일 이내">5일 이내</option>
          </select>
        </div>

        <div class="sp-field">
          <label class="sp-field__label" for="sp-courier">택배사 선택</label>
          <select class="sp-select" id="sp-courier">
            <option value="CJ대한통운">CJ대한통운</option>
            <option value="한진택배">한진택배</option>
            <option value="롯데택배">롯데택배</option>
            <option value="우체국택배">우체국택배</option>
            <option value="로젠택배">로젠택배</option>
            <option value="직접입력">직접입력</option>
          </select>
        </div>
      </section>

      <!-- 섹션 2: 지역별 추가 배송비 -->
      <section class="sp-card">
        <h2 class="sp-card__title">지역별 추가 배송비</h2>

        <div class="sp-field">
          <label class="sp-field__label" for="sp-jeju-fee">제주 추가 배송비</label>
          <div class="sp-input-group">
            <input class="sp-input" type="number" id="sp-jeju-fee" min="0" step="500" placeholder="3000">
            <span class="sp-input-unit">원</span>
          </div>
        </div>

        <div class="sp-field">
          <label class="sp-field__label" for="sp-remote-fee">도서산간 추가 배송비</label>
          <div class="sp-input-group">
            <input class="sp-input" type="number" id="sp-remote-fee" min="0" step="500" placeholder="5000">
            <span class="sp-input-unit">원</span>
          </div>
        </div>
      </section>

      <!-- 섹션 3: 반품/교환 -->
      <section class="sp-card">
        <h2 class="sp-card__title">반품/교환</h2>

        <div class="sp-field">
          <label class="sp-field__label" for="sp-return-fee">반품 배송비</label>
          <div class="sp-input-group">
            <input class="sp-input" type="number" id="sp-return-fee" min="0" step="500" placeholder="6000">
            <span class="sp-input-unit">원</span>
          </div>
          <p class="sp-field__hint">왕복 기준</p>
        </div>

        <div class="sp-field">
          <label class="sp-field__label" for="sp-exchange-fee">교환 배송비</label>
          <div class="sp-input-group">
            <input class="sp-input" type="number" id="sp-exchange-fee" min="0" step="500" placeholder="6000">
            <span class="sp-input-unit">원</span>
          </div>
          <p class="sp-field__hint">왕복 기준</p>
        </div>
      </section>

      <!-- 섹션 4: 배송 불가 지역 -->
      <section class="sp-card">
        <h2 class="sp-card__title">배송 불가 지역</h2>

        <div class="sp-field">
          <label class="sp-field__label" for="sp-no-delivery">배송 불가 지역</label>
          <textarea class="sp-textarea" id="sp-no-delivery" rows="3"
            placeholder="배송 불가 지역을 입력하세요. 예: 울릉도, 독도"></textarea>
        </div>
      </section>

      <div class="sp-footer-spacer"></div>
    </div>

    <!-- 저장 버튼 -->
    <div class="sp-footer">
      <button class="sp-save-btn" id="sp-save-btn" type="button">저장하기</button>
    </div>
  `;

  page.querySelector('.sp-header__back').addEventListener('click', () => window.history.back());

  /* ── 초기값 로드 ─────────────────────────────────────────── */
  async function init() {
    let profile = null;
    try {
      profile = await api.getUser(user.id);
    } catch {
      /* 실패해도 기본값 사용 */
    }

    const p = profile || {};

    page.querySelector('#sp-shipping-fee').value    = p.sellerShippingFee    != null ? p.sellerShippingFee    : DEFAULTS.sellerShippingFee;
    page.querySelector('#sp-free-threshold').value  = p.freeShippingThreshold != null ? p.freeShippingThreshold : DEFAULTS.freeShippingThreshold;
    page.querySelector('#sp-jeju-fee').value        = p.jejuExtraFee          != null ? p.jejuExtraFee          : DEFAULTS.jejuExtraFee;
    page.querySelector('#sp-remote-fee').value      = p.remoteExtraFee        != null ? p.remoteExtraFee        : DEFAULTS.remoteExtraFee;
    page.querySelector('#sp-return-fee').value      = p.returnShippingFee     != null ? p.returnShippingFee     : DEFAULTS.returnShippingFee;
    page.querySelector('#sp-exchange-fee').value    = p.exchangeShippingFee   != null ? p.exchangeShippingFee   : DEFAULTS.exchangeShippingFee;
    page.querySelector('#sp-no-delivery').value     = p.noDeliveryZones       != null ? p.noDeliveryZones       : DEFAULTS.noDeliveryZones;

    const leadDaysVal = p.shippingLeadDays != null ? p.shippingLeadDays : DEFAULTS.shippingLeadDays;
    const leadSel = page.querySelector('#sp-lead-days');
    const leadOpt = [...leadSel.options].find(o => o.value === leadDaysVal);
    if (leadOpt) leadSel.value = leadDaysVal;

    const courierVal = p.courierName != null ? p.courierName : DEFAULTS.courierName;
    const courierSel = page.querySelector('#sp-courier');
    const courierOpt = [...courierSel.options].find(o => o.value === courierVal);
    if (courierOpt) courierSel.value = courierVal;
  }

  /* ── 저장 핸들러 ─────────────────────────────────────────── */
  page.querySelector('#sp-save-btn').addEventListener('click', async () => {
    const btn = page.querySelector('#sp-save-btn');

    const sellerShippingFee     = Number(page.querySelector('#sp-shipping-fee').value);
    const freeShippingThreshold = Number(page.querySelector('#sp-free-threshold').value);
    const shippingLeadDays      = page.querySelector('#sp-lead-days').value;
    const courierName           = page.querySelector('#sp-courier').value;
    const jejuExtraFee          = Number(page.querySelector('#sp-jeju-fee').value);
    const remoteExtraFee        = Number(page.querySelector('#sp-remote-fee').value);
    const returnShippingFee     = Number(page.querySelector('#sp-return-fee').value);
    const exchangeShippingFee   = Number(page.querySelector('#sp-exchange-fee').value);
    const noDeliveryZones       = page.querySelector('#sp-no-delivery').value.trim();

    if (!Number.isFinite(sellerShippingFee) || sellerShippingFee < 0) {
      showToast('기본 배송비를 올바르게 입력해주세요'); return;
    }
    if (!Number.isFinite(freeShippingThreshold) || freeShippingThreshold < 0) {
      showToast('무료배송 기준금액을 올바르게 입력해주세요'); return;
    }
    if (!Number.isFinite(jejuExtraFee) || jejuExtraFee < 0) {
      showToast('제주 추가 배송비를 올바르게 입력해주세요'); return;
    }
    if (!Number.isFinite(remoteExtraFee) || remoteExtraFee < 0) {
      showToast('도서산간 추가 배송비를 올바르게 입력해주세요'); return;
    }
    if (!Number.isFinite(returnShippingFee) || returnShippingFee < 0) {
      showToast('반품 배송비를 올바르게 입력해주세요'); return;
    }
    if (!Number.isFinite(exchangeShippingFee) || exchangeShippingFee < 0) {
      showToast('교환 배송비를 올바르게 입력해주세요'); return;
    }

    btn.disabled = true;
    try {
      await api.updateProfile(user.id, {
        sellerShippingFee,
        freeShippingThreshold,
        shippingLeadDays,
        courierName,
        jejuExtraFee,
        remoteExtraFee,
        returnShippingFee,
        exchangeShippingFee,
        noDeliveryZones,
      });
      /* 캐시 갱신 */
      try {
        const cached = await getSecureItem('user');
        if (cached) {
          const u = JSON.parse(cached);
          Object.assign(u, {
            sellerShippingFee, freeShippingThreshold, shippingLeadDays, courierName,
            jejuExtraFee, remoteExtraFee, returnShippingFee, exchangeShippingFee, noDeliveryZones,
          });
          await setSecureItem('user', JSON.stringify(u));
        }
      } catch { /* ignore */ }
      showToast('배송비 정책이 저장되었습니다.', { variant: 'success', duration: 1800 });
    } catch {
      showToast('저장에 실패했습니다');
    } finally {
      btn.disabled = false;
    }
  });

  init();

  return page;
}
