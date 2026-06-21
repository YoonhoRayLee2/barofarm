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
/** @type {Element|null} */
let _previousFocus = null;

function mount() {
  const root = document.getElementById('app-root') || document.body;

  // 이미 만들어진 요소가 DOM에서 떨어졌으면 재append만 하고 종료
  if (_mounted && _sheet) {
    if (!_sheet.isConnected) {
      root.appendChild(_overlay);
      root.appendChild(_sheet);
    }
    return;
  }
  _mounted = true;

  _overlay = document.createElement('div');
  _overlay.className = 'fab-overlay';
  _overlay.dataset.theme = 'light';
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

    <button class="fab-option" id="fab-opt-group-deal">
      <span class="fab-option__icon">🤝</span>
      <span class="fab-option__text">
        <span class="fab-option__label">공동판매 등록</span>
        <span class="fab-option__desc">목표 인원을 모집하고 확정되면 일괄 발송하세요</span>
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

  root.appendChild(_overlay);
  root.appendChild(_sheet);

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

  _sheet.querySelector('#fab-opt-group-deal').addEventListener('click', () => {
    closeFabModal();
    navigate('/app/group-deals/create');
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
  _previousFocus = document.activeElement;
  void _overlay.offsetHeight;
  _overlay.classList.add('is-open');
  _sheet.classList.add('is-open');
  requestAnimationFrame(() => {
    const firstBtn = _sheet.querySelector('#fab-opt-live');
    if (firstBtn) firstBtn.focus();
  });
}

/**
 * Close the FAB bottom sheet modal.
 */
export function closeFabModal() {
  if (!_mounted) return;
  _overlay.classList.remove('is-open');
  _sheet.classList.remove('is-open');
  if (_previousFocus && typeof _previousFocus.focus === 'function') {
    _previousFocus.focus();
  }
  _previousFocus = null;
}
