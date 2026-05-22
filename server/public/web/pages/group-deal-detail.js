/**
 * Group Deal Detail Page — 공동구매 상세
 * Route: /app/group-deals/:id
 *
 * 구매자/판매자 시점별 액션 바 분기.
 * Socket.io 'group-deal:updated' 수신 → 진행바 실시간 갱신.
 *
 * @module pages/group-deal-detail
 */
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace, setCleanup } from '/app/scripts/router.js';
import * as Sock from '/app/scripts/socket.js';
import { showToast } from '/app/components/toast.js';
import { personIconSVG } from '/app/scripts/person-icon.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';

const _cssId = 'page-css-group-deal-detail';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/group-deal-detail.css';
  document.head.appendChild(link);
}

const CAT_EMOJI = {
  '과일': '🍎',
  '채소': '🥬',
  '수산': '🐟',
  '축산': '🥩',
  '곡물': '🌾',
  '기타': '🛒',
};

const STATUS_META = {
  recruiting:  { label: '모집중',     cls: 'gdd-status--info' },
  confirmed:   { label: '확정',       cls: 'gdd-status--accent' },
  shipped:     { label: '발송완료',   cls: 'gdd-status--accent' },
  cancelled:   { label: '취소됨',     cls: 'gdd-status--danger' },
  failed:      { label: '미성립',     cls: 'gdd-status--danger' },
  completed:   { label: '완료',       cls: 'gdd-status--accent' },
};

