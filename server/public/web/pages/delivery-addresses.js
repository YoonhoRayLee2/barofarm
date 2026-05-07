/**
 * Delivery Addresses Page — 다중 배송지 관리
 * Route: /app/delivery-addresses
 *
 * 사용자가 여러 배송지를 등록·수정·삭제하고 기본배송지를 지정한다.
 * 추가/수정은 하단 바텀시트 오버레이로 처리한다 (append-on-open / remove-on-close).
 *
 * @module pages/delivery-addresses
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';

/* CSS lazy-load */
const _cssId = 'page-css-delivery-addresses';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/delivery-addresses.css';
  document.head.appendChild(link);
}

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'da-page';
  page.dataset.theme = 'light';
  page.innerHTML = `
    <header class="da-header">
      <button class="da-header__back" type="button" aria-label="뒤로 가기">‹</button>
      <h1 class="da-header__title">배송지 관리</h1>
      <button class="da-header__add" type="button" aria-label="배송지 추가">+ 추가</button>
    </header>
    <div class="da-list" id="da-list">
      <div class="da-loading">
        <div class="da-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    </div>
  `;

  page.querySelector('.da-header__back').addEventListener('click', () => window.history.back());
  page.querySelector('.da-header__add').addEventListener('click', () => openAddressForm(null));

  const listEl = page.querySelector('#da-list');

  /* ───────────────────── List loader ───────────────────── */
  async function loadList() {
    listEl.innerHTML = `
      <div class="da-loading">
        <div class="da-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    `;
    try {
      const res = await fetch(`/api/delivery-addresses?userId=${encodeURIComponent(user.id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      renderList(list);
    } catch (err) {
      listEl.innerHTML = `
        <div class="da-empty">
          <span class="da-empty__icon">⚠️</span>
          <span class="da-empty__title">배송지를 불러올 수 없습니다</span>
          <button class="da-empty__retry" type="button" id="da-retry">다시 시도</button>
        </div>
      `;
      listEl.querySelector('#da-retry').addEventListener('click', loadList);
    }
  }

  /* ───────────────────── List renderer ───────────────────── */
  function renderList(list) {
    if (!list || list.length === 0) {
      listEl.innerHTML = `
        <div class="da-empty">
          <span class="da-empty__icon">🏠</span>
          <span class="da-empty__title">등록된 배송지가 없습니다</span>
          <span class="da-empty__desc">우측 상단의 [+ 추가] 버튼으로<br>배송지를 등록해보세요.</span>
        </div>
      `;
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'da-cards';
    list.forEach((addr) => wrap.appendChild(renderCard(addr)));
    listEl.innerHTML = '';
    listEl.appendChild(wrap);
  }

  function renderCard(addr) {
    const card = document.createElement('div');
    card.className = 'da-card' + (addr.isDefault ? ' da-card--default' : '');

    const fullAddr = addr.detail ? `${addr.address} ${addr.detail}` : addr.address;

    card.innerHTML = `
      ${addr.isDefault ? '<span class="da-badge">기본배송지</span>' : ''}
      <div class="da-card__name">
        <span class="da-card__name-text">${esc(addr.name)}</span>
        <span class="da-card__phone">${esc(addr.phone)}</span>
      </div>
      <div class="da-card__zip">(우) ${esc(addr.zipcode)}</div>
      <div class="da-card__addr">${esc(fullAddr)}</div>
      <div class="da-card__actions">
        ${!addr.isDefault ? '<button class="da-btn da-btn--ghost" data-act="setDefault" type="button">기본으로 설정</button>' : ''}
        <button class="da-btn da-btn--ghost" data-act="edit" type="button">수정</button>
        <button class="da-btn da-btn--danger" data-act="delete" type="button">삭제</button>
      </div>
    `;

    const editBtn = card.querySelector('[data-act="edit"]');
    const delBtn = card.querySelector('[data-act="delete"]');
    const setDefBtn = card.querySelector('[data-act="setDefault"]');

    editBtn?.addEventListener('click', () => openAddressForm(addr));
    delBtn?.addEventListener('click', () => onDelete(addr));
    setDefBtn?.addEventListener('click', () => onSetDefault(addr));

    return card;
  }

  /* ───────────────────── Actions ───────────────────── */
  async function onDelete(addr) {
    if (!window.confirm(`'${addr.name}' 배송지를 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/delivery-addresses/${addr.id}?userId=${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('배송지가 삭제되었습니다', { variant: 'success', duration: 1600 });
      await loadList();
    } catch {
      showToast('삭제에 실패했습니다', { variant: 'error', duration: 2000 });
    }
  }

  async function onSetDefault(addr) {
    try {
      const res = await fetch(`/api/delivery-addresses/${addr.id}/set-default`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('기본배송지로 설정되었습니다', { variant: 'success', duration: 1600 });
      await loadList();
    } catch {
      showToast('변경에 실패했습니다', { variant: 'error', duration: 2000 });
    }
  }

  /* ───────────────────── Bottom-sheet form ───────────────────── */
  function openAddressForm(addr) {
    const isEdit = !!addr;

    const overlay = document.createElement('div');
    overlay.className = 'da-form-overlay';
    overlay.dataset.theme = 'light';
    overlay.innerHTML = `
      <div class="da-form-sheet" role="dialog" aria-modal="true" aria-labelledby="da-form-title">
        <div class="da-form-header">
          <h2 class="da-form-title" id="da-form-title">배송지 ${isEdit ? '수정' : '추가'}</h2>
          <button class="da-form-close" type="button" aria-label="닫기">✕</button>
        </div>
        <div class="da-form-body">
          <label class="da-form-field">
            <span class="da-form-label">수령인 이름</span>
            <input class="da-form-input" type="text" name="name" autocomplete="name" maxlength="20" />
          </label>
          <label class="da-form-field">
            <span class="da-form-label">연락처</span>
            <input class="da-form-input" type="tel" name="phone" autocomplete="tel" maxlength="20" placeholder="010-1234-5678" />
          </label>
          <div class="da-form-field">
            <span class="da-form-label">우편번호</span>
            <div class="da-form-zip-row">
              <input class="da-form-input da-form-input--zip" type="text" name="zipcode" readonly />
              <button class="da-btn da-btn--ghost da-form-zip-btn" type="button" data-act="zipSearch">주소검색</button>
            </div>
          </div>
          <label class="da-form-field">
            <span class="da-form-label">주소</span>
            <input class="da-form-input" type="text" name="address" readonly placeholder="주소검색을 눌러주세요" />
          </label>
          <label class="da-form-field">
            <span class="da-form-label">상세주소</span>
            <input class="da-form-input" type="text" name="detail" maxlength="100" placeholder="동/호수, 건물명 등" />
          </label>
        </div>
        <div class="da-form-footer">
          <button class="da-form-submit" type="button" disabled>저장하기</button>
        </div>
      </div>
    `;

    const sheet = overlay.querySelector('.da-form-sheet');
    const nameInput = overlay.querySelector('input[name="name"]');
    const phoneInput = overlay.querySelector('input[name="phone"]');
    const zipInput = overlay.querySelector('input[name="zipcode"]');
    const addrInput = overlay.querySelector('input[name="address"]');
    const detailInput = overlay.querySelector('input[name="detail"]');
    const zipBtn = overlay.querySelector('[data-act="zipSearch"]');
    const submitBtn = overlay.querySelector('.da-form-submit');
    const closeBtn = overlay.querySelector('.da-form-close');

    if (isEdit) {
      nameInput.value = addr.name || '';
      phoneInput.value = addr.phone || '';
      zipInput.value = addr.zipcode || '';
      addrInput.value = addr.address || '';
      detailInput.value = addr.detail || '';
    }

    function recompute() {
      const ok =
        nameInput.value.trim() &&
        phoneInput.value.trim() &&
        zipInput.value.trim() &&
        addrInput.value.trim();
      submitBtn.disabled = !ok;
    }
    [nameInput, phoneInput, zipInput, addrInput, detailInput].forEach((el) => {
      el.addEventListener('input', recompute);
    });

    function close() {
      overlay.classList.remove('da-form-overlay--open');
      const cleanup = () => overlay.remove();
      sheet.addEventListener('transitionend', cleanup, { once: true });
      // fallback if transitionend doesn't fire
      setTimeout(cleanup, 400);
    }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    zipBtn.addEventListener('click', async () => {
      try {
        const { openKakaoPostcode } = await import('/app/scripts/kakao-postcode.js');
        await openKakaoPostcode(({ zipcode, address, buildingName }) => {
          zipInput.value = zipcode;
          addrInput.value = address;
          if (buildingName && !detailInput.value) detailInput.value = buildingName;
          recompute();
          detailInput.focus();
        });
      } catch {
        showToast('주소 검색을 불러오지 못했습니다', { variant: 'error', duration: 2000 });
      }
    });

    submitBtn.addEventListener('click', async () => {
      if (submitBtn.disabled) return;
      submitBtn.disabled = true;
      submitBtn.textContent = '저장 중...';
      const body = {
        userId: user.id,
        name: nameInput.value.trim(),
        phone: phoneInput.value.trim(),
        zipcode: zipInput.value.trim(),
        address: addrInput.value.trim(),
        detail: detailInput.value.trim() || null,
      };
      try {
        const url = isEdit
          ? `/api/delivery-addresses/${addr.id}`
          : '/api/delivery-addresses';
        const method = isEdit ? 'PATCH' : 'POST';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showToast(isEdit ? '배송지가 수정되었습니다' : '배송지가 등록되었습니다', { variant: 'success', duration: 1600 });
        close();
        await loadList();
      } catch {
        submitBtn.disabled = false;
        submitBtn.textContent = '저장하기';
        showToast('저장에 실패했습니다', { variant: 'error', duration: 2000 });
      }
    });

    document.body.appendChild(overlay);
    // 초기값 검증 (edit 모드에서 곧바로 저장 가능하도록)
    recompute();
    // 슬라이드업 트리거
    requestAnimationFrame(() => {
      overlay.classList.add('da-form-overlay--open');
    });
  }

  loadList();
  return page;
}

/* ───────────────────── helpers ───────────────────── */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
