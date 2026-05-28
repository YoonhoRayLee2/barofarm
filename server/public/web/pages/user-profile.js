/**
 * User Profile Page — 상대방 프로필
 * Route: /app/user/:id
 */
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { personIconSVG } from '/app/scripts/person-icon.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';
import { formatPrice } from '/app/scripts/format.js';

const _cssId = 'page-css-user-profile';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId; link.rel = 'stylesheet';
  link.href = '/app/pages/user-profile.css';
  document.head.appendChild(link);
}

export default async function load(params) {
  const targetId = Number(params && params.id);
  if (!targetId) { showToast('잘못된 사용자입니다', { variant: 'error' }); await replace('/app/home'); return document.createElement('div'); }

  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let me;
  try { me = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const isMe = Number(me.id) === targetId;

  const page = document.createElement('div');
  page.className = 'up-page';
  page.dataset.theme = 'light';
  page.innerHTML = `
    <header class="up-header">
      <button class="up-back" aria-label="뒤로 가기">‹</button>
      <span class="up-header__name" id="up-name">...</span>
      ${!isMe ? `<button class="up-follow-btn up-follow-btn--loading" id="up-follow" disabled>...</button>` : '<span></span>'}
    </header>
    <div class="up-card">
      <div class="up-avatar" id="up-avatar">?</div>
      <div class="up-stats" id="up-stats">
        <div class="up-stat"><span class="up-stat__num" id="up-sales">—</span><span class="up-stat__label">판매</span></div>
        <div class="up-stat"><span class="up-stat__num" id="up-followers">—</span><span class="up-stat__label">팔로워</span></div>
        <div class="up-stat"><span class="up-stat__num" id="up-following">—</span><span class="up-stat__label">팔로잉</span></div>
      </div>
    </div>
    <div class="up-actions">
      ${!isMe ? `<button class="up-action-btn" id="up-msg">메시지 보내기</button>` : ''}
      <button class="up-action-btn up-action-btn--outline" id="up-badges">힛 · 배지 현황</button>
    </div>
    <div class="up-section-title">판매 완료</div>
    <div class="up-grid" id="up-grid">
      <div class="up-loading"><div class="up-loading__dot"></div><span>불러오는 중...</span></div>
    </div>
    <div class="up-cta">
      <button class="up-cta-btn" id="up-alert">이 딜러의 다음 라이브 알림받기</button>
    </div>
  `;

  page.querySelector('.up-back').addEventListener('click', () => window.history.back());
  page.querySelector('#up-badges').addEventListener('click', () => showToast('힛 · 배지 현황 — 준비 중', { duration: 1800 }));
  page.querySelector('#up-alert').addEventListener('click', () => showToast('알림 설정 — 준비 중', { duration: 1800 }));

  // 메시지 보내기
  const msgBtn = page.querySelector('#up-msg');
  if (msgBtn) {
    msgBtn.addEventListener('click', async () => {
      msgBtn.disabled = true;
      try {
        const res = await fetch('/api/chat-rooms/dm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: me.id, partnerId: targetId }),
        });
        if (!res.ok) throw new Error('failed');
        const { roomId } = await res.json();
        navigate('/app/chat-room/' + roomId);
      } catch {
        msgBtn.disabled = false;
        showToast('채팅방을 열 수 없습니다', { variant: 'error', duration: 2000 });
      }
    });
  }

  // 프로필 + 팔로우 상태 로드
  let isFollowing = false;
  try {
    const res = await fetch(`/api/users/${targetId}/public-profile?viewerId=${me.id}`);
    if (res.ok) {
      const profile = await res.json();
      page.querySelector('#up-name').textContent = profile.displayName || '사용자';
      page.querySelector('#up-sales').textContent = profile.salesCount ?? 0;
      page.querySelector('#up-followers').textContent = profile.followerCount ?? 0;
      page.querySelector('#up-following').textContent = profile.followingCount ?? 0;

      const avatarEl = page.querySelector('#up-avatar');
      if (profile.avatarUrl) {
        avatarEl.innerHTML = `<img class="up-avatar__img" src="${escapeAttr(profile.avatarUrl)}" alt="">`;
      } else {
        const initial = (profile.displayName || '?').charAt(0).toUpperCase();
        avatarEl.textContent = initial;
      }

      isFollowing = !!profile.isFollowing;
      updateFollowBtn(isFollowing);
    }
  } catch { /* non-critical */ }

  // 팔로우 버튼
  const followBtn = page.querySelector('#up-follow');
  if (followBtn) {
    updateFollowBtn(isFollowing);
    followBtn.addEventListener('click', async () => {
      followBtn.disabled = true;
      try {
        const method = isFollowing ? 'DELETE' : 'POST';
        const res = await fetch(`/api/users/${targetId}/follow`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followerId: me.id }),
        });
        if (!res.ok && res.status !== 409) throw new Error('failed');
        isFollowing = !isFollowing;
        updateFollowBtn(isFollowing);
        // 팔로워 카운트 갱신
        const followersEl = page.querySelector('#up-followers');
        if (followersEl) {
          const cur = Number(followersEl.textContent) || 0;
          followersEl.textContent = String(Math.max(0, cur + (isFollowing ? 1 : -1)));
        }
      } catch {
        showToast('처리에 실패했습니다', { duration: 2000 });
      } finally {
        followBtn.disabled = false;
      }
    });
  }

  function updateFollowBtn(following) {
    if (!followBtn) return;
    followBtn.textContent = following ? '팔로잉' : '팔로우';
    followBtn.className = 'up-follow-btn' + (following ? ' up-follow-btn--following' : '');
    followBtn.disabled = false;
  }

  // 판매 완료 목록
  loadSales();

  async function loadSales() {
    const gridEl = page.querySelector('#up-grid');
    try {
      const res = await fetch(`/api/users/${targetId}/sales`);
      if (!res.ok) throw new Error('failed');
      const list = await res.json();
      if (!list || list.length === 0) {
        gridEl.innerHTML = '<div class="up-empty">판매 완료 상품이 없습니다</div>';
        return;
      }
      gridEl.innerHTML = '';
      list.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'up-grid-item';
        const imgSrc = item.imageUrl;
        card.innerHTML = `
          <div class="up-grid-item__thumb">
            ${imgSrc ? `<img src="${escapeAttr(imgSrc)}" alt="${escapeHtml(item.productName)}" loading="lazy">` : `<span class="up-grid-item__fallback">🌿</span>`}
          </div>
          <div class="up-grid-item__name">${escapeHtml(item.productName || '상품')}</div>
          <div class="up-grid-item__price">${formatPrice(item.finalPrice)}</div>
        `;
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => navigate('/app/order-detail/' + item.auctionId));
        gridEl.appendChild(card);
      });
    } catch {
      gridEl.innerHTML = '<div class="up-empty">목록을 불러올 수 없습니다</div>';
    }
  }

  return page;
}

