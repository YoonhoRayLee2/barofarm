/**
 * FAB Modal (Bottom Sheet) — 3-W15
 * Slide-up bottom sheet with action options.
 * export: openFabModal()
 *
 * @module components/fab-modal
 */

import { navigate } from '/app/scripts/router.js';

// Inject CSS once
const _cssId = 'component-css-fab-modal';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/fab-modal.css';
  document.head.appendChild(link);
}

let _overlay = null;
let _sheet = null;
let _mounted = false;

function mount() {
  if (_mounted) return;
  _mounted = true;

  _overlay = document.createElement('div');
  _overlay.className = 'fab-overlay';
  _overlay.setAttribute('aria-hidden', 'true');

  _sheet = document.createElement('div');
  _sheet.className = 'fab-sheet';
  _sheet.setAttribute('role', 'dialog');
  _sheet.setAttribute('aria-modal', 'true');
  _sheet.setAttribute('aria-label', '새 방송 만들기');

  _sheet.innerHTML = `
    <div class="fab-sheet__handle"></div>
    <div class="fab-sheet__title">무엇을 하시겠어요?</div>

    <button class="fab-option" id="fab-opt-live">
      <span class="fab-option__icon">📡</span>
      <span class="fab-option__text">
        <span class="fab-option__label">라이브 경매 시작</span>
        <span class="fab-option__desc">지금 바로 방송을 시작하고 경매를 진행하세요</span>
      </span>
    </button>

    <button class="fab-option" id="fab-opt-product">
      <span class="fab-option__icon">📦</span>
      <span class="fab-option__text">
        <span class="fab-option__label">개별 상품 등록</span>
        <span class="fab-option__desc">라이브 없이 상품을 등록하고 경매를 예약하세요</span>
      </span>
    </button>

    <div class="fab-divider"></div>

    <button class="fab-option fab-option--cancel" id="fab-opt-cancel">
      <span class="fab-option__icon">✕</span>
      <span class="fab-option__text">
        <span class="fab-option__label">취소</span>
      </span>
    </button>
  `;

  document.body.appendChild(_overlay);
  document.body.appendChild(_sheet);

  // Close on overlay click
  _overlay.addEventListener('click', closeFabModal);

  _sheet.querySelector('#fab-opt-live').addEventListener('click', () => {
    closeFabModal();
    navigate('/app/live-create');
  });

  _sheet.querySelector('#fab-opt-product').addEventListener('click', () => {
    closeFabModal();
    navigate('/app/product-register');
  });

  _sheet.querySelector('#fab-opt-cancel').addEventListener('click', closeFabModal);

  // Close on ESC
  document.addEventListener('keydown', _handleKeydown);
}

function _handleKeydown(e) {
  if (e.key === 'Escape') closeFabModal();
}

/**
 * Open the FAB bottom sheet modal.
 */
export function openFabModal() {
  mount();
  // Force reflow before adding .is-open so transition fires
  void _overlay.offsetHeight;
  _overlay.classList.add('is-open');
  _sheet.classList.add('is-open');
}

/**
 * Close the FAB bottom sheet modal.
 */
export function closeFabModal() {
  if (!_mounted) return;
  _overlay.classList.remove('is-open');
  _sheet.classList.remove('is-open');
}
