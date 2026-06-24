/**
 * Global Toast Component — Barofarm
 *
 * API:
 *   showToast(message, { variant: 'info'|'success'|'error', duration: 2400 })
 *
 * - Slide-up + fade-in from bottom center
 * - Max 3 toasts stacked simultaneously (oldest removed first)
 * - Auto-dismiss after `duration` ms
 *
 * @module components/toast
 */

// Inject CSS once
const _cssId = 'component-css-toast';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/toast.css';
  document.head.appendChild(link);
}

const MAX_TOASTS = 3;

/** @type {HTMLElement | null} */
let container = null;

function getContainer() {
  // 앱 카드(#app-root) 안에 붙여 데스크탑에서도 카드 영역 안에 토스트가 뜨도록.
  const host = document.getElementById('app-root') || document.body;
  if (!container || !host.contains(container)) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.dataset.theme = 'light';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    host.appendChild(container);
  }
  return container;
}

/**
 * Show a toast notification.
 *
 * @param {string} message
 * @param {{ variant?: 'info'|'success'|'error', duration?: number }} [opts]
 */
export function showToast(message, opts = {}) {
  const { variant = 'info', duration = 2400 } = opts;

  const c = getContainer();

  // Evict oldest if at max capacity
  while (c.children.length >= MAX_TOASTS) {
    dismissToast(c.firstElementChild);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${variant}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span class="toast__msg">${escapeHtml(String(message))}</span>
  `;

  c.appendChild(toast);

  const timer = setTimeout(() => dismissToast(toast), duration);

  // Allow tap-to-dismiss
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    dismissToast(toast);
  }, { once: true });
}

/**
 * Dismiss a specific toast element with leave animation.
 * @param {Element | null} el
 */
function dismissToast(el) {
  if (!el || !el.isConnected) return;
  el.classList.add('is-leaving');
  el.addEventListener('animationend', () => el.remove(), { once: true });
  // Fallback remove if animation is disabled (prefers-reduced-motion)
  setTimeout(() => { if (el.isConnected) el.remove(); }, 250);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
