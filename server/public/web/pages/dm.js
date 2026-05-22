/**
 * DM List Page — 상품 문의 채팅 목록
 * Route: /app/dm
 */
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { personIconSVG } from '/app/scripts/person-icon.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';

const _cssId = 'page-css-dm';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId; link.rel = 'stylesheet';
  link.href = '/app/pages/dm.css';
  document.head.appendChild(link);
}

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'dm-page';
  page.dataset.theme = 'light';
  page.innerHTML = `
    <header class="dm-header">
      <button class="dm-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="dm-header__title">상품 문의 채팅</h1>
    </header>
    <div class="dm-content" id="dm-content">
      <div class="dm-loading"><div class="dm-loading__dot"></div><span>불러오는 중...</span></div>
    </div>
  `;
  page.querySelector('.dm-header__back').addEventListener('click', () => window.history.back());

  async function loadList() {
    const el = page.querySelector('#dm-content');
    el.innerHTML = '<div class="dm-loading"><div class="dm-loading__dot"></div><span>불러오는 중...</span></div>';
    try {
      const res = await fetch(`/api/chat-rooms/mine?userId=${encodeURIComponent(user.id)}&type=dm`);
      if (!res.ok) throw new Error('failed');
      const list = await res.json();
      renderList(el, list);
    } catch {
      el.innerHTML = `<div class="dm-empty"><span class="dm-empty__icon">⚠️</span><span>불러오지 못했습니다</span><button id="dm-retry">다시 시도</button></div>`;
      el.querySelector('#dm-retry').addEventListener('click', loadList);
    }
  }

  function renderList(container, list) {
    if (!list || list.length === 0) {
      container.innerHTML = `<div class="dm-empty"><span class="dm-empty__icon">💬</span><span class="dm-empty__title">아직 문의 채팅이 없습니다</span><span class="dm-empty__desc">상대방 프로필에서<br>"메시지 보내기"로 시작하세요.</span></div>`;
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'dm-list';
    list.forEach((room) => {
      const li = document.createElement('li');
      li.className = 'dm-item';
      const avatarHtml = room.avatarUrl
        ? `<img class="dm-item__avatar-img" src="${escapeAttr(room.avatarUrl)}" alt="">`
        : `<div class="dm-item__avatar-initial">${personIconSVG(28)}</div>`;
      const unread = room.unreadCount > 0 ? `<span class="dm-item__unread">${room.unreadCount > 99 ? '99+' : room.unreadCount}</span>` : '';
      const timeStr = room.lastMessageAt ? formatTime(room.lastMessageAt) : '';
      li.innerHTML = `
        <div class="dm-item__avatar">${avatarHtml}</div>
        <div class="dm-item__body">
          <div class="dm-item__row">
            <span class="dm-item__name">${escapeHtml(room.name)}</span>
            <span class="dm-item__time">${timeStr}</span>
          </div>
          <div class="dm-item__row">
            <span class="dm-item__last">${escapeHtml(room.lastMessage || '')}</span>
            ${unread}
          </div>
        </div>
      `;
      li.addEventListener('click', () => navigate('/app/chat-room/' + room.id));
      ul.appendChild(li);
    });
    container.innerHTML = '';
    container.appendChild(ul);
  }

  loadList();
  return page;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    let h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
    return `${h < 12 ? '오전' : '오후'} ${h > 12 ? h - 12 : h || 12}:${m}`;
  }
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

