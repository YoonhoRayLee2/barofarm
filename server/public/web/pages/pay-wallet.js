/**
 * 바로팜페이 통합 허브 — 머니·포인트 잔액 / 충전 / 자동충전 / 등록 결제수단 / 거래내역
 * Route: /app/pay-wallet
 *
 * API:
 *   GET  /api/pay/wallet
 *   POST /api/pay/wallet/charge         { amount, idempotencyKey }
 *   PUT  /api/pay/wallet/auto-charge    { autoChargeEnabled, autoChargeThreshold, autoChargeAmount }
 *   GET  /api/pay/wallet/transactions   ?assetType=&limit=&offset=
 *   GET  /api/payment-methods                 (type: card | account)
 *   POST /api/payment-methods                 카드/계좌 등록
 *   DELETE /api/payment-methods/:id
 *   PATCH  /api/payment-methods/:id/set-default
 *
 * @module pages/pay-wallet
 */

import { request } from '/app/scripts/api.js';
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { showConfirmDialog } from '/app/components/confirm-dialog.js';
import { formatPrice, formatPriceRaw, formatDate } from '/app/scripts/format.js';
import { escapeHtml } from '/app/scripts/dom.js';

const _cssId = 'page-css-pay-wallet';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/pay-wallet.css';
  document.head.appendChild(link);
}

const uuid = () =>
  (self.crypto && self.crypto.randomUUID)
    ? self.crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const CHARGE_PRESETS = [10000, 30000, 50000, 100000];

const CARD_BRANDS = ['신한', '국민', '삼성', '현대', '롯데', 'BC', '하나', '농협'];
const BANKS = ['농협', '국민', '신한', '우리', '하나', '카카오뱅크', '토스뱅크', 'IBK기업'];

/** 계좌번호 마스킹 — 끝 4자리만 노출 */
const maskAccount = (num) => {
  const digits = String(num || '').replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return '••••' + digits.slice(-4);
};

const TX_TABS = [
  { key: '', label: '전체' },
  { key: 'MONEY', label: '머니' },
  { key: 'EARNED_POINT', label: '적립' },
  { key: 'EVENT_POINT', label: '이벤트' },
];

const TX_TYPE_LABEL = {
  CHARGE: '충전',
  PAYMENT: '결제',
  REFUND: '환불',
  POINT_EARN: '포인트 적립',
  POINT_USE: '포인트 사용',
  POINT_RESTORE: '포인트 복원',
  POINT_REVOKE: '적립 취소',
  ADMIN_POINT_GRANT: '포인트 지급',
  ADMIN_POINT_REVOKE: '포인트 회수',
  ADMIN_MONEY_GRANT: '머니 지급',
  ADMIN_MONEY_REVOKE: '머니 회수',
  BALANCE_CORRECTION: '잔액 조정',
};

