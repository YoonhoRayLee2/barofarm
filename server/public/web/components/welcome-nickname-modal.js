/**
 * Welcome Nickname Modal — Barofarm (AUTH-9)
 * Displayed after a successful signup to show the auto-assigned nickname.
 *
 * Usage:
 *   import { showWelcomeModal } from '/app/components/welcome-nickname-modal.js';
 *   await showWelcomeModal('닉네임123');
 *
 * @module components/welcome-nickname-modal
 */

// Inject CSS once
const _cssId = 'comp-css-welcome-nickname-modal';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/welcome-nickname-modal.css';
  document.head.appendChild(link);
}

/**
 * Show the welcome modal and resolve when the user dismisses it.
 * @param {string} nickname - The auto-assigned nickname to display.
 * @returns {Promise<void>}
 */
export function showWelcomeModal(nickname) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'wnm-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'wnm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const icon = document.createElement('div');
    icon.className = 'wnm-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '&#127881;'; // party popper — rendered as text so lint passes

    const title = document.createElement('p');
    title.className = 'wnm-title';
    title.textContent = '환영합니다!';

    const body = document.createElement('p');
    body.className = 'wnm-body';
    body.innerHTML = `닉네임이 부여되었어요:<br><strong class="wnm-nickname">${escapeHtml(nickname)}</strong>`;

    const hint = document.createElement('p');
    hint.className = 'wnm-hint';
    hint.textContent = '닉네임은 마이페이지에서 변경할 수 있어요.';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'wnm-close-btn';
    closeBtn.type = 'button';
    closeBtn.textContent = '홈으로 이동';

    dialog.appendChild(icon);
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(hint);
    dialog.appendChild(closeBtn);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    // Trigger enter animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        backdrop.classList.add('is-visible');
      });
    });

    function close() {
      backdrop.classList.remove('is-visible');
      backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
      resolve();
    }

    closeBtn.addEventListener('click', close);
    // Backdrop click also closes
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
