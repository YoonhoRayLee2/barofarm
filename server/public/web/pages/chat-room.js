/**
 * Chat Room Page — individual community chat
 * Route: /app/chat-room/:id
 *
 * @module pages/chat-room
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace, setCleanup } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { connect } from '/app/scripts/socket.js';

// Inject CSS once
const _cssId = 'page-css-chat-room';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/chat-room.css';
  document.head.appendChild(link);
}

const SAME_USER_GROUP_MS = 60 * 1000; // 1 minute window for collapsed messages

/**
 * @param {{ id: string }} params
 * @returns {Promise<HTMLElement>}
 */
export default async function load(params) {
  const roomId = Number(params.id);
  if (!roomId) {
    showToast('잘못된 채팅방 입니다', { variant: 'error' });
    await replace('/app/chat');
    return document.createElement('div');
  }

  // Auth guard
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); }
  catch { await replace('/app/login'); return document.createElement('div'); }

  /* ---------------- DOM scaffold ---------------- */
  const page = document.createElement('div');
  page.className = 'cr-page';
  page.dataset.theme = 'light';
  page.innerHTML = `
    <header class="cr-header">
      <button class="cr-icon-btn cr-back" aria-label="뒤로 가기">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <div class="cr-header__avatar" id="cr-header-avatar">?</div>
      <div class="cr-header__info">
        <span class="cr-header__name" id="cr-header-name">채팅방</span>
        <span class="cr-header__members" id="cr-header-members"></span>
      </div>
      <div class="cr-header__actions">
        <button class="cr-icon-btn" id="cr-bell" aria-label="알림">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.7 21a2 2 0 01-3.4 0"/>
          </svg>
        </button>
        <button class="cr-icon-btn" id="cr-menu" aria-label="메뉴">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>
    </header>

    <div class="cr-messages" id="cr-messages" aria-live="polite">
      <div class="cr-loading">
        <div class="cr-loading__dot"></div>
        <span>불러오는 중...</span>
      </div>
    </div>

    <form class="cr-input-bar" id="cr-form" autocomplete="off">
      <textarea
        class="cr-input"
        id="cr-input"
        rows="1"
        placeholder="메시지를 입력해 주세요"
      ></textarea>
      <button class="cr-send-btn" id="cr-send" type="submit" aria-label="전송">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none"/>
        </svg>
      </button>
    </form>
  `;

  const messagesEl = page.querySelector('#cr-messages');
  const formEl = page.querySelector('#cr-form');
  const inputEl = page.querySelector('#cr-input');
  const sendBtn = page.querySelector('#cr-send');
  const headerNameEl = page.querySelector('#cr-header-name');
  const headerMembersEl = page.querySelector('#cr-header-members');
  const headerAvatarEl = page.querySelector('#cr-header-avatar');

  page.querySelector('.cr-back').addEventListener('click', () => window.history.back());
  page.querySelector('#cr-bell').addEventListener('click', () => {
    showToast('알림 설정 — 준비 중', { variant: 'info' });
  });

  /* ---------------- State ---------------- */
  const seenIds = new Set();
  /** @type {{ id?: number, userId: number, userName: string, avatarUrl?: string|null, message: string, createdAt: string|number }[]} */
  const messages = [];
  let memberCount = 0;

  /* ---------------- Header info (best-effort) ---------------- */
  fetchRoomMeta(roomId, user.id).then((room) => {
    if (!room) return;
    const displayName = room.isDm ? (room.dmPartnerName || room.name || '채팅') : (room.name || '채팅');
    const displayAvatar = room.isDm ? room.dmPartnerAvatarUrl : room.avatarUrl;

    headerNameEl.textContent = displayName;
    headerAvatarEl.textContent = displayName.trim().charAt(0).toUpperCase();
    if (displayAvatar) {
      headerAvatarEl.innerHTML = `<img class="cr-header__avatar-img" src="${escapeAttr(displayAvatar)}" alt="">`;
    }
    memberCount = Number(room.memberCount) || 0;
    headerMembersEl.textContent = memberCount > 0 ? `${memberCount}명` : '';

    // DM 룸이면 ≡ 메뉴 버튼 숨김
    if (room.isDm) {
      const menuBtn = page.querySelector('#cr-menu');
      if (menuBtn) menuBtn.style.display = 'none';
    }

    // 그룹 룸이면 메뉴 패널 초기화
    if (!room.isDm) {
      initMenuPanel(room);
    }
  }).catch(() => { /* non-critical */ });

  function initMenuPanel(room) {
    const menuBtn = page.querySelector('#cr-menu');
    if (!menuBtn) return;

    // 패널 DOM 생성
    const overlay = document.createElement('div');
    overlay.className = 'cr-menu-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:199;background:rgba(0,0,0,0.4);opacity:0;pointer-events:none;transition:opacity 0.25s;';

    const panel = document.createElement('div');
    panel.className = 'cr-menu-panel';
    panel.style.cssText = 'position:fixed;top:0;right:0;height:100%;width:80%;max-width:360px;z-index:200;background:var(--color-surface);transform:translateX(100%);transition:transform 0.25s;display:flex;flex-direction:column;';
    panel.innerHTML = `
      <div class="cr-menu-panel__header" style="display:flex;align-items:center;gap:12px;padding:16px;border-bottom:1px solid var(--color-border);">
        <button class="cr-menu-panel__close" aria-label="닫기" style="background:none;border:none;cursor:pointer;color:var(--color-text-secondary);font-size:20px;line-height:1;padding:4px;">✕</button>
        <span style="font-weight:600;font-size:15px;color:var(--color-text-primary);">${escapeHtml(room.name || '채팅방')}</span>
      </div>
      <div class="cr-menu-panel__sub" id="cr-menu-sub" style="padding:10px 16px;font-size:12px;color:var(--color-text-secondary);border-bottom:1px solid var(--color-border);"></div>
      <div class="cr-menu-panel__list" id="cr-menu-list" style="flex:1;overflow-y:auto;padding:8px 0;">
        <div style="padding:20px;text-align:center;color:var(--color-text-secondary);">불러오는 중...</div>
      </div>
      <div style="padding:12px 16px;border-top:1px solid var(--color-border);">
        <button id="cr-share-btn" style="width:100%;padding:13px;background:var(--color-accent);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">오픈 채팅방 공유하기</button>
      </div>
    `;
    page.appendChild(overlay);
    page.appendChild(panel);

    const openPanel = async () => {
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';
      panel.style.transform = 'translateX(0)';

      // 개설일 + 멤버 수
      const subEl = panel.querySelector('#cr-menu-sub');
      if (subEl) {
        const dateStr = room.createdAt ? new Date(room.createdAt).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' }) : '—';
        subEl.textContent = `개설일 ${dateStr} / ${room.memberCount || 0}명 참여 중`;
      }

      // 멤버 목록 로드
      const listEl = panel.querySelector('#cr-menu-list');
      try {
        const res = await fetch(`/api/chat-rooms/${roomId}/members`);
        if (!res.ok) throw new Error('failed');
        const members = await res.json();
        if (!listEl) return;
        listEl.innerHTML = '';
        members.forEach((m) => {
          const item = document.createElement('div');
          item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 16px;';
          const avatarHtml = m.avatarUrl
            ? `<img src="${escapeAttr(m.avatarUrl)}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">`
            : `<div style="width:40px;height:40px;border-radius:50%;background:var(--color-accent-soft);display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--color-accent);">${escapeHtml((m.displayName || '?').charAt(0).toUpperCase())}</div>`;
          const isMe = Number(m.userId) === Number(user.id);
          const followBtn = isMe ? '' : `<button data-uid="${m.userId}" style="margin-left:auto;padding:5px 12px;border:1.5px solid var(--color-accent);border-radius:20px;background:none;color:var(--color-accent);font-size:12px;font-weight:600;cursor:pointer;">팔로우</button>`;
          item.innerHTML = `${avatarHtml}<span style="font-size:14px;color:var(--color-text-primary);font-weight:${m.isCreator ? '700' : '400'};">${escapeHtml(m.displayName)}</span>${followBtn}`;
          // 팔로우 버튼 클릭 → 상대방 프로필 페이지
          const btn = item.querySelector('button[data-uid]');
          if (btn) {
            btn.addEventListener('click', () => {
              closePanel();
              import('/app/scripts/router.js').then(mod => mod.navigate('/app/user/' + m.userId));
            });
          }
          listEl.appendChild(item);
        });
      } catch {
        if (listEl) listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--color-text-secondary);">멤버 목록을 불러오지 못했습니다</div>';
      }
    };

    const closePanel = () => {
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      panel.style.transform = 'translateX(100%)';
    };

    menuBtn.addEventListener('click', openPanel);
    overlay.addEventListener('click', closePanel);
    panel.querySelector('.cr-menu-panel__close').addEventListener('click', closePanel);
    panel.querySelector('#cr-share-btn').addEventListener('click', () => {
      const url = location.origin + '/app/chat-room/' + roomId;
      navigator.clipboard.writeText(url).then(() => {
        import('/app/components/toast.js').then(m => m.showToast('링크가 복사되었습니다', { variant: 'success', duration: 1600 }));
      }).catch(() => {
        import('/app/components/toast.js').then(m => m.showToast('링크: ' + url, { duration: 2400 }));
      });
    });
  }

  /* ---------------- Load messages ---------------- */
  try {
    const res = await fetch(`/api/chat-rooms/${roomId}/messages?limit=50`);
    if (!res.ok) throw new Error('failed');
    const list = await res.json();
    messagesEl.innerHTML = '';
    list.forEach((m) => {
      seenIds.add(m.id);
      messages.push(m);
    });
    renderAllMessages();
  } catch {
    messagesEl.innerHTML = `
      <div class="cr-empty">
        <span>메시지를 불러오지 못했습니다</span>
      </div>
    `;
  }

  /* ---------------- Mark read ---------------- */
  fetch(`/api/chat-rooms/${roomId}/read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id }),
  }).catch(() => { /* non-critical */ });

  /* ---------------- Socket ---------------- */
  let socket;
  try {
    socket = connect();
  } catch (err) {
    console.error('[chat-room] socket connect failed', err);
    showToast('실시간 연결에 실패했습니다', { variant: 'error' });
  }

  if (socket) {
    socket.on('connect', () => {
      socket.emit('cr:join', {
        roomId,
        userId: user.id,
        userName: user.nickname || user.name || '익명',
      });
    });

    socket.on('cr:message', (msg) => {
      if (!msg || msg.roomId !== roomId) return;
      if (msg.id != null && seenIds.has(msg.id)) return;
      if (msg.id != null) seenIds.add(msg.id);
      messages.push(msg);
      appendMessage(msg);
      scrollToBottom();
    });

    socket.on('cr:member_count', ({ roomId: rid, memberCount: mc }) => {
      if (rid !== roomId) return;
      memberCount = mc;
      headerMembersEl.textContent = mc > 0 ? `${mc}명` : '';
    });

    socket.on('cr:error', (err) => {
      showToast(err?.message || '메시지 전송에 실패했습니다', { variant: 'error' });
    });
  }

  /* ---------------- Keyboard / visualViewport ---------------- */
  // interactive-widget=resizes-visual 덕에 레이아웃은 고정, 키보드가 오버레이됨.
  // visualViewport resize 시 page를 위로 올려 입력바가 키보드 위에 놓이도록 함.
  const vv = window.visualViewport;
  const onVVResize = () => {
    // Android(WebView 리사이즈): _appLockedH - innerHeight = 키보드 높이
    // iOS / resizes-visual: innerHeight - vv.height = 키보드 높이
    const byResize = Math.max(0, (window._appLockedH || window.innerHeight) - window.innerHeight);
    const byVV     = vv ? Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0)) : 0;
    const kbH = Math.max(byResize, byVV);
    page.style.transform = kbH > 50 ? `translateY(-${kbH}px)` : '';
    if (kbH > 50) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  };
  if (vv) {
    vv.addEventListener('resize', onVVResize);
    vv.addEventListener('scroll', onVVResize);
  }

  /* ---------------- Cleanup ---------------- */
  setCleanup(() => {
    if (vv) {
      vv.removeEventListener('resize', onVVResize);
      vv.removeEventListener('scroll', onVVResize);
    }
    page.style.transform = '';
    if (socket) {
      try { socket.emit('cr:leave', { roomId }); } catch {}
      try { socket.disconnect(); } catch {}
    }
  });

  /* ---------------- Send ---------------- */
  const doSend = () => {
    const text = inputEl.value.trim();
    if (!text) return;
    if (!socket || !socket.connected) {
      showToast('연결 중입니다. 잠시 후 다시 시도해 주세요', { variant: 'error' });
      return;
    }
    socket.emit('cr:send', {
      roomId,
      userId: user.id,
      message: text,
    });
    inputEl.value = '';
    autoSize(inputEl);
  };

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    doSend();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      doSend();
    }
  });

  inputEl.addEventListener('input', () => autoSize(inputEl));

  /* ---------------- Renderers ---------------- */

  function renderAllMessages() {
    messagesEl.innerHTML = '';
    let prev = null;
    messages.forEach((m) => {
      appendMessage(m, prev);
      prev = m;
    });
    // initial scroll
    scrollToBottom(false);
  }

  function appendMessage(msg, prevOverride) {
    const isMe = Number(msg.userId) === Number(user.id);
    const prev = prevOverride !== undefined
      ? prevOverride
      : (messages.length >= 2 ? messages[messages.length - 2] : null);

    const grouped = isGrouped(prev, msg);

    const row = document.createElement('div');
    row.className = 'cr-msg' + (isMe ? ' cr-msg--me' : ' cr-msg--other') + (grouped ? ' is-grouped' : '');

    if (isMe) {
      row.innerHTML = `
        ${grouped ? '' : `<span class="cr-msg__time">${formatTime(msg.createdAt)}</span>`}
        <div class="cr-msg__bubble">${escapeHtml(msg.message)}</div>
      `;
    } else {
      row.innerHTML = `
        ${grouped
          ? `<div class="cr-msg__avatar cr-msg__avatar--ghost"></div>`
          : renderAvatar(msg)}
        <div class="cr-msg__col">
          ${grouped ? '' : `
            <div class="cr-msg__meta">
              <span class="cr-msg__name">${escapeHtml(msg.userName || '익명')}</span>
              <span class="cr-msg__time">${formatTime(msg.createdAt)}</span>
            </div>
          `}
          <div class="cr-msg__bubble">${escapeHtml(msg.message)}</div>
        </div>
      `;
    }

    messagesEl.appendChild(row);

    // 상대방 메시지: 아바타 + 이름 클릭 → 프로필 페이지
    if (!isMe && !grouped && msg.userId) {
      const goProfile = () => import('/app/scripts/router.js').then(m => m.navigate('/app/user/' + msg.userId));
      const avatarEl = row.querySelector('.cr-msg__avatar');
      const nameEl   = row.querySelector('.cr-msg__name');
      if (avatarEl) { avatarEl.style.cursor = 'pointer'; avatarEl.addEventListener('click', goProfile); }
      if (nameEl)   { nameEl.style.cursor   = 'pointer'; nameEl.addEventListener('click', goProfile); }
    }
  }

  function isGrouped(prev, curr) {
    if (!prev) return false;
    if (Number(prev.userId) !== Number(curr.userId)) return false;
    const pt = new Date(prev.createdAt).getTime();
    const ct = new Date(curr.createdAt).getTime();
    if (!pt || !ct) return false;
    return Math.abs(ct - pt) <= SAME_USER_GROUP_MS;
  }

  function scrollToBottom(smooth = true) {
    requestAnimationFrame(() => {
      messagesEl.scrollTo({
        top: messagesEl.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    });
  }

  return page;
}

/* ----------------------------------------------------------------------
 *  Helpers
 * ---------------------------------------------------------------------- */

async function fetchRoomMeta(roomId, viewerId) {
  try {
    const res = await fetch(`/api/chat-rooms/${roomId}?viewerId=${viewerId}`);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

function renderAvatar(msg) {
  if (msg.avatarUrl) {
    return `<img class="cr-msg__avatar cr-msg__avatar--img" src="${escapeAttr(msg.avatarUrl)}" alt="">`;
  }
  const initial = (msg.userName || '?').trim().charAt(0).toUpperCase();
  return `<div class="cr-msg__avatar">${escapeHtml(initial)}</div>`;
}

function autoSize(el) {
  el.style.height = 'auto';
  const max = 96;
  el.style.height = Math.min(el.scrollHeight, max) + 'px';
}

function formatTime(isoOrSql) {
  if (!isoOrSql) return '';
  const t = new Date(isoOrSql).getTime();
  if (!t || Number.isNaN(t)) return '';
  const d = new Date(t);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const period = h < 12 ? '오전' : '오후';
  if (h === 0) h = 12;
  else if (h > 12) h = h - 12;
  return `${period} ${h}:${m}`;
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
