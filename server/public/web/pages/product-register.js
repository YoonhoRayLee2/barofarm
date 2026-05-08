/**
 * Product Register Page — 개별 상품 등록 / 수정
 * 라이브 없이 단건 상품을 등록·수정한다.
 *
 * 흐름:
 *  - URL `?id=xxx` 가 있으면 수정 모드 (기존 상품 로드 후 폼 채움)
 *  - 대표사진 1장 + 추가사진 최대 9장 + 상품명 + 카테고리 + 설명 + 구성품/특징 + 속성 + 판매가 + 재고
 *  - 등록 모드: api.createProduct → /app/my-products
 *  - 수정 모드: api.updateProduct → /app/my-products
 *
 * @module pages/product-register
 */

import * as api from '/app/scripts/api.js';
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace, setCleanup } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';

// Inject page CSS once
const _cssId = 'page-css-product-register';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/product-register.css';
  document.head.appendChild(link);
}

const FEATURES_OPTIONS   = ['당일수확', '무농약', '박스포장', '선물포장', '냉장보관', '소분가능'];
const ATTRIBUTES_OPTIONS = ['GAP인증', '유기농인증', '무농약인증', '친환경인증', '특A등급', '산지직송'];
const CATEGORY_OPTIONS   = [
  { value: '',    label: '전체' },
  { value: '과일', label: '과일' },
  { value: '채소', label: '채소' },
  { value: '축산', label: '축산' },
  { value: '수산', label: '수산' },
  { value: '곡물', label: '곡물' },
];

const MAX_EXTRA_IMAGES = 9;

const CAMERA_ICON_SVG = `
  <svg class="pr-img-slot__camera" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
    <circle cx="12" cy="13" r="4"></circle>
  </svg>
`;

/**
 * @param {{ id?: string }} [params]
 * @returns {Promise<HTMLElement>}
 */
