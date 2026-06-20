/**
 * Community / Chat Hub Page
 * Two tabs: "참여 중인 채팅" (joined) and "모든 채팅방" (all rooms)
 * Plus a "방 만들기" overlay form.
 *
 * @module pages/chat
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';
import { showToast } from '/app/components/toast.js';

// Inject CSS once
const _cssId = 'page-css-chat';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/chat.css';
  document.head.appendChild(link);
}

const TABS = [
  { id: 'mine', label: '참여 중인 채팅' },
  { id: 'all',  label: '모든 채팅방'   },
];

/**
 * @returns {Promise<HTMLElement>}
 */
export default async function load() {
  // Auth guard
  const stored = await getSecureItem('user');
  if (!stored) {
    await replace('/app/login');
    return document.createElement('div');
  }
  /** @type {{ id: number, nickname: string }} */
  let user;
  try { user = JSON.parse(stored); }
  catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'ch-page';
  page.dataset.theme = 'light';

  /* ---------------- Header ---------------- */
  const header = document.createElement('header');
  header.className = 'ch-header';
  header.innerHTML = `
    <h1 class="ch-header__title">커뮤니티</h1>
    <div class="ch-header__actions">
      <button class="ch-icon-btn" id="ch-create-btn" aria-label="채팅방 만들기">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  `;
  page.appendChild(header);

  /* ---------------- Tab bar ---------------- */
  let activeTab = 'mine';
  const tabbar = document.createElement('div');
  tabbar.className = 'ch-tabs';
  TABS.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'ch-tab' + (t.id === activeTab ? ' is-active' : '');
    btn.dataset.tab = t.id;
    btn.textContent = t.label;
    btn.addEventListener('click', () => {
      if (activeTab === t.id) return;
      activeTab = t.id;
      tabbar.querySelectorAll('.ch-tab').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.tab === t.id);
      });
      loadTab(activeTab);
    });
    tabbar.appendChild(btn);
  });
  page.appendChild(tabbar);

  /* ---------------- Content area ---------------- */
  const content = document.createElement('div');
  content.className = 'ch-content';
  page.appendChild(content);

  /* ---------------- Bottom nav ---------------- */
  page.appendChild(createTabSpacer());
  page.appendChild(createBottomTabBar({ activeTab: 'chat' }));

  /* ---------------- Header actions ---------------- */
  header.querySelector('#ch-create-btn').addEventListener('click', () => {
    openCreateOverlay(page, user, async (newRoom) => {
      // After creation: switch to "mine" tab and navigate into the room
      activeTab = 'mine';
      tabbar.querySelectorAll('.ch-tab').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.tab === 'mine');
      });
      await navigate('/app/chat-room/' + newRoom.id);
    });
  });
  /* ---------------- Initial load ---------------- */
  loadTab(activeTab);

  /**
   * Render the active tab into the content container.
   * @param {string} tabId
   */
  async function loadTab(tabId) {
    content.innerHTML = `
      <div class="ch-loading">
        <div class="ch-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    `;
    if (tabId === 'mine') {
      await renderMine(content, user);
    } else {
      await renderAll(content, user);
    }
  }

  return page;
}

/* =========================================================================
 *  Tab: 참여 중인 채팅
 * ========================================================================= */