export default async function load(params) {
  const dealId = params && params.id;
  if (!dealId) {
    showToast('잘못된 요청입니다', { variant: 'error' });
    await replace('/app/group-deals');
    return document.createElement('div');
  }

  const stored = await getSecureItem('user');
  if (!stored) {
    await replace('/app/login');
    return document.createElement('div');
  }
  let user;
  try { user = JSON.parse(stored); }
  catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'gdd-page';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <header class="gdd-header">
      <button class="gdd-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="gdd-header__title">공동구매</h1>
      <button class="gdd-header__share" aria-label="공유">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"/>
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      </button>
    </header>
    <div class="gdd-scroll" id="gdd-scroll">
      <div class="gdd-loading"><div class="gdd-loading__dot"></div><span>불러오는 중...</span></div>
    </div>
    <div class="gdd-action-bar" id="gdd-action-bar" hidden></div>
  `;

  page.querySelector('.gdd-header__back').addEventListener('click', () => window.history.back());
  page.querySelector('.gdd-header__share').addEventListener('click', () => {
    const url = window.location.origin + '/app/group-deals/' + dealId;
    if (navigator.share) {
      navigator.share({ title: '바로팜 공동구매', url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('링크가 복사되었습니다', { variant: 'success' });
      }).catch(() => showToast('공유에 실패했습니다'));
    } else {
      showToast('공유 기능을 지원하지 않습니다');
    }
  });

  let dealData = null;
  let countdownTimer = null;

  async function loadDetail() {
    try {
      const res = await fetch(`/api/group-deals/${encodeURIComponent(dealId)}?viewerId=${encodeURIComponent(user.id)}`);
      if (!res.ok) throw new Error('failed');
      dealData = await res.json();
      renderDetail();
    } catch {
      page.querySelector('#gdd-scroll').innerHTML = `
        <div class="gdd-empty">
          <span class="gdd-empty__text">공동구매 정보를 불러올 수 없습니다</span>
          <button class="gdd-retry-btn" id="gdd-retry">다시 시도</button>
        </div>
      `;
      page.querySelector('#gdd-retry')?.addEventListener('click', loadDetail);
    }
  }

  function renderDetail() {
    const d = dealData;
    if (!d) return;
    const scrollEl = page.querySelector('#gdd-scroll');

    const isSeller = String(d.sellerId) === String(user.id);
    const cur = Number(d.currentParticipants || 0);
    const min = Number(d.minParticipants || 1);
    const pct = Math.min(100, Math.round((cur / min) * 100));
    const status = STATUS_META[d.status] || { label: d.status || '—', cls: '' };
    const emoji = CAT_EMOJI[d.category] || '🛒';

    const heroHtml = d.imageUrl
      ? `<img class="gdd-hero__img" src="${escapeAttr(d.imageUrl)}" alt="">`
      : `<div class="gdd-hero__fallback gdd-hero__fallback--${escapeAttr(d.category || '기타')}"><span>${emoji}</span></div>`;

    const sellerAvatarHtml = d.sellerAvatar
      ? `<img class="gdd-seller__avatar-img" src="${escapeAttr(d.sellerAvatar)}" alt="">`
      : `<span class="gdd-seller__avatar-initial">${personIconSVG(24)}</span>`;

    scrollEl.innerHTML = `
      <div class="gdd-hero">${heroHtml}</div>

      <div class="gdd-body">
        <div class="gdd-badges">
          <span class="gdd-cat-badge">${escapeHtml(d.category || '')}</span>
          <span class="gdd-status ${status.cls}">${escapeHtml(status.label)}</span>
        </div>

        <h1 class="gdd-title">${escapeHtml(d.title || '')}</h1>

        <p class="gdd-price">
          ${Number(d.pricePerUnit || 0).toLocaleString('ko-KR')}<span class="gdd-price__suffix">원 / ${escapeHtml(d.unitLabel || '개')}</span>
        </p>

        <section class="gdd-progress-section">
          <div class="gdd-progress-bar">
            <div class="gdd-progress-bar__fill" style="width:${pct}%" data-field="fill"></div>
          </div>
          <div class="gdd-progress-meta">
            <span class="gdd-progress-meta__count" data-field="count">
              <strong>${cur}명</strong> 참여 중 (목표 ${min}명)
            </span>
            <span class="gdd-progress-meta__time" data-field="time">${escapeHtml(formatCountdown(d.closesAt))}</span>
          </div>
        </section>

        <button class="gdd-seller" id="gdd-seller-link" type="button">
          <div class="gdd-seller__avatar">${sellerAvatarHtml}</div>
          <div class="gdd-seller__info">
            <span class="gdd-seller__name">${escapeHtml(d.sellerName || '판매자')}</span>
            <span class="gdd-seller__label">판매자 프로필 보기</span>
          </div>
          <span class="gdd-seller__arrow">›</span>
        </button>

        <section class="gdd-section">
          <h2 class="gdd-section__title">상품 설명</h2>
          <p class="gdd-desc">${escapeHtml(d.description || '설명이 없습니다.')}</p>
        </section>
      </div>
    `;

    scrollEl.querySelector('#gdd-seller-link').addEventListener('click', () => {
      if (d.sellerId) navigate('/app/user/' + d.sellerId);
    });

    renderActionBar(d, isSeller);
    startCountdown(d.closesAt);
  }

  function renderActionBar(d, isSeller) {
    const bar = page.querySelector('#gdd-action-bar');
    bar.innerHTML = '';

    const cur = Number(d.currentParticipants || 0);
    const min = Number(d.minParticipants || 1);
    const status = d.status;

    // 종료 상태들 → 액션 없음
    if (['cancelled', 'failed', 'completed', 'shipped'].includes(status)) {
      const meta = STATUS_META[status] || { label: status };
      bar.innerHTML = `<div class="gdd-action-bar__status">${escapeHtml(meta.label)} 상태입니다</div>`;
      bar.hidden = false;
      return;
    }

    if (isSeller) {
      if (status === 'recruiting') {
        const enough = cur >= min;
        bar.innerHTML = `
          <button class="gdd-action-btn gdd-action-btn--secondary" id="gdd-cancel-btn">취소</button>
          <button class="gdd-action-btn gdd-action-btn--primary" id="gdd-confirm-btn" ${enough ? '' : 'disabled'}>
            ${enough ? '확정하기' : `확정하기 (${min - cur}명 더 필요)`}
          </button>
        `;
        bar.querySelector('#gdd-confirm-btn').addEventListener('click', () => action('confirm', 'PATCH'));
        bar.querySelector('#gdd-cancel-btn').addEventListener('click', () => {
          if (!confirm('공동구매를 취소하시겠습니까?')) return;
          action('cancel', 'PATCH');
        });
      } else if (status === 'confirmed') {
        bar.innerHTML = `
          <button class="gdd-action-btn gdd-action-btn--primary" id="gdd-ship-btn">발송 완료</button>
        `;
        bar.querySelector('#gdd-ship-btn').addEventListener('click', () => action('ship', 'PATCH'));
      }
    } else {
      // 구매자 시점
      if (status === 'recruiting') {
        if (d.isParticipant) {
          bar.innerHTML = `
            <button class="gdd-action-btn gdd-action-btn--secondary" id="gdd-leave-btn">참여 취소</button>
          `;
          bar.querySelector('#gdd-leave-btn').addEventListener('click', () => leaveDeal());
        } else {
          // 최대 인원 제한 확인
          const maxP = d.maxParticipants ? Number(d.maxParticipants) : null;
          const isFull = maxP != null && cur >= maxP;
          bar.innerHTML = `
            <button class="gdd-action-btn gdd-action-btn--primary" id="gdd-join-btn" ${isFull ? 'disabled' : ''}>
              ${isFull ? '모집 마감' : '참여하기'}
            </button>
          `;
          if (!isFull) {
            bar.querySelector('#gdd-join-btn').addEventListener('click', () => joinDeal());
          }
        }
      } else if (status === 'confirmed') {
        bar.innerHTML = `<div class="gdd-action-bar__status">${d.isParticipant ? '확정된 공동구매입니다. 발송을 기다려주세요.' : '이미 마감된 공동구매입니다'}</div>`;
      }
    }
    bar.hidden = false;
  }

  async function joinDeal() {
    const btn = page.querySelector('#gdd-join-btn');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(`/api/group-deals/${encodeURIComponent(dealId)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId: user.id, quantity: 1 }),
      });
      if (!res.ok) {
        let err = {};
        try { err = await res.json(); } catch {}
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showToast('공동구매에 참여했습니다!', { variant: 'success' });
      await loadDetail();
    } catch (err) {
      if (btn) btn.disabled = false;
      showToast(err.message || '참여에 실패했습니다', { variant: 'error' });
    }
  }

  async function leaveDeal() {
    const btn = page.querySelector('#gdd-leave-btn');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(`/api/group-deals/${encodeURIComponent(dealId)}/join`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId: user.id }),
      });
      if (!res.ok) {
        let err = {};
        try { err = await res.json(); } catch {}
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      showToast('참여를 취소했습니다');
      await loadDetail();
    } catch (err) {
      if (btn) btn.disabled = false;
      showToast(err.message || '취소에 실패했습니다', { variant: 'error' });
    }
  }

  async function action(verb, method) {
    const btn = page.querySelector(`#gdd-${verb}-btn`);
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(`/api/group-deals/${encodeURIComponent(dealId)}/${verb}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sellerId: user.id }),
      });
      if (!res.ok) {
        let err = {};
        try { err = await res.json(); } catch {}
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const okMsg = {
        confirm: '공동구매가 확정되었습니다!',
        cancel:  '공동구매가 취소되었습니다',
        ship:    '발송 처리되었습니다',
      }[verb] || '처리되었습니다';
      showToast(okMsg, { variant: 'success' });
      await loadDetail();
    } catch (err) {
      if (btn) btn.disabled = false;
      showToast(err.message || '처리에 실패했습니다', { variant: 'error' });
    }
  }

  function startCountdown(closesAt) {
    if (countdownTimer) clearInterval(countdownTimer);
    if (!closesAt) return;
    const tick = () => {
      const timeEl = page.querySelector('[data-field="time"]');
      if (!timeEl) { clearInterval(countdownTimer); return; }
      timeEl.textContent = formatCountdown(closesAt);
    };
    countdownTimer = setInterval(tick, 1000);
  }

  // ── Socket.io ──
  const socket = Sock.connect();
  const onUpdated = (updated) => {
    if (!updated || String(updated.id) !== String(dealId)) return;
    // 부분 갱신 (전체 리로드 대신)
    if (dealData) {
      Object.assign(dealData, updated);
      const cur = Number(dealData.currentParticipants || 0);
      const min = Number(dealData.minParticipants || 1);
      const pct = Math.min(100, Math.round((cur / min) * 100));
      const fill = page.querySelector('[data-field="fill"]');
      const count = page.querySelector('[data-field="count"]');
      if (fill) fill.style.width = pct + '%';
      if (count) count.innerHTML = `<strong>${cur}명</strong> 참여 중 (목표 ${min}명)`;
      // 상태가 바뀌었으면 액션 바도 다시 그림
      const isSeller = String(dealData.sellerId) === String(user.id);
      renderActionBar(dealData, isSeller);
    }
  };
  socket.on('group-deal:updated', onUpdated);

  setCleanup(() => {
    if (countdownTimer) clearInterval(countdownTimer);
    socket.off('group-deal:updated', onUpdated);
    socket.disconnect();
  });

  await loadDetail();
  return page;
}

function formatCountdown(closesAt) {
  if (!closesAt) return '마감일 미정';
  const now = Date.now();
  const target = new Date(closesAt).getTime();
  if (!Number.isFinite(target)) return '마감일 미정';
  const diffMs = target - now;
  if (diffMs <= 0) return '마감되었습니다';

  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 24) {
    const h = Math.floor(diffMs / (1000 * 60 * 60));
    const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diffMs % (1000 * 60)) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} 남음`;
  }
  const diffD = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return `D-${diffD}`;
}

