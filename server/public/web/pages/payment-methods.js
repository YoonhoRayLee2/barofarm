/**
 * Payment Methods Page — 결제수단 관리
 * Route: /app/payment-methods
 *
 * 일반결제(key-in 카드) / 간편결제 / 바로팜페이 3종을 등록·관리한다.
 * 추가는 종류 선택 → 종류별 입력 바텀시트로 처리한다.
 *
 * @module pages/payment-methods
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { showConfirmDialog } from '/app/components/confirm-dialog.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';

/* CSS lazy-load */
const _cssId = 'page-css-payment-methods';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/payment-methods.css';
  document.head.appendChild(link);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const EASY_PROVIDERS = ['카카오페이', '네이버페이', '토스', '페이코', '삼성페이'];
const CARD_BRANDS = ['신한', '국민', '삼성', '현대', '롯데', 'BC', '하나', '농협'];

const TYPE_META = {
  card:         { icon: '💳', name: '일반결제 (카드)' },
  easy:         { icon: '⚡', name: '간편결제' },
  barofarm_pay: { icon: '🌱', name: '바로팜페이' },
};

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'pm-page';
  page.dataset.theme = 'light';
  page.innerHTML = `
    <header class="pm-header">
      <button class="pm-header__back" type="button" aria-label="뒤로 가기">‹</button>
      <h1 class="pm-header__title">결제수단 관리</h1>
      <button class="pm-header__add" type="button" aria-label="결제수단 추가">+ 추가</button>
    </header>
    <div class="pm-list" id="pm-list">
      <div class="pm-loading"><span>불러오는 중...</span></div>
    </div>
  `;

  page.querySelector('.pm-header__back').addEventListener('click', () => window.history.back());
  page.querySelector('.pm-header__add').addEventListener('click', openTypePicker);

  const listEl = page.querySelector('#pm-list');
  page.appendChild(createBottomTabBar());

  /* ───────────────────── List ───────────────────── */
  async function loadList() {
    listEl.innerHTML = '<div class="pm-loading"><span>불러오는 중...</span></div>';
    try {
      const res = await fetch(`/api/payment-methods?userId=${encodeURIComponent(user.id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      renderList(await res.json());
    } catch {
      listEl.innerHTML = `
        <div class="pm-empty">
          <span class="pm-empty__icon">⚠️</span>
          <span class="pm-empty__title">결제수단을 불러올 수 없습니다</span>
          <button class="pm-empty__retry" type="button" id="pm-retry">다시 시도</button>
        </div>`;
      listEl.querySelector('#pm-retry').addEventListener('click', loadList);
      listEl.appendChild(createTabSpacer());
    }
  }

  function renderList(list) {
    if (!list || list.length === 0) {
      listEl.innerHTML = `
        <div class="pm-empty">
          <span class="pm-empty__icon">💳</span>
          <span class="pm-empty__title">등록된 결제수단이 없습니다</span>
          <span class="pm-empty__desc">우측 상단의 [+ 추가] 버튼으로<br>결제수단을 등록해보세요.</span>
        </div>`;
      listEl.appendChild(createTabSpacer());
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'pm-cards';
    list.forEach((pm) => wrap.appendChild(renderCard(pm)));
    listEl.innerHTML = '';
    listEl.appendChild(wrap);
    listEl.appendChild(createTabSpacer());
  }

  function renderCard(pm) {
    const meta = TYPE_META[pm.type] || { icon: '💳', name: '결제수단' };
    const card = document.createElement('div');
    card.className = 'pm-card pm-card--' + pm.type + (pm.isDefault ? ' pm-card--default' : '');

    let detailHtml = '';
    if (pm.type === 'card') {
      detailHtml = `
        <div class="pm-card__num">${esc(pm.cardBrand || '카드')} •••• ${esc(pm.cardLast4 || '')}</div>
        <div class="pm-card__sub">${esc(pm.cardHolder || '')} · 유효기간 ${esc(pm.cardExpiry || '')}</div>`;
    } else if (pm.type === 'easy') {
      detailHtml = `<div class="pm-card__num">${esc(pm.easyProvider || pm.label)}</div>`;
    } else {
      detailHtml = `<div class="pm-card__num">바로팜페이</div>
        <div class="pm-card__sub">바로팜 자체 간편결제</div>`;
    }

    card.innerHTML = `
      ${pm.isDefault ? '<span class="pm-badge">기본 결제수단</span>' : ''}
      <div class="pm-card__head">
        <span class="pm-card__icon">${meta.icon}</span>
        <span class="pm-card__type">${esc(meta.name)}</span>
      </div>
      ${detailHtml}
      <div class="pm-card__actions">
        ${!pm.isDefault ? '<button class="pm-btn pm-btn--ghost" data-act="setDefault" type="button">기본으로 설정</button>' : ''}
        <button class="pm-btn pm-btn--danger" data-act="delete" type="button">삭제</button>
      </div>
    `;

    card.querySelector('[data-act="delete"]')?.addEventListener('click', () => onDelete(pm));
    card.querySelector('[data-act="setDefault"]')?.addEventListener('click', () => onSetDefault(pm));
    return card;
  }

  /* ───────────────────── Actions ───────────────────── */
  async function onDelete(pm) {
    const ok = await showConfirmDialog({
      title: '결제수단 삭제',
      message: `'${pm.label}' 결제수단을 삭제할까요?`,
      confirmLabel: '삭제',
      cancelLabel: '취소',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/payment-methods/${pm.id}?userId=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('결제수단이 삭제되었습니다', { variant: 'success', duration: 1600 });
      await loadList();
    } catch {
      showToast('삭제에 실패했습니다', { variant: 'error', duration: 2000 });
    }
  }

  async function onSetDefault(pm) {
    try {
      const res = await fetch(`/api/payment-methods/${pm.id}/set-default`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('기본 결제수단으로 설정되었습니다', { variant: 'success', duration: 1600 });
      await loadList();
    } catch {
      showToast('변경에 실패했습니다', { variant: 'error', duration: 2000 });
    }
  }

  /* ───────────────────── Type picker ───────────────────── */
  function openTypePicker() {
    const overlay = document.createElement('div');
    overlay.className = 'pm-form-overlay';
    overlay.dataset.theme = 'light';
    overlay.innerHTML = `
      <div class="pm-form-sheet">
        <div class="pm-form-header">
          <h2>결제수단 추가</h2>
          <button class="pm-form-close" type="button" aria-label="닫기">✕</button>
        </div>
        <div class="pm-form-body">
          <button class="pm-type-option" data-type="card" type="button">
            <span class="pm-type-option__icon">💳</span>
            <span class="pm-type-option__text">
              <span class="pm-type-option__name">일반결제 (카드)</span>
              <span class="pm-type-option__desc">카드번호를 직접 입력해 등록</span>
            </span>
          </button>
          <button class="pm-type-option" data-type="easy" type="button">
            <span class="pm-type-option__icon">⚡</span>
            <span class="pm-type-option__text">
              <span class="pm-type-option__name">간편결제</span>
              <span class="pm-type-option__desc">카카오페이·네이버페이·토스 등</span>
            </span>
          </button>
          <button class="pm-type-option pm-type-option--barofarm" data-type="barofarm_pay" type="button">
            <span class="pm-type-option__icon">🌱</span>
            <span class="pm-type-option__text">
              <span class="pm-type-option__name">바로팜페이</span>
              <span class="pm-type-option__desc">바로팜 자체 간편결제 연결</span>
            </span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('pm-form-overlay--open'));

    const close = () => {
      overlay.classList.remove('pm-form-overlay--open');
      const sheet = overlay.querySelector('.pm-form-sheet');
      const cleanup = () => overlay.remove();
      sheet.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, 400);
    };
    overlay.querySelector('.pm-form-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelectorAll('.pm-type-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        close();
        setTimeout(() => openForm(type), 260);
      });
    });
  }

  /* ───────────────────── Type-specific form ───────────────────── */
  function openForm(type) {
    const meta = TYPE_META[type];
    const overlay = document.createElement('div');
    overlay.className = 'pm-form-overlay';
    overlay.dataset.theme = 'light';

    let fieldsHtml = '';
    if (type === 'card') {
      fieldsHtml = `
        <label class="pm-field">
          <span class="pm-field__label">카드사</span>
          <select name="cardBrand" class="pm-field__input">
            ${CARD_BRANDS.map((b) => `<option value="${b}">${b}카드</option>`).join('')}
          </select>
        </label>
        <label class="pm-field">
          <span class="pm-field__label">카드번호</span>
          <input type="tel" name="cardNumber" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" class="pm-field__input" />
        </label>
        <div class="pm-field-row">
          <label class="pm-field">
            <span class="pm-field__label">유효기간</span>
            <input type="tel" name="cardExpiry" inputmode="numeric" maxlength="5" placeholder="MM/YY" class="pm-field__input" />
          </label>
          <label class="pm-field">
            <span class="pm-field__label">소유주명</span>
            <input type="text" name="cardHolder" maxlength="20" placeholder="홍길동" class="pm-field__input" />
          </label>
        </div>
        <p class="pm-field-note">보안을 위해 카드번호 전체는 저장되지 않으며, 끝 4자리만 보관됩니다.</p>`;
    } else if (type === 'easy') {
      fieldsHtml = `
        <label class="pm-field">
          <span class="pm-field__label">간편결제 제공사</span>
          <select name="easyProvider" class="pm-field__input">
            ${EASY_PROVIDERS.map((p) => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </label>`;
    } else {
      fieldsHtml = `
        <div class="pm-barofarm-card">
          <span class="pm-barofarm-card__logo">🌱 바로팜페이</span>
          <p class="pm-barofarm-card__desc">바로팜 자체 간편결제를 결제수단으로 연결합니다.<br>충전·포인트 적립 혜택이 제공됩니다.</p>
        </div>`;
    }

    overlay.innerHTML = `
      <div class="pm-form-sheet">
        <div class="pm-form-header">
          <h2>${meta.icon} ${esc(meta.name)} 등록</h2>
          <button class="pm-form-close" type="button" aria-label="닫기">✕</button>
        </div>
        <div class="pm-form-body">${fieldsHtml}</div>
        <div class="pm-form-footer">
          <button class="pm-form-submit" type="button">등록하기</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('pm-form-overlay--open'));

    const close = () => {
      overlay.classList.remove('pm-form-overlay--open');
      const sheet = overlay.querySelector('.pm-form-sheet');
      const cleanup = () => overlay.remove();
      sheet.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, 400);
    };
    overlay.querySelector('.pm-form-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // 카드번호 자동 포맷 (4자리마다 공백)
    const numInput = overlay.querySelector('[name="cardNumber"]');
    if (numInput) {
      numInput.addEventListener('input', () => {
        const digits = numInput.value.replace(/\D/g, '').slice(0, 16);
        numInput.value = digits.replace(/(.{4})/g, '$1 ').trim();
      });
    }
    // 유효기간 자동 슬래시
    const expInput = overlay.querySelector('[name="cardExpiry"]');
    if (expInput) {
      expInput.addEventListener('input', () => {
        const d = expInput.value.replace(/\D/g, '').slice(0, 4);
        expInput.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
      });
    }

    const submitBtn = overlay.querySelector('.pm-form-submit');
    submitBtn.addEventListener('click', async () => {
      const body = { userId: user.id, type };
      if (type === 'card') {
        const cardNumber = overlay.querySelector('[name="cardNumber"]').value.replace(/\s/g, '');
        const cardExpiry = overlay.querySelector('[name="cardExpiry"]').value.trim();
        const cardHolder = overlay.querySelector('[name="cardHolder"]').value.trim();
        const cardBrand = overlay.querySelector('[name="cardBrand"]').value;
        if (cardNumber.replace(/\D/g, '').length < 12) { showToast('카드번호를 정확히 입력해주세요', { variant: 'error' }); return; }
        if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) { showToast('유효기간을 MM/YY 형식으로 입력해주세요', { variant: 'error' }); return; }
        if (!cardHolder) { showToast('소유주명을 입력해주세요', { variant: 'error' }); return; }
        Object.assign(body, { cardNumber, cardExpiry, cardHolder, cardBrand });
      } else if (type === 'easy') {
        body.easyProvider = overlay.querySelector('[name="easyProvider"]').value;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '등록 중...';
      try {
        const res = await fetch('/api/payment-methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showToast('결제수단이 등록되었습니다', { variant: 'success', duration: 1600 });
        close();
        await loadList();
      } catch {
        submitBtn.disabled = false;
        submitBtn.textContent = '등록하기';
        showToast('등록에 실패했습니다', { variant: 'error', duration: 2000 });
      }
    });
  }

  loadList();
  return page;
}