async function renderMine(container, user) {
  let rooms = [];
  try {
    const res = await fetch(`/api/chat-rooms/mine?userId=${encodeURIComponent(user.id)}&type=group`);
    if (!res.ok) throw new Error('failed');
    rooms = await res.json();
  } catch (err) {
    container.innerHTML = `
      <div class="ch-empty">
        <span class="ch-empty__title">불러오기에 실패했습니다</span>
        <span class="ch-empty__desc">잠시 후 다시 시도해 주세요.</span>
      </div>
    `;
    return;
  }

  if (!rooms.length) {
    container.innerHTML = `
      <div class="ch-empty">
        <span class="ch-empty__title">참여 중인 채팅방이 없습니다</span>
        <span class="ch-empty__desc">채팅방에 참여해 보세요.</span>
        <button class="ch-empty__cta" id="ch-empty-cta">채팅방 둘러보기</button>
      </div>
    `;
    container.querySelector('#ch-empty-cta').addEventListener('click', () => {
      // Switch to "all" tab — programmatic click on the parent tab button
      const allTab = document.querySelector('.ch-tabs .ch-tab[data-tab="all"]');
      if (allTab) allTab.click();
    });
    return;
  }

  const list = document.createElement('div');
  list.className = 'ch-list';

  rooms.forEach((room) => {
    const item = document.createElement('div');
    item.className = 'ch-room-item';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.innerHTML = `
      ${renderAvatar(room)}
      <div class="ch-room-body">
        <div class="ch-room-line1">
          <span class="ch-room-name">${escapeHtml(room.name)}</span>
          ${room.unreadCount > 0
            ? `<span class="ch-unread-badge">${room.unreadCount > 99 ? '99+' : room.unreadCount}</span>`
            : ''}
          <span class="ch-room-members">${room.memberCount}명</span>
        </div>
        <div class="ch-room-line2">
          <span class="ch-room-last-msg">${room.lastMessage ? escapeHtml(room.lastMessage) : '대화가 없습니다'}</span>
          <span class="ch-room-time">${formatTimeAgo(room.lastMessageAt)}</span>
        </div>
      </div>
    `;

    item.addEventListener('click', () => {
      navigate('/app/chat-room/' + room.id);
    });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate('/app/chat-room/' + room.id);
      }
    });
    list.appendChild(item);
  });

  container.innerHTML = '';
  container.appendChild(list);
}

/* =========================================================================
 *  Tab: 모든 채팅방
 * ========================================================================= */

async function renderAll(container, user) {
  // Search bar + list slot
  container.innerHTML = `
    <div class="ch-search-wrap">
      <span class="ch-search-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="11" cy="11" r="7"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </span>
      <input
        class="ch-search"
        id="ch-search"
        type="search"
        placeholder="채팅방 검색(2자 이상 입력)"
        autocomplete="off"
        spellcheck="false"
      />
    </div>
    <div class="ch-list" id="ch-all-list"></div>
  `;

  const searchEl = container.querySelector('#ch-search');
  const listEl = container.querySelector('#ch-all-list');

  let myRoomIds = new Set();
  try {
    const r = await fetch(`/api/chat-rooms/mine?userId=${encodeURIComponent(user.id)}&type=group`);
    if (r.ok) {
      const mine = await r.json();
      myRoomIds = new Set(mine.map((m) => m.id));
    }
  } catch {
    // non-critical: proceed with empty set
  }

  let debounceTimer = null;
  const fetchAndRender = async (search = '') => {
    listEl.innerHTML = `
      <div class="ch-loading">
        <div class="ch-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    `;
    try {
      const url = search.length >= 2
        ? `/api/chat-rooms?search=${encodeURIComponent(search)}`
        : '/api/chat-rooms';
      const res = await fetch(url);
      if (!res.ok) throw new Error('failed');
      const rooms = await res.json();
      renderAllList(listEl, rooms, user, myRoomIds);
    } catch {
      listEl.innerHTML = `
        <div class="ch-empty">
          <span class="ch-empty__title">불러오기에 실패했습니다</span>
        </div>
      `;
    }
  };

  searchEl.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const v = searchEl.value.trim();
    debounceTimer = setTimeout(() => fetchAndRender(v), 300);
  });

  // Initial load — no search
  fetchAndRender('');
}

