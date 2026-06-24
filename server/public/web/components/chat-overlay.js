/**
 * Chat Overlay Component
 * Scrollable chat message list over live video.
 * Messages persist (no fade); user can scroll up for history.
 *
 * @module components/chat-overlay
 */

const _cssId = 'comp-css-chat-overlay';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/chat-overlay.css';
  document.head.appendChild(link);
}

const MAX_MESSAGES = 200;

/**
 * @typedef {{ userId: string, userName: string, message: string, system?: boolean }} ChatMsg
 */

/**
 * @returns {{ el: HTMLElement, push(msg: ChatMsg): void, destroy(): void, onSend(cb: (text: string) => void): void }}
 */
export function createChatOverlay() {
  const el = document.createElement('div');
  el.className = 'chat-overlay';
  el.setAttribute('aria-live', 'polite');

  // ---- 스크롤 가능한 메시지 리스트 ----
  const list = document.createElement('div');
  list.className = 'chat-overlay__list';
  el.appendChild(list);

  // ---- 새 메시지 뱃지 (위로 스크롤 중일 때) ----
  const newBadge = document.createElement('button');
  newBadge.className = 'chat-overlay__new-badge';
  newBadge.innerHTML = `<span>↓</span> 새 메시지`;
  newBadge.style.display = 'none';
  newBadge.setAttribute('aria-label', '새 메시지로 이동');
  newBadge.addEventListener('click', () => {
    scrollToBottom(true);
    newBadge.style.display = 'none';
    userScrolledUp = false;
  });
  el.appendChild(newBadge);

  /** @type {HTMLElement[]} */
  const msgNodes = [];
  let userScrolledUp = false;
  let _scrollPending = false;
  let _rafId = 0;

  // 버스트 push 시 scrollToBottom을 프레임당 1회로 합침(reflow 배칭)
  function scheduleScrollToBottom() {
    if (_scrollPending) return;
    _scrollPending = true;
    _rafId = requestAnimationFrame(() => {
      _scrollPending = false;
      _rafId = 0;
      if (!userScrolledUp) scrollToBottom();
    });
  }

  function isAtBottom() {
    return list.scrollTop + list.clientHeight >= list.scrollHeight - 48;
  }

  function scrollToBottom(smooth = false) {
    list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  }

  list.addEventListener('scroll', () => {
    userScrolledUp = !isAtBottom();
    if (!userScrolledUp) newBadge.style.display = 'none';
  }, { passive: true });

  /**
   * @param {ChatMsg} msg
   */
  function push({ userId, userName, message, system, isSeller }) {
    // 오래된 메시지 제거
    while (msgNodes.length >= MAX_MESSAGES) {
      const old = msgNodes.shift();
      old.remove();
    }

    const initial = (userName || userId || '?').charAt(0).toUpperCase();
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-overlay__msg' +
      (system ? ' is-system' : '') +
      (isSeller ? ' is-seller' : '');
    if (system) msgEl.dataset.system = '1';

    // 아바타: 시스템=📢, 셀러=🌾, 일반=이니셜
    const avatarContent = system ? '📢' : isSeller ? '🌾' : escapeHtml(initial);

    msgEl.innerHTML = `
      <div class="chat-overlay__avatar${isSeller ? ' chat-overlay__avatar--seller' : ''}">${avatarContent}</div>
      <div class="chat-overlay__bubble">
        <div class="chat-overlay__username">${isSeller ? '<span class="chat-overlay__seller-tag">판매자</span>' : ''}${escapeHtml(userName || userId || '알 수 없음')}</div>
        <div class="chat-overlay__text">${escapeHtml(message)}</div>
      </div>
    `;

    list.appendChild(msgEl);
    msgNodes.push(msgEl);

    if (!userScrolledUp) {
      scheduleScrollToBottom();
    } else {
      newBadge.style.display = 'flex';
    }
  }

  function destroy() {
    if (_rafId) cancelAnimationFrame(_rafId);
    _rafId = 0;
    _scrollPending = false;
    msgNodes.length = 0;
    el.remove();
  }

  function onSend(_cb) {}

  return { el, push, destroy, onSend };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
