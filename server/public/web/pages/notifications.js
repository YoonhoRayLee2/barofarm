/**
 * Notifications Page — 알림센터
 * Route: /app/notifications
 *
 * @module pages/notifications
 */

import { getNotifications, markNotificationRead, getMe } from '/app/scripts/api.js';
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate } from '/app/scripts/router.js';
import { escapeHtml } from '/app/scripts/dom.js';

const _cssId = 'page-css-notifications';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/notifications.css';
  document.head.appendChild(link);
}

/** 상대 시간 표시 ("3분 전", "2시간 전", "3일 전") */
function relativeTime(iso) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return '방금 전';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}시간 전`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}일 전`;
    return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export default async function load() {
  /* ── 현재 사용자 id 획득 ── */
  let userId = null;
  try {
    const stored = await getSecureItem('user');
    if (stored) {
      const parsed = JSON.parse(stored);
      userId = parsed && parsed.id;
    }
  } catch { /* ignore */ }
  if (!userId) {
    try {
      const me = await getMe();
      userId = me && me.id;
    } catch { /* ignore */ }
  }

  /* ── 페이지 루트 ── */
  const page = document.createElement('div');
  page.className = 'notif-page';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <header class="notif-header">
      <button class="notif-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="notif-header__title">알림</h1>
    </header>
    <div class="notif-list" id="notif-list">
      <div class="notif-loading">
        <div class="notif-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    </div>
  `;

  page.querySelector('.notif-header__back').addEventListener('click', () => window.history.back());

  const listEl = page.querySelector('#notif-list');

  /* ── 알림 목록 로드 ── */
  async function loadList() {
    if (!userId) {
      listEl.innerHTML = `
        <div class="notif-empty">
          <span class="notif-empty__icon">🔔</span>
          <span class="notif-empty__title">새 알림이 없어요</span>
        </div>
      `;
      return;
    }

    try {
      const data = await getNotifications(userId);
      const items = (data && data.items) || [];
      renderList(items);
    } catch {
      listEl.innerHTML = `
        <div class="notif-empty">
          <span class="notif-empty__icon">⚠️</span>
          <span class="notif-empty__title">알림을 불러올 수 없습니다</span>
        </div>
      `;
    }
  }

  /* ── 리스트 렌더 ── */
  function renderList(items) {
    if (!items.length) {
      listEl.innerHTML = `
        <div class="notif-empty">
          <span class="notif-empty__icon">🔔</span>
          <span class="notif-empty__title">새 알림이 없어요</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map(item => `
      <div class="notif-item ${item.isRead ? 'notif-item--read' : 'notif-item--unread'}"
           role="button" tabindex="0"
           data-id="${escapeHtml(String(item.id))}"
           data-link="${escapeHtml(item.link || '')}">
        <span class="notif-item__dot ${item.isRead ? 'notif-item__dot--hidden' : ''}"></span>
        <div class="notif-item__body">
          <div class="notif-item__title">${escapeHtml(item.title || '')}</div>
          ${item.body ? `<div class="notif-item__text">${escapeHtml(item.body)}</div>` : ''}
          <div class="notif-item__time">${relativeTime(item.createdAt)}</div>
        </div>
      </div>
    `).join('');

    /* 항목 클릭 핸들러 */
    listEl.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.dataset.id;
        const link = el.dataset.link;
        const wasRead = el.classList.contains('notif-item--read');

        /* 안읽음이면 읽음 처리 */
        if (!wasRead) {
          try {
            await markNotificationRead(id, userId);
          } catch { /* ignore — UI 갱신은 낙관적으로 */ }
          el.classList.remove('notif-item--unread');
          el.classList.add('notif-item--read');
          const dot = el.querySelector('.notif-item__dot');
          if (dot) dot.classList.add('notif-item__dot--hidden');
        }

        if (link) navigate(link);
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    });
  }

  loadList();
  return page;
}