function renderAllList(listEl, rooms, user, myRoomIds) {
  if (!rooms.length) {
    listEl.innerHTML = `
      <div class="ch-empty">
        <span class="ch-empty__title">검색 결과가 없습니다</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = '';
  rooms.forEach((room) => {
    const joined = myRoomIds.has(room.id);

    const item = document.createElement('div');
    item.className = 'ch-room-item';
    item.innerHTML = `
      ${renderAvatar(room)}
      <div class="ch-room-body">
        <div class="ch-room-line1">
          <span class="ch-room-name">${escapeHtml(room.name)}</span>
        </div>
        <div class="ch-room-line2">
          <span class="ch-room-members">${room.memberCount}명</span>
          ${room.lastMessageAt
            ? `<span class="ch-room-time">${formatTimeAgo(room.lastMessageAt)}</span>`
            : ''}
        </div>
      </div>
      ${joined
        ? `<span class="ch-joined-label">참여중</span>`
        : `<button class="ch-join-btn" data-room-id="${room.id}">참여</button>`}
    `;

    if (joined) {
      // Already joined — clicking the row enters the room
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => navigate('/app/chat-room/' + room.id));
    } else {
      const joinBtn = item.querySelector('.ch-join-btn');
      joinBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        joinBtn.disabled = true;
        joinBtn.textContent = '참여 중...';
        try {
          const res = await fetch(`/api/chat-rooms/${room.id}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          });
          if (!res.ok && res.status !== 409) throw new Error('failed');
          myRoomIds.add(room.id);
          await navigate('/app/chat-room/' + room.id);
        } catch {
          joinBtn.disabled = false;
          joinBtn.textContent = '참여';
          showToast('참여에 실패했습니다', { variant: 'error' });
        }
      });
    }

    listEl.appendChild(item);
  });
}

/* =========================================================================
 *  Create-room overlay
 * ========================================================================= */

function openCreateOverlay(page, user, onCreated) {
  // Avoid duplicate overlays
  if (page.querySelector('.ch-create-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'ch-create-overlay';
  overlay.innerHTML = `
    <div class="ch-create-card" role="dialog" aria-label="채팅방 만들기">
      <h2 class="ch-create-title">채팅방 만들기</h2>
      <label class="ch-create-label" for="ch-create-name">방 이름</label>
      <input
        class="ch-create-input"
        id="ch-create-name"
        type="text"
        placeholder="예) 사과 농가 모임"
        maxlength="40"
      />
      <div class="ch-create-actions">
        <button class="ch-create-cancel" type="button">취소</button>
        <button class="ch-create-submit" type="button">만들기</button>
      </div>
    </div>
  `;

  const close = () => overlay.remove();

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.ch-create-cancel').addEventListener('click', close);

  const input = overlay.querySelector('#ch-create-name');
  const submit = overlay.querySelector('.ch-create-submit');

  const doSubmit = async () => {
    const name = input.value.trim();
    if (!name) {
      showToast('방 이름을 입력해 주세요', { variant: 'error' });
      input.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = '만드는 중...';
    try {
      const res = await fetch('/api/chat-rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, createdBy: user.id }),
      });
      if (!res.ok) throw new Error('failed');
      const room = await res.json();
      close();
      if (typeof onCreated === 'function') await onCreated(room);
    } catch {
      submit.disabled = false;
      submit.textContent = '만들기';
      showToast('채팅방 생성에 실패했습니다', { variant: 'error' });
    }
  };

  submit.addEventListener('click', doSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSubmit();
    } else if (e.key === 'Escape') {
      close();
    }
  });

  page.appendChild(overlay);
  setTimeout(() => input.focus(), 50);
}

/* =========================================================================
 *  Helpers
 * ========================================================================= */

function renderAvatar(room) {
  if (room.avatarUrl) {
    return `<img class="ch-room-avatar ch-room-avatar--img" src="${escapeAttr(room.avatarUrl)}" alt="">`;
  }
  const initial = (room.name || '?').trim().charAt(0).toUpperCase();
  return `<div class="ch-room-avatar">${escapeHtml(initial)}</div>`;
}

function formatTimeAgo(isoOrSql) {
  if (!isoOrSql) return '';
  const t = new Date(isoOrSql).getTime();
  if (!t || Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  const dt = new Date(t);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}
