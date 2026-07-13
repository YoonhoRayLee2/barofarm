/**
 * 주문서 + 결제수단 — 낙찰/구매 결제
 * Route: /app/checkout/:auctionId
 *
 * 흐름: 결제하기 → (결제 인증세션 없으면) 결제비밀번호 모달로 세션 발급 →
 *       POST /orders → POST /payments/ready → POST /payments/:id/approve
 * 금액은 서버가 재계산(auctions 재조회)한다 — 프론트는 표시·요청만 하고 금액을 신뢰하지 않는다.
 *
 * API:
 *   GET  /api/auctions/:id
 *   GET  /api/pay/wallet
 *   GET  /api/payment-methods                 (등록 카드/계좌)
 *   GET  /api/payment-auth/sessions/current
 *   POST /api/payment-auth/sessions          { password, purpose }
 *   POST /api/orders                         { auctionId, useMoneyAmount, usePointAmount }
 *   POST /api/payments/ready                 { orderId, method, paymentMethodId?, idempotencyKey }
 *   POST /api/payments/:id/approve           { idempotencyKey }
 *
 * @module pages/checkout
 */

import { request } from '/app/scripts/api.js';
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { escapeHtml } from '/app/scripts/dom.js';
import { formatPrice, formatPriceRaw } from '/app/scripts/format.js';
import { showPaymentPasswordModal } from '/app/components/payment-password-modal.js';

const _cssId = 'page-css-checkout';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/checkout.css';
  document.head.appendChild(link);
}

const uuid = () =>
  (self.crypto && self.crypto.randomUUID)
    ? self.crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** 계좌번호 마스킹 — 끝 4자리만 노출 */
