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
import { request } from '/app/scripts/api.js';
import { replace, navigate } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { showConfirmDialog } from '/app/components/confirm-dialog.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';

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
  const returnTo = new URLSearchParams(window.location.search).get('returnTo') || null;
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

  page.querySelector('.da-header__back').addEventListener('click', () => {
    if (returnTo) navigate(returnTo); else window.history.back();
  });
  page.querySelector('.da-header__add').addEventListener('click', () => openAddressForm(null));

  const listEl = page.querySelector('#da-list');
  page.appendChild(createBottomTabBar());

  /* ───────────────────── List loader ───────────────────── */
  async function loadList() {
    listEl.innerHTML = `
      <div class="da-loading">
        <div class="da-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    `;
    try {
      const list = await request(`/api/delivery-addresses?userId=${encodeURIComponent(user.id)}`);
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
      listEl.appendChild(createTabSpacer());
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
      listEl.appendChild(createTabSpacer());
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'da-cards';
    list.forEach((addr) => wrap.appendChild(renderCard(addr)));
    listEl.innerHTML = '';
    listEl.appendChild(wrap);
    listEl.appendChild(createTabSpacer());
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
    const ok = await showConfirmDialog({
      title: '배송지 삭제',
      message: `'${addr.name}' 배송지를 삭제할까요?`,
      confirmLabel: '삭제',
      cancelLabel: '취소',
      danger: true,
    });
    if (!ok) return;
    try {
      await request(`/api/delivery-addresses/${addr.id}?userId=${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
      });
      showToast('배송지가 삭제되었습니다', { variant: 'success', duration: 1600 });
      await loadList();
    } catch {
      showToast('삭제에 실패했습니다', { variant: 'error', duration: 2000 });
    }
  }

  async function onSetDefault(addr) {
    try {
      await request(`/api/delivery-addresses/${addr.id}/set-default`, {
        method: 'PATCH',
        body: JSON.stringify({ userId: user.id }),
      });
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
        await request(url, {
          method,
          body: JSON.stringify(body),
        });
        showToast(isEdit ? '배송지가 수정되었습니다' : '배송지가 등록되었습니다', { variant: 'success', duration: 1600 });
        if (!isEdit && returnTo) {
          close();
          setTimeout(() => navigate(returnTo), 400);
        } else {
          close();
          await loadList();
        }
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

  // ── Delivery option section (persists across list reloads) ──────────
  const optionSection = document.createElement('section');
  optionSection.className = 'delivery-option-section';
  optionSection.innerHTML = `
    <h2 class="delivery-option-title">배송 방법</h2>
    <div class="delivery-option-cards">
      <button class="delivery-option-card is-active" type="button" data-option="standard">
        <span class="delivery-option-card__icon">🚚</span>
        <div class="delivery-option-card__text">
          <span class="delivery-option-card__name">일반배송</span>
          <span class="delivery-option-card__desc">택배로 집까지 배송</span>
        </div>
        <span class="delivery-option-card__check">✓</span>
      </button>
      <button class="delivery-option-card" type="button" data-option="hanaro">
        <span class="delivery-option-card__icon">🏬</span>
        <div class="delivery-option-card__text">
          <span class="delivery-option-card__name">하나로마트 반값택배</span>
          <span class="delivery-option-card__desc">가까운 하나로마트에서 수령 (배송비 절감)</span>
        </div>
        <span class="delivery-option-card__check">✓</span>
      </button>
    </div>
    <div class="hanaro-select-block" hidden>
      <button class="hanaro-find-btn" type="button">📍 가까운 하나로마트 찾기</button>
      <div class="hanaro-selected" hidden>
        <span class="hanaro-selected__icon">🏬</span>
        <div class="hanaro-selected__info">
          <span class="hanaro-selected__name"></span>
          <span class="hanaro-selected__addr"></span>
        </div>
        <button class="hanaro-selected__change" type="button">변경</button>
      </div>
    </div>
    <button class="delivery-option-save" type="button">저장</button>
  `;
  page.appendChild(optionSection);

  const cardsEl        = optionSection.querySelector('.delivery-option-cards');
  const hanaroBlock    = optionSection.querySelector('.hanaro-select-block');
  const findBtn        = optionSection.querySelector('.hanaro-find-btn');
  const selectedEl     = optionSection.querySelector('.hanaro-selected');
  const selectedName   = optionSection.querySelector('.hanaro-selected__name');
  const selectedAddr   = optionSection.querySelector('.hanaro-selected__addr');
  const changeBtn      = optionSection.querySelector('.hanaro-selected__change');
  const saveBtn        = optionSection.querySelector('.delivery-option-save');

  let _selectedStore = null; // { name, address }

  function showSelectedStore(store) {
    _selectedStore = store;
    selectedName.textContent = store.name;
    selectedAddr.textContent = store.address;
    findBtn.hidden = true;
    selectedEl.hidden = false;
  }

  function clearSelectedStore() {
    _selectedStore = null;
    findBtn.hidden = false;
    selectedEl.hidden = true;
  }

  changeBtn.addEventListener('click', () => openStoreSearch());

  cardsEl.addEventListener('click', (e) => {
    const card = e.target.closest('.delivery-option-card');
    if (!card) return;
    cardsEl.querySelectorAll('.delivery-option-card').forEach((c) => c.classList.remove('is-active'));
    card.classList.add('is-active');
    hanaroBlock.hidden = card.dataset.option !== 'hanaro';
  });

  // ── Store search sheet ───────────────────────────────────────────────
  function openStoreSearch() {
    const overlay = document.createElement('div');
    overlay.className = 'hanaro-search-overlay';
    overlay.innerHTML = `
      <div class="hanaro-search-sheet">
        <div class="hanaro-search-handle"></div>
        <div class="hanaro-search-header">
          <h3 class="hanaro-search-title">하나로마트 찾기</h3>
          <button class="hanaro-search-close" type="button" aria-label="닫기">✕</button>
        </div>
        <div class="hanaro-search-input-row">
          <input class="hanaro-search-input" type="text" placeholder="지역명 또는 마트명 검색" autocomplete="off" />
          <button class="hanaro-search-gps" type="button" title="내 위치로 검색">📍</button>
        </div>
        <ul class="hanaro-search-list" id="hanaro-search-list">
          <li class="hanaro-search-empty">지역명을 입력하거나 📍를 눌러 주변 마트를 찾으세요</li>
        </ul>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));

    const sheet     = overlay.querySelector('.hanaro-search-sheet');
    const closeBtn  = overlay.querySelector('.hanaro-search-close');
    const inputEl   = overlay.querySelector('.hanaro-search-input');
    const gpsBtn    = overlay.querySelector('.hanaro-search-gps');
    const listEl    = overlay.querySelector('#hanaro-search-list');

    function close() {
      overlay.classList.remove('is-open');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    closeBtn.addEventListener('click', close);

    async function renderStores(stores) {
      if (!stores.length) {
        listEl.innerHTML = '<li class="hanaro-search-empty">검색 결과가 없습니다</li>';
        return;
      }
      listEl.innerHTML = stores.map((s) => `
        <li class="hanaro-search-item" data-name="${esc(s.name)}" data-addr="${esc(s.address)}">
          <span class="hanaro-search-item__icon">🏬</span>
          <div class="hanaro-search-item__info">
            <span class="hanaro-search-item__name">${esc(s.name)}</span>
            <span class="hanaro-search-item__addr">${esc(s.address)}${s.distance != null ? ` · ${s.distance.toFixed(1)}km` : ''}</span>
          </div>
        </li>
      `).join('');
    }

    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.hanaro-search-item');
      if (!item) return;
      showSelectedStore({ name: item.dataset.name, address: item.dataset.addr });
      close();
    });

    // GPS search
    async function searchByLocation(lat, lng) {
      gpsBtn.textContent = '⏳';
      gpsBtn.disabled = true;
      try {
        const stores = await request(`/api/hanaro-stores?lat=${lat}&lng=${lng}&radius=10`);
        renderStores(stores);
        if (!stores.length) {
          listEl.innerHTML = '<li class="hanaro-search-empty">10km 이내 하나로마트가 없습니다. 지역명으로 검색해보세요</li>';
        }
      } catch (_) {
        listEl.innerHTML = '<li class="hanaro-search-empty">위치 검색 중 오류가 발생했습니다</li>';
      } finally {
        gpsBtn.textContent = '📍';
        gpsBtn.disabled = false;
      }
    }

    gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast('이 기기에서 위치 서비스를 지원하지 않습니다', { variant: 'error', duration: 2000 });
        return;
      }
      gpsBtn.textContent = '⏳';
      navigator.geolocation.getCurrentPosition(
        (pos) => searchByLocation(pos.coords.latitude, pos.coords.longitude),
        () => {
          gpsBtn.textContent = '📍';
          showToast('위치 접근이 거부됐습니다. 지역명으로 검색해주세요', { variant: 'error', duration: 2500 });
        },
        { timeout: 8000 },
      );
    });

    // Text search (debounced)
    let _searchTimer = null;
    inputEl.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      const q = inputEl.value.trim();
      if (!q) {
        listEl.innerHTML = '<li class="hanaro-search-empty">지역명을 입력하거나 📍를 눌러 주변 마트를 찾으세요</li>';
        return;
      }
      _searchTimer = setTimeout(async () => {
        try {
          renderStores(await request(`/api/hanaro-stores?q=${encodeURIComponent(q)}`));
        } catch (_) {}
      }, 300);
    });

    // Auto-search by GPS on open
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => searchByLocation(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { timeout: 5000 },
      );
    }

    setTimeout(() => inputEl.focus(), 400);
  }

  findBtn.addEventListener('click', () => openStoreSearch());

  // ── Load saved option ────────────────────────────────────────────────
  async function loadDeliveryOption() {
    try {
      const data = await request(`/api/users/${encodeURIComponent(user.id)}`);
      const option = data.deliveryOption || 'standard';
      cardsEl.querySelectorAll('.delivery-option-card').forEach((c) => {
        c.classList.toggle('is-active', c.dataset.option === option);
      });
      if (option === 'hanaro') {
        hanaroBlock.hidden = false;
        if (data.hanaroMartName && data.hanaroMartAddr) {
          showSelectedStore({ name: data.hanaroMartName, address: data.hanaroMartAddr });
        }
      }
    } catch (_) {}
  }

  saveBtn.addEventListener('click', async () => {
    const activeCard = cardsEl.querySelector('.delivery-option-card.is-active');
    const deliveryOption = activeCard?.dataset.option || 'standard';

    if (deliveryOption === 'hanaro' && !_selectedStore) {
      showToast('수령할 하나로마트를 선택해주세요', { variant: 'error', duration: 2000 });
      return;
    }

    try {
      await request(`/api/users/${encodeURIComponent(user.id)}/delivery-option`, {
        method: 'PATCH',
        body: JSON.stringify({
          deliveryOption,
          hanaroMartName: _selectedStore?.name ?? null,
          hanaroMartAddr: _selectedStore?.address ?? null,
        }),
      });
      showToast('배송 방법이 저장되었습니다', { variant: 'success', duration: 1600 });
    } catch {
      showToast('저장에 실패했습니다', { variant: 'error', duration: 2000 });
    }
  });

  loadList();
  loadDeliveryOption();
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