export default async function load(params = {}) {
  // ---- Auth guard ----
  const stored = await getSecureItem('user');
  if (!stored) {
    await replace('/app/login');
    return document.createElement('div');
  }
  let user;
  try {
    user = JSON.parse(stored);
  } catch {
    await replace('/app/login');
    return document.createElement('div');
  }

  // ---- Edit mode detection ----
  const editId = (params && params.id)
    || new URLSearchParams(window.location.search).get('id')
    || null;
  const isEdit = !!editId;

  // ---- Image state ----
  /** @type {File|null} */
  let mainImageFile = null;
  /** @type {string|null} */
  let mainImagePreview = null;
  /** Whether current mainImagePreview is a blob URL we own (vs server URL). */
  let mainImageOwnsBlob = false;

  /** @type {Array<File|null>} extraImageFiles[i]==null means "remote-only" (no replace). */
  const extraImageFiles = [];
  /** @type {string[]} extraImagePreviews[i] is either blob: or http(s) url. */
  const extraImagePreviews = [];
  /** @type {boolean[]} parallel array — true if blob: URL we own. */
  const extraImageOwnsBlob = [];

  const selectedFeatures   = new Set();
  const selectedAttributes = new Set();
  let isSubmitting = false;

  // ---- Page shell ----
  const page = document.createElement('section');
  page.className = 'product-register';
  page.dataset.theme = 'light';

  const titleText  = isEdit ? '상품 수정' : '상품 등록';
  const submitText = isEdit ? '수정하기' : '등록하기';

  page.innerHTML = `
    <header class="pr-header">
      <button class="pr-header__back" id="pr-back" aria-label="뒤로">←</button>
      <h1 class="pr-header__title">${titleText}</h1>
      <button class="pr-header__submit" id="pr-submit-top">${submitText}</button>
    </header>

    <div class="pr-body">
      <!-- 사진 업로드 -->
      <div class="pr-images" id="pr-images"></div>
      <p class="pr-images__hint">대표 사진 1장 + 추가 사진 최대 ${MAX_EXTRA_IMAGES}장</p>

      <!-- 상품 정보 -->
      <div class="pr-section">
        <h2 class="pr-section__title">상품 정보</h2>
        <div class="pr-field">
          <input class="pr-input" id="pr-name" type="text" placeholder="예: 제주 감귤 10kg, 국내산 쌀 20kg" maxlength="100" autocomplete="off" />
        </div>
        <div class="pr-field">
          <select class="pr-select" id="pr-category">
            ${CATEGORY_OPTIONS.map((opt) => `<option value="${escapeAttr(opt.value)}">${escapeHtml(opt.label)}</option>`).join('')}
          </select>
        </div>
        <div class="pr-field">
          <textarea class="pr-textarea" id="pr-desc" rows="4" placeholder="상품 설명, 원산지, 수확일 등을 입력하세요"></textarea>
        </div>
      </div>

      <!-- 구성품 및 특징 -->
      <div class="pr-section">
        <h2 class="pr-section__title">상품 특징</h2>
        <div class="pr-chip-grid" id="pr-features">
          ${FEATURES_OPTIONS.map((label) => `<button type="button" class="pr-chip" data-value="${escapeAttr(label)}">${escapeHtml(label)}</button>`).join('')}
        </div>
      </div>

      <!-- 속성 -->
      <div class="pr-section">
        <h2 class="pr-section__title">속성</h2>
        <div class="pr-chip-grid" id="pr-attrs">
          ${ATTRIBUTES_OPTIONS.map((label) => `<button type="button" class="pr-chip" data-value="${escapeAttr(label)}">${escapeHtml(label)}</button>`).join('')}
        </div>
      </div>

      <!-- 판매가 -->
      <div class="pr-section">
        <h2 class="pr-section__title">판매가</h2>
        <div class="pr-price-row">
          <div class="pr-price-input">
            <input class="pr-input" id="pr-price" type="number" inputmode="numeric" min="0" placeholder="0" />
            <span class="pr-price-input__suffix">원</span>
          </div>
          <div class="pr-price-input">
            <input class="pr-input" id="pr-stock" type="number" inputmode="numeric" min="1" placeholder="1" />
            <span class="pr-price-input__suffix">개</span>
          </div>
        </div>
      </div>

      <!-- 안내 -->
      <div class="pr-info">
        등록된 상품은 마이페이지 &gt; 내 상품 수정 및 관리에서 확인할 수 있습니다.
      </div>
    </div>

    <div class="pr-bottom">
      <button class="pr-cta" id="pr-submit-bottom">${submitText}</button>
    </div>
  `;

  // ---- Element refs ----
  const imagesRoot    = page.querySelector('#pr-images');
  const nameInput     = page.querySelector('#pr-name');
  const categorySel   = page.querySelector('#pr-category');
  const descInput     = page.querySelector('#pr-desc');
  const priceInput    = page.querySelector('#pr-price');
  const stockInput    = page.querySelector('#pr-stock');
  const featuresGrid  = page.querySelector('#pr-features');
  const attrsGrid     = page.querySelector('#pr-attrs');
  const submitTopBtn  = page.querySelector('#pr-submit-top');
  const submitBotBtn  = page.querySelector('#pr-submit-bottom');
  const backBtn       = page.querySelector('#pr-back');

  /* ── Image rendering ─────────────────────────────────────── */

  function renderImageSlots() {
    imagesRoot.innerHTML = '';

    // Main slot (always first).
    imagesRoot.appendChild(buildMainSlot());

    // Extra slots (one per existing extra preview).
    for (let i = 0; i < extraImagePreviews.length; i++) {
      imagesRoot.appendChild(buildExtraSlot(i));
    }

    // "+" add slot — only if main exists and we still have capacity.
    if (mainImagePreview && extraImagePreviews.length < MAX_EXTRA_IMAGES) {
      imagesRoot.appendChild(buildAddSlot());
    }
  }

  function buildMainSlot() {
    const slot = document.createElement('div');
    slot.className = 'pr-img-slot pr-img-slot--main';
    slot.setAttribute('role', 'button');
    slot.setAttribute('tabindex', '0');
    slot.setAttribute('aria-label', '대표 사진 추가');

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.className = 'pr-img-file-input';
    fileInput.accept = 'image/*';
    slot.appendChild(fileInput);

    if (mainImagePreview) {
      slot.classList.add('has-image');
      const img = document.createElement('img');
      img.src = mainImagePreview;
      img.alt = '대표 사진';
      slot.appendChild(img);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'pr-img-slot__remove';
      removeBtn.setAttribute('aria-label', '대표 사진 제거');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearMainImage();
        renderImageSlots();
      });
      slot.appendChild(removeBtn);
    } else {
      slot.insertAdjacentHTML('beforeend', CAMERA_ICON_SVG);
      const label = document.createElement('span');
      label.className = 'pr-img-slot__label';
      label.textContent = '대표 사진';
      slot.appendChild(label);
    }

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      setMainImage(file);
      renderImageSlots();
    });

    slot.addEventListener('click', (e) => {
      // ignore clicks bubbled from the remove button
      if (e.target instanceof HTMLElement && e.target.classList.contains('pr-img-slot__remove')) return;
      if (e.target === fileInput) return;
      fileInput.click();
    });
    slot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    return slot;
  }

  function buildExtraSlot(index) {
    const slot = document.createElement('div');
    slot.className = 'pr-img-slot has-image';

    const img = document.createElement('img');
    img.src = extraImagePreviews[index];
    img.alt = `추가 사진 ${index + 1}`;
    slot.appendChild(img);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'pr-img-slot__remove';
    removeBtn.setAttribute('aria-label', `추가 사진 ${index + 1} 제거`);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeExtraImage(index);
      renderImageSlots();
    });
    slot.appendChild(removeBtn);

    return slot;
  }

  function buildAddSlot() {
    const slot = document.createElement('div');
    slot.className = 'pr-img-slot';
    slot.setAttribute('role', 'button');
    slot.setAttribute('tabindex', '0');
    slot.setAttribute('aria-label', '추가 사진 추가');

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.className = 'pr-img-file-input';
    fileInput.accept = 'image/*';
    slot.appendChild(fileInput);

    const addIcon = document.createElement('span');
    addIcon.className = 'pr-img-slot__add-icon';
    addIcon.textContent = '+';
    slot.appendChild(addIcon);

    const label = document.createElement('span');
    label.className = 'pr-img-slot__label';
    label.textContent = `${extraImagePreviews.length}/${MAX_EXTRA_IMAGES}`;
    slot.appendChild(label);

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      addExtraImage(file);
      renderImageSlots();
    });

    slot.addEventListener('click', (e) => {
      if (e.target === fileInput) return;
      fileInput.click();
    });
    slot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    return slot;
  }

  /* ── Image state mutations ────────────────────────────────── */

  function setMainImage(file) {
    if (mainImageOwnsBlob && mainImagePreview) {
      try { URL.revokeObjectURL(mainImagePreview); } catch {}
    }
    mainImageFile = file;
    mainImagePreview = URL.createObjectURL(file);
    mainImageOwnsBlob = true;
  }

  function clearMainImage() {
    if (mainImageOwnsBlob && mainImagePreview) {
      try { URL.revokeObjectURL(mainImagePreview); } catch {}
    }
    mainImageFile = null;
    mainImagePreview = null;
    mainImageOwnsBlob = false;
  }

  function addExtraImage(file) {
    if (extraImagePreviews.length >= MAX_EXTRA_IMAGES) return;
    extraImageFiles.push(file);
    extraImagePreviews.push(URL.createObjectURL(file));
    extraImageOwnsBlob.push(true);
  }

  function removeExtraImage(index) {
    if (index < 0 || index >= extraImagePreviews.length) return;
    if (extraImageOwnsBlob[index] && extraImagePreviews[index]) {
      try { URL.revokeObjectURL(extraImagePreviews[index]); } catch {}
    }
    extraImageFiles.splice(index, 1);
    extraImagePreviews.splice(index, 1);
    extraImageOwnsBlob.splice(index, 1);
  }

  function revokeAllOwnedBlobs() {
    if (mainImageOwnsBlob && mainImagePreview) {
      try { URL.revokeObjectURL(mainImagePreview); } catch {}
    }
    extraImagePreviews.forEach((url, i) => {
      if (extraImageOwnsBlob[i] && url) {
        try { URL.revokeObjectURL(url); } catch {}
      }
    });
  }

  // Initial render
  renderImageSlots();

  // ---- Chip toggling ----
  function bindChips(grid, set) {
    grid.querySelectorAll('.pr-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.value;
        if (set.has(v)) { set.delete(v); btn.classList.remove('is-selected'); }
        else            { set.add(v);    btn.classList.add('is-selected'); }
      });
    });
  }
  bindChips(featuresGrid, selectedFeatures);
  bindChips(attrsGrid,    selectedAttributes);

  // ---- Prefill (edit mode) ----
  if (isEdit) {
    try {
      const existing = await api.getProduct(editId);
      if (existing) {
        nameInput.value  = existing.name        || '';
        descInput.value  = existing.description || '';
        priceInput.value = existing.price != null ? String(existing.price) : '';
        if (existing.category) categorySel.value = existing.category;

        // features / attributes — server stores as JSON string
        applyChipSelection(featuresGrid, selectedFeatures, parseList(existing.features));
        applyChipSelection(attrsGrid,    selectedAttributes, parseList(existing.attributes));

        // Existing main image — preview only, no File until user picks new.
        if (existing.imageUrl) {
          mainImagePreview = existing.imageUrl;
          mainImageOwnsBlob = false;
          mainImageFile = null;
        }

        // Existing extra images — preview only.
        const remoteExtras = Array.isArray(existing.images) ? existing.images : [];
        remoteExtras.slice(0, MAX_EXTRA_IMAGES).forEach((url) => {
          if (typeof url !== 'string' || !url) return;
          extraImageFiles.push(null);
          extraImagePreviews.push(url);
          extraImageOwnsBlob.push(false);
        });

        renderImageSlots();
      }
    } catch (err) {
      showToast('상품 정보를 불러오지 못했습니다: ' + (err.message || String(err)), { variant: 'error' });
    }
  }

  // ---- Submit ----
  async function submit() {
    if (isSubmitting) return;

    const name        = nameInput.value.trim();
    const priceStr    = priceInput.value.trim();
    const description = descInput.value.trim();
    const category    = categorySel.value || '';
    const price       = Number(priceStr);

    if (!name) {
      showToast('상품명을 입력해 주세요.', { variant: 'error' });
      nameInput.focus();
      return;
    }
    if (!priceStr || Number.isNaN(price) || price <= 0) {
      showToast('판매가를 입력해 주세요.', { variant: 'error' });
      priceInput.focus();
      return;
    }

    const features   = Array.from(selectedFeatures);
    const attributes = Array.from(selectedAttributes);

    isSubmitting = true;
    submitTopBtn.disabled = true;
    submitBotBtn.disabled = true;
    submitBotBtn.textContent = isEdit ? '수정 중...' : '등록 중...';

    // Only send files (Files we own); skip null entries (remote-only existing images).
    const extraFilesToSend = extraImageFiles.filter((f) => f instanceof File);

    const payload = {
      name,
      price,
      category:    category || undefined,
      description: description || undefined,
      features:    features.length   ? JSON.stringify(features)   : undefined,
      attributes:  attributes.length ? JSON.stringify(attributes) : undefined,
      image:       mainImageFile || undefined,
      images:      extraFilesToSend.length ? extraFilesToSend : undefined,
    };

    try {
      if (isEdit) {
        await api.updateProduct(editId, payload);
        showToast('상품이 수정되었습니다', { variant: 'success' });
      } else {
        await api.createProduct({ sellerId: String(user.id), ...payload });
        showToast('상품이 등록되었습니다', { variant: 'success' });
      }
      await navigate('/app/my-products');
    } catch (err) {
      const verb = isEdit ? '수정' : '등록';
      showToast(`상품 ${verb} 실패: ` + (err.message || String(err)), { variant: 'error' });
      isSubmitting = false;
      submitTopBtn.disabled = false;
      submitBotBtn.disabled = false;
      submitBotBtn.textContent = submitText;
    }
  }

  submitTopBtn.addEventListener('click', submit);
  submitBotBtn.addEventListener('click', submit);

  // ---- Back ----
  backBtn.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/app/home');
  });

  // ---- Cleanup ----
  setCleanup(() => {
    revokeAllOwnedBlobs();
  });

  return page;
}

/* ─── Helpers ─────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Parse a stored list field — server stores features/attributes as JSON string.
 * @param {string|string[]|null|undefined} raw
 * @returns {string[]}
 */
function parseList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Reflect a selected-value list onto a chip grid + tracking Set.
 * @param {HTMLElement} grid
 * @param {Set<string>} set
 * @param {string[]} values
 */
function applyChipSelection(grid, set, values) {
  values.forEach((v) => set.add(v));
  grid.querySelectorAll('.pr-chip').forEach((btn) => {
    if (set.has(btn.dataset.value)) btn.classList.add('is-selected');
  });
}