const maskAccount = (num) => {
  const digits = String(num || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return '••••' + digits.slice(-4);
};

export default async function load(params) {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const auctionId = String(params?.auctionId || '');

  const page = document.createElement('div');
  page.className = 'co-page';
  page.dataset.theme = 'light';
  page.innerHTML = `
    <header class="co-header">
      <button class="co-header__back" type="button" aria-label="뒤로 가기">‹</button>
      <h1 class="co-header__title">주문/결제</h1>
    </header>
    <div class="co-scroll" id="co-scroll"><div class="co-loading">불러오는 중...</div></div>
  `;
  page.querySelector('.co-header__back').addEventListener('click', () => window.history.back());
  const scroll = page.querySelector('#co-scroll');

  let auction, wallet;
  try {
    [auction, wallet] = await Promise.all([
      request(`/api/auctions/${encodeURIComponent(auctionId)}`, { method: 'GET' }),
      request('/api/pay/wallet', { method: 'GET' }),
    ]);
  } catch {
    scroll.innerHTML = `<div class="co-loading">주문 정보를 불러올 수 없습니다.</div>`;
    return page;
  }

  // 낙찰자 본인 확인(서버가 최종 검증하지만 UX상 선제 안내)
  if (auction.status !== 'ended' || String(auction.buyerId) !== String(user.id)) {
    scroll.innerHTML = `<div class="co-loading">결제 가능한 낙찰 내역이 아닙니다.</div>`;
    return page;
  }

  // 등록 결제수단(카드/계좌) — 실패해도 지갑 결제는 가능하므로 [] 폴백
  let methods = [];
  try {
    const list = await request('/api/payment-methods', { method: 'GET' });
    methods = (Array.isArray(list) ? list : []).filter((m) => m.type === 'card' || m.type === 'account');
  } catch { methods = []; }

  /* ── 금액 계산 (서버 createOrder와 동일 공식) ─────────────── */
  const finalPrice = Number(auction.finalPrice) || 0;   // 낙찰금액 (current_price)
  const feeAmount = Number(auction.sellerFeeAmt) || 0;   // 수수료 (seller_fee_amt)
  const discountAmount = Number(auction.buyerDiscountAmt) || 0; // 등급할인 (buyer_discount_amt)
  const shippingAmount = Number(auction.shippingFee) || 0;
  const gross = Math.max(0, finalPrice + feeAmount - discountAmount + shippingAmount);

  const moneyBalance = Number(wallet.moneyBalance) || 0;
  const pointBalance =
    (Number(wallet.earnedPointBalance) || 0) +
    (Number(wallet.eventPointBalance) || 0) +
    (Number(wallet.testPointBalance) || 0) +
    (Number(wallet.compensationPointBalance) || 0);

  let usePoint = 0;
  let useMoney = 0;
  // 남은 금액에 사용할 등록 결제수단 id (기본값: 기본 결제수단 → 첫 카드/계좌)
  let selectedPmId = methods.length
    ? (methods.find((m) => m.isDefault) || methods[0]).id
    : null;
  let termsChecked = false;

  scroll.innerHTML = `
    <section class="co-card co-product">
      ${auction.imageUrl
        ? `<img class="co-product__img" src="${escapeHtml(auction.imageUrl)}" alt="" />`
        : `<div class="co-product__img co-product__img--ph">🌾</div>`}
      <div class="co-product__info">
        <span class="co-product__name">${escapeHtml(auction.productName || '상품')}</span>
        <span class="co-product__seller">${escapeHtml(auction.sellerName || '')}</span>
      </div>
    </section>

    <section class="co-card">
      <h2 class="co-card__title">바로팜페이 (머니·포인트)</h2>
      <div class="co-pay-field">
        <div class="co-pay-field__head">
          <span>포인트 사용</span>
          <span class="co-pay-field__bal">보유 ${formatPriceRaw(pointBalance)}P</span>
        </div>
        <div class="co-amount-input">
          <input type="tel" inputmode="numeric" id="use-point" placeholder="0" />
          <button class="co-amount-max" type="button" data-target="point">전액</button>
          <span class="co-amount-input__won">P</span>
        </div>
      </div>
      <div class="co-pay-field">
        <div class="co-pay-field__head">
          <span>머니 사용</span>
          <span class="co-pay-field__bal">보유 ${formatPrice(moneyBalance)}</span>
        </div>
        <div class="co-amount-input">
          <input type="tel" inputmode="numeric" id="use-money" placeholder="0" />
          <button class="co-amount-max" type="button" data-target="money">전액</button>
          <span class="co-amount-input__won">원</span>
        </div>
      </div>
      <div class="co-wallet-after" id="wallet-after"></div>
    </section>

    <section class="co-card">
      <div class="co-card__head-row">
        <h2 class="co-card__title">등록 결제수단 (카드·계좌)</h2>
        <button class="co-pm-manage" type="button" id="co-pm-manage">관리 ›</button>
      </div>
      <div class="co-methods" id="co-methods"></div>
    </section>

    <section class="co-card">
      <h2 class="co-card__title">결제 금액</h2>
      <div class="co-sum" id="co-sum"></div>
    </section>

    <label class="co-terms">
      <input type="checkbox" id="co-terms" />
      <span>주문 내용을 확인했으며, 결제에 동의합니다.</span>
    </label>

    <div class="co-footer-spacer"></div>
  `;

  const footer = document.createElement('div');
  footer.className = 'co-footer';
  footer.innerHTML = `<button class="co-pay-btn" id="co-pay" type="button" disabled>결제하기</button>`;
  page.appendChild(footer);

  const usePointEl = scroll.querySelector('#use-point');
  const useMoneyEl = scroll.querySelector('#use-money');
  const walletAfterEl = scroll.querySelector('#wallet-after');
  const methodsEl = scroll.querySelector('#co-methods');
  const sumEl = scroll.querySelector('#co-sum');
  const termsEl = scroll.querySelector('#co-terms');
  const payBtn = footer.querySelector('#co-pay');
  scroll.querySelector('#co-pm-manage').addEventListener('click', () => navigate('/app/pay-wallet'));

  const parseNum = (v) => Number(String(v).replace(/[^\d]/g, '')) || 0;

  /* ── 렌더: 등록 결제수단 선택 ────────────────────────── */
  function renderMethods() {
    // 지갑(머니·포인트)로 전액 결제되면 외부 결제수단 불필요
    if (finalAmount() === 0) {
      methodsEl.innerHTML = `<p class="co-method-note">머니·포인트로 전액 결제됩니다. 등록 결제수단이 필요하지 않습니다.</p>`;
      return;
    }
    if (!methods.length) {
      methodsEl.innerHTML = `
        <div class="co-pm-guide">
          <p class="co-pm-guide__text">남은 결제금액을 낼 카드·계좌가 없습니다.<br>바로팜페이에 카드/계좌를 등록하거나 머니를 충전해주세요.</p>
          <button class="co-charge-link" type="button" id="co-pm-add">바로팜페이로 이동 ›</button>
        </div>`;
      methodsEl.querySelector('#co-pm-add').addEventListener('click', () => navigate('/app/pay-wallet'));
      return;
    }
    methodsEl.innerHTML = methods.map((pm) => {
      const checked = String(pm.id) === String(selectedPmId) ? 'checked' : '';
      let icon, title, sub;
      if (pm.type === 'account') {
        icon = '🏦';
        title = `${escapeHtml(pm.bankName || '계좌')} ${maskAccount(pm.accountNumber)}`;
        sub = escapeHtml(pm.accountHolder || '');
      } else {
        icon = '💳';
        title = `${escapeHtml(pm.cardBrand || '카드')} ••••${escapeHtml(pm.cardLast4 || '')}`;
        sub = [pm.cardHolder, pm.cardExpiry].filter(Boolean).map(escapeHtml).join(' · ');
      }
      return `
        <label class="co-method">
          <input type="radio" name="pm" value="${escapeHtml(String(pm.id))}" ${checked} />
          <span class="co-method__body">
            <span class="co-method__icon">${icon}</span>
            <span class="co-method__lines"><span>${title}</span>${sub ? `<em class="co-method__sub">${sub}</em>` : ''}</span>
          </span>
        </label>`;
    }).join('');
    methodsEl.querySelectorAll('input[name="pm"]').forEach((r) => r.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      selectedPmId = e.target.value;
      renderSummary();
    }));
  }

  /* ── 계산 ────────────────────────────────────────────── */
  function finalAmount() { return Math.max(0, gross - usePoint - useMoney); }
  function earnEstimate() {
    const fa = finalAmount();
    const rate = fa > 0 ? 0.005 : 0.02;
    return Math.floor(fa * rate);
  }

  function renderSummary() {
    const fa = finalAmount();
    const rows = [
      ['낙찰금액', formatPrice(finalPrice)],
      ['수수료', feeAmount ? formatPrice(feeAmount) : '없음'],
      ['배송비', shippingAmount ? formatPrice(shippingAmount) : '무료'],
      ['등급 할인', discountAmount ? '-' + formatPrice(discountAmount) : '없음', discountAmount ? 'minus' : ''],
      ['포인트 사용', usePoint ? '-' + formatPriceRaw(usePoint) + 'P' : '0P', usePoint ? 'minus' : ''],
      ['머니 사용', useMoney ? '-' + formatPrice(useMoney) : '0원', useMoney ? 'minus' : ''],
    ];
    sumEl.innerHTML = `
      ${rows.map(([k, v, cls]) => `<div class="co-sum__row"><span>${k}</span><span class="${cls || ''}">${v}</span></div>`).join('')}
      <div class="co-sum__total"><span>최종 결제금액</span><strong>${formatPrice(fa)}</strong></div>
      <div class="co-sum__earn">적립 예정 ${formatPriceRaw(earnEstimate())}P</div>
    `;
    payBtn.textContent = `${formatPrice(fa)} 결제하기`;
    // 남은 금액이 있으면 등록 결제수단 선택 필수
    const needsExternal = fa > 0;
    payBtn.disabled = !termsChecked || (needsExternal && !buildMethodPayload());

    // 자체페이 예상 잔액 / 부족 안내
    const shortMoney = useMoney > moneyBalance;
    const shortPoint = usePoint > pointBalance;
    walletAfterEl.innerHTML = `
      <div class="co-after-row"><span>결제 후 머니</span><span>${formatPrice(Math.max(0, moneyBalance - useMoney))}</span></div>
      <div class="co-after-row"><span>결제 후 포인트</span><span>${formatPriceRaw(Math.max(0, pointBalance - usePoint))}P</span></div>
      ${shortMoney || shortPoint ? `<button class="co-charge-link" type="button" id="co-charge">잔액이 부족합니다 · 충전하기 ›</button>` : ''}
    `;
    const chargeLink = walletAfterEl.querySelector('#co-charge');
    if (chargeLink) chargeLink.addEventListener('click', () => navigate('/app/pay-wallet'));
  }

  /* ── 입력 바인딩 ─────────────────────────────────────── */
  function clampAndFormat(el, max) {
    let n = parseNum(el.value);
    if (n > max) n = max;
    el.value = n ? n.toLocaleString('ko-KR') : '';
    return n;
  }
  usePointEl.addEventListener('input', () => {
    usePoint = clampAndFormat(usePointEl, Math.min(pointBalance, gross - useMoney));
    renderMethods(); renderSummary();
  });
  useMoneyEl.addEventListener('input', () => {
    useMoney = clampAndFormat(useMoneyEl, Math.min(moneyBalance, gross - usePoint));
    renderMethods(); renderSummary();
  });
  scroll.querySelectorAll('.co-amount-max').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.target === 'point') {
      usePoint = Math.min(pointBalance, gross - useMoney);
      usePointEl.value = usePoint ? usePoint.toLocaleString('ko-KR') : '';
    } else {
      useMoney = Math.min(moneyBalance, gross - usePoint);
      useMoneyEl.value = useMoney ? useMoney.toLocaleString('ko-KR') : '';
    }
    renderMethods(); renderSummary();
  }));
  termsEl.addEventListener('change', () => { termsChecked = termsEl.checked; renderSummary(); });

  /* ── 결제 실행 ───────────────────────────────────────── */
  let pendingOrder = null;
  let pendingPayment = null;
  let approveKey = null;

  function buildMethodPayload() {
    if (finalAmount() === 0) return { method: 'MONEY' };
    const pm = methods.find((m) => String(m.id) === String(selectedPmId));
    if (!pm) return null;
    return { method: pm.type === 'account' ? 'ACCOUNT' : 'CARD', paymentMethodId: pm.id };
  }

  async function ensurePaymentSession(purpose) {
    if (purpose === 'PAYMENT') {
      try {
        await request('/api/payment-auth/sessions/current', { method: 'GET' });
        return true; // 유효 세션 있음
      } catch (err) {
        if (!(err.code && err.code.startsWith('PAYMENT_AUTH'))) throw err;
      }
    }
    const result = await showPaymentPasswordModal({
      title: purpose === 'HIGH_VALUE_PAYMENT' ? '고액 결제 재인증' : '결제 인증',
      subtitle: '결제 비밀번호를 입력해주세요',
      onSubmit: (pin) => request('/api/payment-auth/sessions', {
        method: 'POST',
        body: JSON.stringify({ password: pin, purpose }),
      }),
    });
    return !!result;
  }

  async function approveFlow(reauthed) {
    try {
      await request(`/api/payments/${pendingPayment.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: approveKey }),
      });
      showSuccess();
    } catch (err) {
      const code = err.code || err.message;
      if (code === 'HIGH_VALUE_REAUTH_REQUIRED' && !reauthed) {
        const ok = await ensurePaymentSession('HIGH_VALUE_PAYMENT');
        if (ok) return approveFlow(true);
        throw new UserAbort();
      }
      if ((code === 'PAYMENT_AUTH_SESSION_EXPIRED' || code === 'PAYMENT_AUTH_SESSION_REVOKED') && !reauthed) {
        const ok = await ensurePaymentSession('PAYMENT');
        if (ok) return approveFlow(true);
        throw new UserAbort();
      }
      // Mock 결과 안내(실패/타임아웃)
      const map = {
        PAYMENT_APPROVAL_FAILED: '결제가 거절되었습니다. 다른 결제수단으로 시도해주세요.',
        CARD_LIMIT_EXCEEDED: '카드 한도를 초과했습니다.',
        PAYMENT_TIMEOUT: '결제 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.',
        INSUFFICIENT_WALLET_BALANCE: '자체페이 잔액이 부족합니다.',
      };
      showToast(map[code] || (err.body && err.body.message) || '결제에 실패했습니다.', { variant: 'error', duration: 2600 });
      // 승인 실패 시 지갑은 롤백됨 — 같은 주문/결제로 재시도 가능하도록 pendingPayment 유지
    }
  }

  class UserAbort {}

  async function doCheckout() {
    if (!termsChecked) { showToast('결제에 동의해주세요', { variant: 'error' }); return; }
    if (finalAmount() > 0 && !buildMethodPayload()) {
      showToast('남은 금액을 결제할 카드·계좌를 선택해주세요', { variant: 'error' });
      return;
    }
    payBtn.disabled = true;
    payBtn.textContent = '결제 중...';
    try {
      if (!pendingOrder) {
        pendingOrder = await request('/api/orders', {
          method: 'POST',
          body: JSON.stringify({ auctionId, useMoneyAmount: useMoney, usePointAmount: usePoint }),
        });
      }
      // 결제 인증세션 확보(purpose=PAYMENT)
      if (!(await ensurePaymentSession('PAYMENT'))) throw new UserAbort();

      if (!pendingPayment) {
        const md = buildMethodPayload();
        pendingPayment = await request('/api/payments/ready', {
          method: 'POST',
          body: JSON.stringify({ orderId: pendingOrder.id, method: md.method, paymentMethodId: md.paymentMethodId, idempotencyKey: uuid() }),
        });
        approveKey = uuid();
      }
      await approveFlow(false);
    } catch (err) {
      if (err instanceof UserAbort) {
        showToast('결제를 취소했습니다', { variant: 'info', duration: 1600 });
      } else {
        const code = err.code || err.message;
        const map = {
          DUPLICATE_ORDER: '이미 진행 중인 주문이 있습니다.',
          NOT_AUCTION_WINNER: '낙찰자 본인만 결제할 수 있습니다.',
          ORDER_PAYMENT_EXPIRED: '결제 기한이 지난 주문입니다.',
          INSUFFICIENT_WALLET_BALANCE: '자체페이 잔액이 부족합니다.',
        };
        showToast(map[code] || (err.body && err.body.message) || '주문 처리에 실패했습니다.', { variant: 'error', duration: 2600 });
        // 주문 생성 단계 실패면 주문 참조를 비워 다음 시도에서 재생성하지 않도록(중복 방지) — 단 DUPLICATE는 유지
        if (code !== 'DUPLICATE_ORDER') pendingOrder = null;
      }
    } finally {
      if (!page.querySelector('.co-success')) {
        payBtn.disabled = !termsChecked;
        renderSummary();
      }
    }
  }

  function showSuccess() {
    footer.remove();
    scroll.innerHTML = `
      <div class="co-success">
        <div class="co-success__icon">✅</div>
        <h2 class="co-success__title">결제가 완료되었습니다</h2>
        <p class="co-success__desc">${escapeHtml(auction.productName || '')}<br>${formatPrice(pendingOrder.paymentAmount ?? finalAmount())} 결제 완료</p>
        <div class="co-success__actions">
          <button class="co-pay-btn" id="co-go-orders" type="button">주문 내역 보기</button>
          <button class="co-link-btn" id="co-go-home" type="button">홈으로</button>
        </div>
      </div>
    `;
    scroll.querySelector('#co-go-orders').addEventListener('click', () => navigate('/app/profile/orders'));
    scroll.querySelector('#co-go-home').addEventListener('click', () => navigate('/app/home'));
  }

  payBtn.addEventListener('click', doCheckout);

  renderMethods();
  renderSummary();
  return page;
}
