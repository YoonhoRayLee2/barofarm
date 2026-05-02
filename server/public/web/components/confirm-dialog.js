/**
 * Confirm Dialog Component
 * Reusable Promise-based confirmation modal using Fresh Field design tokens.
 *
 * Usage:
 *   import { showConfirmDialog } from '/app/components/confirm-dialog.js';
 *   const ok = await showConfirmDialog({ title, message, confirmLabel, cancelLabel, danger });
 *
 * @module components/confirm-dialog
 */

const _cssId = 'comp-css-confirm-dialog';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/confirm-dialog.css';
  document.head.appendChild(link);
}

/**
 * Show a custom confirmation dialog.
 *
 * @param {{
 *   title?: string,
 *   message?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean
 * }} options
 * @returns {Promise<boolean>} true if confirmed, false if cancelled
 */
export function showConfirmDialog({
  title = '확인',
  message = '',
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    // Build backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-dialog-backdrop';

    // Build dialog box
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleEl = document.createElement('p');
    titleEl.className = 'confirm-dialog-title';
    titleEl.textContent = title;

    const messageEl = document.createElement('p');
    messageEl.className = 'confirm-dialog-message';
    messageEl.textContent = message;
    messageEl.style.display = message ? '' : 'none';

    const actions = document.createElement('div');
    actions.className = 'confirm-dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'confirm-dialog-btn confirm-dialog-btn--cancel';
    cancelBtn.textContent = cancelLabel;
    cancelBtn.type = 'button';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'confirm-dialog-btn confirm-dialog-btn--confirm' + (danger ? ' is-danger' : '');
    confirmBtn.textContent = confirmLabel;
    confirmBtn.type = 'button';

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    dialog.appendChild(titleEl);
    dialog.appendChild(messageEl);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    // Trigger enter animation (rAF ensures transition fires)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        backdrop.classList.add('is-visible');
      });
    });

    function close(result) {
      backdrop.classList.remove('is-visible');
      // Wait for transition to finish before removing
      backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
      document.removeEventListener('keydown', onKeyDown);
      resolve(result);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') close(false);
    }

    // Backdrop click (not dialog itself)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));

    document.addEventListener('keydown', onKeyDown);
  });
}