const ASSET_LABEL = {
  MONEY: '머니',
  EARNED_POINT: '적립포인트',
  EVENT_POINT: '이벤트포인트',
  TEST_POINT: '테스트포인트',
  COMPENSATION_POINT: '보상포인트',
};

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'wallet-page';
  page.dataset.theme = 'light';
  page.innerHTML = `
    <header class="wallet-header">
      <button class="wallet-header__back" type="button" aria-label="뒤로 가기">‹</button>
      <h1 class="wallet-header__title">바로팜페이</h1>
    </header>
    <div class="wallet-scroll">
      <section class="wallet-balance" id="wallet-balance">
        <div class="wallet-balance__loading">불러오는 중...</div>
      </section>

      <section class="wallet-card" id="wallet-charge">
        <h2 class="wallet-card__title">충전하기</h2>
        <div class="wallet-chips" id="charge-chips">
          ${CHARGE_PRESETS.map((a) => `<button class="wallet-chip" type="button" data-amt="${a}">+${formatPriceRaw(a)}</button>`).join('')}
        </div>
        <label class="wallet-field">
          <span class="wallet-field__label">충전 금액</span>
          <div class="wallet-amount-input">
            <input type="tel" inputmode="numeric" id="charge-amount" placeholder="0" />
            <span class="wallet-amount-input__won">원</span>
          </div>
        </label>
        <button class="wallet-primary" id="charge-submit" type="button" disabled>금액을 입력해주세요</button>
      </section>

      <section class="wallet-card" id="wallet-auto">
        <div class="wallet-card__row">
          <h2 class="wallet-card__title">자동충전</h2>
          <label class="wallet-switch">
            <input type="checkbox" id="auto-enabled" />
            <span class="wallet-switch__track"><span class="wallet-switch__thumb"></span></span>
          </label>
        </div>
        <p class="wallet-card__desc">잔액이 기준 금액 아래로 내려가면 자동으로 충전합니다.</p>
        <div class="wallet-auto-fields" id="auto-fields">
          <label class="wallet-field">
            <span class="wallet-field__label">충전 기준(이하)</span>
            <div class="wallet-amount-input">
              <input type="tel" inputmode="numeric" id="auto-threshold" placeholder="5,000" />
              <span class="wallet-amount-input__won">원</span>
            </div>
          </label>
          <label class="wallet-field">
            <span class="wallet-field__label">충전 금액</span>
            <div class="wallet-amount-input">
              <input type="tel" inputmode="numeric" id="auto-amount" placeholder="20,000" />
              <span class="wallet-amount-input__won">원</span>
            </div>
          </label>
        </div>
        <button class="wallet-secondary" id="auto-save" type="button">자동충전 설정 저장</button>
      </section>

      <section class="wallet-card" id="wallet-pm">
        <div class="wallet-card__row">
          <h2 class="wallet-card__title">등록 결제수단</h2>
          <button class="wallet-pm-add" id="pm-add" type="button">+ 추가</button>
        </div>
        <p class="wallet-card__desc">등록한 카드·계좌로 바로팜페이 결제 시 바로 사용할 수 있습니다.</p>
        <div class="wallet-pm-list" id="pm-list">
          <div class="wallet-pm-empty">불러오는 중...</div>
        </div>
      </section>

      <section class="wallet-card wallet-card--flush">
        <div class="wallet-card__pad">
          <h2 class="wallet-card__title">거래내역</h2>
        </div>
        <div class="wallet-tx-tabs" id="tx-tabs">
          ${TX_TABS.map((t, i) => `<button class="wallet-tx-tab${i === 0 ? ' is-active' : ''}" type="button" data-key="${t.key}">${t.label}</button>`).join('')}
        </div>
        <div class="wallet-tx-list" id="tx-list"></div>
        <div class="wallet-tx-more" id="tx-more" hidden>
          <button class="wallet-secondary" type="button" id="tx-more-btn">더 보기</button>
        </div>
      </section>
    </div>
  `;

  page.querySelector('.wallet-header__back').addEventListener('click', () => window.history.back());

  const balanceEl = page.querySelector('#wallet-balance');
  const chargeAmountEl = page.querySelector('#charge-amount');
  const chargeSubmitEl = page.querySelector('#charge-submit');
  const autoEnabledEl = page.querySelector('#auto-enabled');
  const autoThresholdEl = page.querySelector('#auto-threshold');
  const autoAmountEl = page.querySelector('#auto-amount');
  const autoFieldsEl = page.querySelector('#auto-fields');
  const autoSaveEl = page.querySelector('#auto-save');
  const txListEl = page.querySelector('#tx-list');
  const txMoreEl = page.querySelector('#tx-more');
  const txMoreBtn = page.querySelector('#tx-more-btn');
  const pmListEl = page.querySelector('#pm-list');
  const pmAddBtn = page.querySelector('#pm-add');

  /* ── Balance ─────────────────────────────────────────── */
  function renderBalance(w) {
    const points = [
      { label: '일반포인트', value: w.earnedPointBalance, test: false, hideIfZero: false },
      { label: '이벤트포인트', value: w.eventPointBalance, test: false, hideIfZero: false },
      { label: '테스트포인트', value: w.testPointBalance, test: true, hideIfZero: true },
      { label: '보상포인트', value: w.compensationPointBalance, test: false, hideIfZero: true },
    ].filter((p) => (p.hideIfZero ? Number(p.value) > 0 : true));

    balanceEl.innerHTML = `
      <span class="wallet-balance__label">보유 머니</span>
      <strong class="wallet-balance__money">${formatPrice(w.moneyBalance)}</strong>
      <div class="wallet-balance__points">
        ${points.map((p) => `
          <div class="wallet-point">
            <span class="wallet-point__label">${escapeHtml(p.label)}${p.test ? '<span class="wallet-point__badge">테스트</span>' : ''}</span>
            <span class="wallet-point__value">${formatPriceRaw(p.value || 0)}P</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  async function loadWallet() {
    try {
      const w = await request('/api/pay/wallet', { method: 'GET' });
      renderBalance(w);
      // 자동충전 상태 반영
      autoEnabledEl.checked = !!w.autoChargeEnabled;
      if (w.autoChargeThreshold) autoThresholdEl.value = formatPriceRaw(w.autoChargeThreshold);
      if (w.autoChargeAmount) autoAmountEl.value = formatPriceRaw(w.autoChargeAmount);
      syncAutoFields();
    } catch {
      balanceEl.innerHTML = `<div class="wallet-balance__loading">잔액을 불러올 수 없습니다.</div>`;
    }
  }

  /* ── Charge ──────────────────────────────────────────── */
  const parseNum = (v) => Number(String(v).replace(/[^\d]/g, '')) || 0;
  const formatInput = (el) => { const n = parseNum(el.value); el.value = n ? n.toLocaleString('ko-KR') : ''; };

  function syncChargeBtn() {
    const amt = parseNum(chargeAmountEl.value);
    chargeSubmitEl.disabled = amt < 1000;
    chargeSubmitEl.textContent = amt >= 1000 ? `${formatPrice(amt)} 충전하기` : '1,000원 이상 입력해주세요';
  }
  chargeAmountEl.addEventListener('input', () => { formatInput(chargeAmountEl); syncChargeBtn(); });
  page.querySelectorAll('#charge-chips .wallet-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cur = parseNum(chargeAmountEl.value);
      chargeAmountEl.value = (cur + Number(btn.dataset.amt)).toLocaleString('ko-KR');
      syncChargeBtn();
    });
  });

  chargeSubmitEl.addEventListener('click', async () => {
    const amount = parseNum(chargeAmountEl.value);
    if (amount < 1000) return;
    chargeSubmitEl.disabled = true;
    chargeSubmitEl.textContent = '충전 중...';
    try {
      await request('/api/pay/wallet/charge', {
        method: 'POST',
        body: JSON.stringify({ amount, idempotencyKey: uuid() }),
      });
      showToast(`${formatPrice(amount)} 충전 완료`, { variant: 'success', duration: 1800 });
      chargeAmountEl.value = '';
      syncChargeBtn();
      await loadWallet();
      resetTx();
    } catch (err) {
      const code = err.code || err.message;
      const msg = code === 'PAYMENT_TIMEOUT'
        ? '결제 시간이 초과되었습니다. 다시 시도해주세요.'
        : (err.body && err.body.message) || '충전에 실패했습니다.';
      showToast(msg, { variant: 'error', duration: 2400 });
      syncChargeBtn();
    }
  });

  /* ── Auto-charge ─────────────────────────────────────── */
  function syncAutoFields() {
    autoFieldsEl.style.opacity = autoEnabledEl.checked ? '1' : '0.45';
    autoThresholdEl.disabled = !autoEnabledEl.checked;
    autoAmountEl.disabled = !autoEnabledEl.checked;
  }
  autoEnabledEl.addEventListener('change', syncAutoFields);
  autoThresholdEl.addEventListener('input', () => formatInput(autoThresholdEl));
  autoAmountEl.addEventListener('input', () => formatInput(autoAmountEl));

  autoSaveEl.addEventListener('click', async () => {
    const enabled = autoEnabledEl.checked;
    const threshold = parseNum(autoThresholdEl.value);
    const amount = parseNum(autoAmountEl.value);
    if (enabled && (threshold < 1 || amount < 1000)) {
      showToast('충전 기준과 금액을 입력해주세요', { variant: 'error' });
      return;
    }
    autoSaveEl.disabled = true;
    try {
      await request('/api/pay/wallet/auto-charge', {
        method: 'PUT',
        body: JSON.stringify({ autoChargeEnabled: enabled, autoChargeThreshold: threshold, autoChargeAmount: amount }),
      });
      showToast('자동충전 설정이 저장되었습니다', { variant: 'success', duration: 1600 });
    } catch {
      showToast('설정 저장에 실패했습니다', { variant: 'error' });
    } finally {
      autoSaveEl.disabled = false;
    }
  });

  /* ── Transactions ────────────────────────────────────── */
  let txAsset = '';
  let txOffset = 0;
  const TX_LIMIT = 20;

  function renderTxItem(tx) {
    const positive = Number(tx.amount) > 0;
    const typeLabel = TX_TYPE_LABEL[tx.transactionType] || tx.transactionType;
    const assetLabel = ASSET_LABEL[tx.assetType] || tx.assetType;
    return `
      <div class="wallet-tx">
        <div class="wallet-tx__main">
          <span class="wallet-tx__type">${escapeHtml(typeLabel)}</span>
          <span class="wallet-tx__meta">${escapeHtml(assetLabel)} · ${escapeHtml(formatDate(tx.createdAt))}</span>
        </div>
        <div class="wallet-tx__amt-wrap">
          <span class="wallet-tx__amt ${positive ? 'is-plus' : 'is-minus'}">${positive ? '+' : ''}${formatPriceRaw(tx.amount)}</span>
          <span class="wallet-tx__bal">잔액 ${formatPriceRaw(tx.balanceAfter)}</span>
        </div>
      </div>
    `;
  }

  async function loadTx(append) {
    if (!append) { txListEl.innerHTML = '<div class="wallet-tx-empty">불러오는 중...</div>'; txOffset = 0; }
    try {
      const qs = new URLSearchParams({ limit: String(TX_LIMIT), offset: String(txOffset) });
      if (txAsset) qs.set('assetType', txAsset);
      const data = await request(`/api/pay/wallet/transactions?${qs.toString()}`, { method: 'GET' });
      const items = data.items || [];
      if (!append) txListEl.innerHTML = '';
      if (txOffset === 0 && items.length === 0) {
        txListEl.innerHTML = '<div class="wallet-tx-empty">거래내역이 없습니다.</div>';
      } else {
        txListEl.insertAdjacentHTML('beforeend', items.map(renderTxItem).join(''));
      }
      txOffset += items.length;
      txMoreEl.hidden = txOffset >= (data.total || 0);
    } catch {
      if (!append) txListEl.innerHTML = '<div class="wallet-tx-empty">거래내역을 불러올 수 없습니다.</div>';
    }
  }
  function resetTx() { loadTx(false); }

  page.querySelectorAll('#tx-tabs .wallet-tx-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      page.querySelectorAll('#tx-tabs .wallet-tx-tab').forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      txAsset = tab.dataset.key;
      loadTx(false);
    });
  });
  txMoreBtn.addEventListener('click', () => loadTx(true));

  /* ── Payment methods (등록 카드/계좌) ─────────────────── */
  async function loadMethods() {
    pmListEl.innerHTML = '<div class="wallet-pm-empty">불러오는 중...</div>';
    try {
      const list = await request('/api/payment-methods', { method: 'GET' });
      renderMethods(Array.isArray(list) ? list : []);
    } catch {
      pmListEl.innerHTML = '<div class="wallet-pm-empty">결제수단을 불러올 수 없습니다.</div>';
    }
  }

  function renderMethods(list) {
    if (!list.length) {
      pmListEl.innerHTML = '<div class="wallet-pm-empty">등록된 카드·계좌가 없습니다.<br>[+ 추가]로 등록해보세요.</div>';
      return;
    }
    pmListEl.innerHTML = '';
    list.forEach((pm) => pmListEl.appendChild(renderMethodRow(pm)));
  }

  function renderMethodRow(pm) {
    const row = document.createElement('div');
    row.className = 'wallet-pm' + (pm.isDefault ? ' is-default' : '');
    let icon = '💳';
    let title = '카드';
    let sub = '';
    if (pm.type === 'account') {
      icon = '🏦';
      title = `${escapeHtml(pm.bankName || '계좌')} ${maskAccount(pm.accountNumber)}`;
      sub = escapeHtml(pm.accountHolder || '');
    } else {
      title = `${escapeHtml(pm.cardBrand || '카드')} ••••${escapeHtml(pm.cardLast4 || '')}`;
      sub = [pm.cardHolder, pm.cardExpiry].filter(Boolean).map(escapeHtml).join(' · ');
    }
    row.innerHTML = `
      <span class="wallet-pm__icon">${icon}</span>
      <div class="wallet-pm__info">
        <span class="wallet-pm__title">${title}${pm.isDefault ? '<span class="wallet-pm__badge">기본</span>' : ''}</span>
        ${sub ? `<span class="wallet-pm__sub">${sub}</span>` : ''}
      </div>
      <div class="wallet-pm__actions">
        ${!pm.isDefault ? '<button class="wallet-pm__act" data-act="default" type="button">기본</button>' : ''}
        <button class="wallet-pm__act wallet-pm__act--danger" data-act="delete" type="button">삭제</button>
      </div>
    `;
    row.querySelector('[data-act="delete"]')?.addEventListener('click', () => onDeleteMethod(pm));
    row.querySelector('[data-act="default"]')?.addEventListener('click', () => onSetDefaultMethod(pm));
    return row;
  }

  async function onDeleteMethod(pm) {
    const ok = await showConfirmDialog({
      title: '결제수단 삭제',
      message: `'${pm.label || (pm.type === 'account' ? '계좌' : '카드')}' 결제수단을 삭제할까요?`,
      confirmLabel: '삭제', cancelLabel: '취소', danger: true,
    });
    if (!ok) return;
    try {
      await request(`/api/payment-methods/${pm.id}`, { method: 'DELETE' });
      showToast('결제수단이 삭제되었습니다', { variant: 'success', duration: 1600 });
      loadMethods();
    } catch {
      showToast('삭제에 실패했습니다', { variant: 'error', duration: 2000 });
    }
  }

  async function onSetDefaultMethod(pm) {
    try {
      await request(`/api/payment-methods/${pm.id}/set-default`, { method: 'PATCH' });
      showToast('기본 결제수단으로 설정되었습니다', { variant: 'success', duration: 1600 });
      loadMethods();
    } catch {
      showToast('변경에 실패했습니다', { variant: 'error', duration: 2000 });
    }
  }

  /* 결제수단 추가 — 종류 선택 → 종류별 폼 */
  function openPmTypePicker() {
    const overlay = buildSheet('결제수단 추가', `
      <button class="wallet-pm-option" data-type="card" type="button">
        <span class="wallet-pm-option__icon">💳</span>
        <span class="wallet-pm-option__text">
          <span class="wallet-pm-option__name">카드</span>
          <span class="wallet-pm-option__desc">신용·체크카드 등록</span>
        </span>
      </button>
      <button class="wallet-pm-option" data-type="account" type="button">
        <span class="wallet-pm-option__icon">🏦</span>
        <span class="wallet-pm-option__text">
          <span class="wallet-pm-option__name">계좌</span>
          <span class="wallet-pm-option__desc">은행 계좌 등록</span>
        </span>
      </button>
    `);
    overlay.node.querySelectorAll('.wallet-pm-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        overlay.close();
        setTimeout(() => openPmForm(type), 240);
      });
    });
  }

  function openPmForm(type) {
    let fields;
    if (type === 'card') {
      fields = `
        <label class="wallet-field">
          <span class="wallet-field__label">카드사</span>
          <select class="wallet-pm-input" name="cardBrand">${CARD_BRANDS.map((b) => `<option value="${b}">${b}카드</option>`).join('')}</select>
        </label>
        <label class="wallet-field">
          <span class="wallet-field__label">카드번호</span>
          <input class="wallet-pm-input" type="tel" inputmode="numeric" name="cardNumber" maxlength="19" placeholder="0000 0000 0000 0000" />
        </label>
        <div class="wallet-auto-fields">
          <label class="wallet-field">
            <span class="wallet-field__label">유효기간</span>
            <input class="wallet-pm-input" type="tel" inputmode="numeric" name="cardExpiry" maxlength="5" placeholder="MM/YY" />
          </label>
          <label class="wallet-field">
            <span class="wallet-field__label">소유주명</span>
            <input class="wallet-pm-input" type="text" name="cardHolder" maxlength="20" placeholder="홍길동" />
          </label>
        </div>
        <p class="wallet-pm-note">카드번호 전체는 저장되지 않으며 끝 4자리만 보관됩니다.</p>`;
    } else {
      fields = `
        <label class="wallet-field">
          <span class="wallet-field__label">은행</span>
          <select class="wallet-pm-input" name="bankName">${BANKS.map((b) => `<option value="${b}">${b}</option>`).join('')}</select>
        </label>
        <label class="wallet-field">
          <span class="wallet-field__label">계좌번호</span>
          <input class="wallet-pm-input" type="tel" inputmode="numeric" name="accountNumber" maxlength="20" placeholder="- 없이 숫자만" />
        </label>
        <label class="wallet-field">
          <span class="wallet-field__label">예금주명</span>
          <input class="wallet-pm-input" type="text" name="accountHolder" maxlength="20" placeholder="홍길동" />
        </label>
        <p class="wallet-pm-note">계좌번호 전체는 저장되지 않으며 끝 4자리만 보관됩니다.</p>`;
    }

    const overlay = buildSheet(type === 'card' ? '💳 카드 등록' : '🏦 계좌 등록', fields, true);
    const node = overlay.node;

    const numInput = node.querySelector('[name="cardNumber"]');
    if (numInput) numInput.addEventListener('input', () => {
      const d = numInput.value.replace(/\D/g, '').slice(0, 16);
      numInput.value = d.replace(/(.{4})/g, '$1 ').trim();
    });
    const expInput = node.querySelector('[name="cardExpiry"]');
    if (expInput) expInput.addEventListener('input', () => {
      const d = expInput.value.replace(/\D/g, '').slice(0, 4);
      expInput.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    });

    const submitBtn = node.querySelector('.wallet-pm-submit');
    submitBtn.addEventListener('click', async () => {
      const body = { type };
      if (type === 'card') {
        const cardNumber = node.querySelector('[name="cardNumber"]').value.replace(/\s/g, '');
        const cardExpiry = node.querySelector('[name="cardExpiry"]').value.trim();
        const cardHolder = node.querySelector('[name="cardHolder"]').value.trim();
        const cardBrand = node.querySelector('[name="cardBrand"]').value;
        if (cardNumber.replace(/\D/g, '').length < 12) { showToast('카드번호를 정확히 입력해주세요', { variant: 'error' }); return; }
        if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) { showToast('유효기간을 MM/YY 형식으로 입력해주세요', { variant: 'error' }); return; }
        if (!cardHolder) { showToast('소유주명을 입력해주세요', { variant: 'error' }); return; }
        Object.assign(body, { cardNumber, cardExpiry, cardHolder, cardBrand });
      } else {
        const bankName = node.querySelector('[name="bankName"]').value;
        const accountNumber = node.querySelector('[name="accountNumber"]').value.replace(/\D/g, '');
        const accountHolder = node.querySelector('[name="accountHolder"]').value.trim();
        if (accountNumber.length < 6) { showToast('계좌번호를 정확히 입력해주세요', { variant: 'error' }); return; }
        if (!accountHolder) { showToast('예금주명을 입력해주세요', { variant: 'error' }); return; }
        Object.assign(body, { bankName, accountNumber, accountHolder });
      }
      submitBtn.disabled = true;
      submitBtn.textContent = '등록 중...';
      try {
        await request('/api/payment-methods', { method: 'POST', body: JSON.stringify(body) });
        showToast('결제수단이 등록되었습니다', { variant: 'success', duration: 1600 });
        overlay.close();
        loadMethods();
      } catch {
        submitBtn.disabled = false;
        submitBtn.textContent = '등록하기';
        showToast('등록에 실패했습니다', { variant: 'error', duration: 2000 });
      }
    });
  }

  /* 공용 바텀시트 빌더 */
  function buildSheet(title, bodyHtml, withSubmit) {
    const overlay = document.createElement('div');
    overlay.className = 'wallet-sheet-overlay';
    overlay.dataset.theme = 'light';
    overlay.innerHTML = `
      <div class="wallet-sheet">
        <div class="wallet-sheet__header">
          <h2 class="wallet-sheet__title">${escapeHtml(title)}</h2>
          <button class="wallet-sheet__close" type="button" aria-label="닫기">✕</button>
        </div>
        <div class="wallet-sheet__body">${bodyHtml}</div>
        ${withSubmit ? '<div class="wallet-sheet__footer"><button class="wallet-primary wallet-pm-submit" type="button">등록하기</button></div>' : ''}
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    const close = () => {
      overlay.classList.remove('is-open');
      const sheet = overlay.querySelector('.wallet-sheet');
      const cleanup = () => overlay.remove();
      sheet.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, 400);
    };
    overlay.querySelector('.wallet-sheet__close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    return { node: overlay, close };
  }

  pmAddBtn.addEventListener('click', openPmTypePicker);

  /* ── Init ────────────────────────────────────────────── */
  syncChargeBtn();
  loadWallet();
  loadTx(false);
  loadMethods();

  return page;
}
