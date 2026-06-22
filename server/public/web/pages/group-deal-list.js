/**
 * Group Deal List Page — 공동구매 목록
 * Route: /app/group-deals
 *
 * Query params:
 *   ?mine=true  → 본인이 참여/개설한 공구만 보기 (헤더 타이틀 변경)
 *
 * Socket.io: 'group-deal:updated' 수신 → 카드의 진행바·참여자수 부분 갱신
 *
 * @module pages/group-deal-list
 */
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace, setCleanup } from '/app/scripts/router.js';
import * as Sock from '/app/scripts/socket.js';
import { thumbFallback } from '/app/components/brand-assets.js';
import { showToast } from '/app/components/toast.js';
import { escapeHtml, escapeAttr } from '/app/scripts/dom.js';

const _cssId = 'page-css-group-deal-list';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/group-deal-list.css';
  document.head.appendChild(link);
}

const CATEGORIES = ['전체', '과일', '채소', '수산', '축산', '곡물', '기타'];

const CAT_EMOJI = {
  '과일': '🍎',
  '채소': '🥬',
  '수산': '🐟',
  '축산': '🥩',
  '곡물': '🌾',
  '기타': '🛒',
};

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) {
    await replace('/app/login');
    return document.createElement('div');
  }
  let user;
  try {
    user = JSON.parse(stored);
  } catch {
    await replace('/app/login');
    return document.createElement('div');
  }

  // ── Query param 처리 ──
  const search = new URLSearchParams(window.location.search);
  const isMineView = search.get('mine') === 'true';

  // ── 판매자 여부 휴리스틱 (FAB 노출용) ──
  // barofarm 데이터 모델엔 명시적 role 필드가 없으므로,
  // 계좌 인증을 마친 사용자(=판매 가능 상태)에게 FAB 노출.
  // 인증 정보가 비어있으면 보수적으로 모두에게 노출.
  const isSeller =
    user.bankVerifiedAt != null || user.bankVerifiedAt === undefined;

  const page = document.createElement('div');
  page.className = 'gdl-page';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <header class="gdl-header">
      <button class="gdl-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="gdl-header__title">${isMineView ? '내 공동구매 현황' : '공동구매'}</h1>
    </header>
    <div class="gdl-tabs" id="gdl-tabs">
      ${CATEGORIES.map((c, i) => `
        <button class="gdl-tab${i === 0 ? ' gdl-tab--active' : ''}" data-cat="${c === '전체' ? '' : c}">${c}</button>
      `).join('')}
    </div>
    <div class="gdl-scroll" id="gdl-scroll">
      <div class="gdl-loading"><div class="gdl-loading__dot"></div><span>불러오는 중...</span></div>
    </div>
  `;

  page.querySelector('.gdl-header__back').addEventListener('click', () => window.history.back());

  // ── 카테고리 탭 ──
  const tabsEl = page.querySelector('#gdl-tabs');
  let activeCategory = '';
  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.gdl-tab');
    if (!btn) return;
    tabsEl.querySelectorAll('.gdl-tab').forEach((t) => t.classList.remove('gdl-tab--active'));
    btn.classList.add('gdl-tab--active');
    activeCategory = btn.dataset.cat || '';
    renderList();
  });

  // ── 상태 ──
  let dealsList = [];
  const scrollEl = page.querySelector('#gdl-scroll');

  function buildUrl() {
    if (isMineView) {
      // mine 뷰: 일단 buyer 시점 + seller 시점 모두 합쳐서 표시
      // (백엔드가 mine 파라미터로 직접 지원하면 우선 활용)
      return `/api/group-deals?mine=buyer:${encodeURIComponent(user.id)}`;
    }
    return `/api/group-deals?status=recruiting&limit=20`;
  }

  async function fetchDeals() {
    try {
      const url = buildUrl();
      const res = await fetch(url);
      if (!res.ok) throw new Error('failed');
      const list = await res.json();

      if (isMineView) {
        // 판매자 시점 결과도 합치기
        try {
          const sres = await fetch(`/api/group-deals?mine=seller:${encodeURIComponent(user.id)}`);
          if (sres.ok) {
            const sellerList = await sres.json();
            const merged = [...(list || []), ...(sellerList || [])];
            const dedup = new Map();
            merged.forEach((d) => dedup.set(d.id, d));
            dealsList = Array.from(dedup.values());
            return;
          }
        } catch { /* ignore */ }
      }
      dealsList = Array.isArray(list) ? list : [];
    } catch {
      dealsList = [];
      showToast('공동구매 목록을 불러오지 못했습니다', { variant: 'error' });
    }
  }

  function applyFilter(list) {
    if (!activeCategory) return list;
    return list.filter((d) => d.category === activeCategory);
  }

  function renderList() {
    const filtered = applyFilter(dealsList);
    scrollEl.innerHTML = '';

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'gdl-empty';
      empty.innerHTML = `
        <svg class="gdl-empty__svg" viewBox="0 0 120 120" fill="none">
          <circle cx="60" cy="60" r="40" stroke="currentColor" stroke-width="3" fill="none" opacity="0.3"/>
          <path d="M40 60h40M60 40v40" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
        </svg>
        <span class="gdl-empty__title">${isMineView ? '참여중인 공동구매가 없습니다' : '진행중인 공동구매가 없습니다'}</span>
        <span class="gdl-empty__desc">${isSeller && !isMineView ? '+ 버튼으로 새 공동구매를 시작해보세요' : ''}</span>
      `;
      scrollEl.appendChild(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'gdl-grid';
    filtered.forEach((deal) => {
      grid.appendChild(buildCard(deal));
    });
    scrollEl.appendChild(grid);
  }

  function buildCard(deal) {
    const card = document.createElement('article');
    card.className = 'gdl-card';
    card.dataset.id = String(deal.id);

    const cur = Number(deal.currentParticipants || 0);
    const min = Number(deal.minParticipants || 1);
    const pct = Math.min(100, Math.round((cur / min) * 100));
    const ddayText = computeDday(deal.closesAt);
    const ddayClass = ddayText.urgent ? 'gdl-card__dday gdl-card__dday--urgent' : 'gdl-card__dday';
    const emoji = CAT_EMOJI[deal.category] || '🛒';

    const thumbHtml = deal.imageUrl
      ? `<img src="${escapeAttr(deal.imageUrl)}" alt="" loading="lazy">`
      : `<span class="gdl-card__fallback" style="width:100%;height:100%;line-height:0;flex-shrink:0;display:block">${thumbFallback(deal.category || '기타')}</span>`;

    card.innerHTML = `
      <div class="gdl-card__thumb">
        ${thumbHtml}
        <span class="gdl-card__cat">${escapeHtml(deal.category || '')}</span>
      </div>
      <div class="gdl-card__body">
        <h3 class="gdl-card__title">${escapeHtml(deal.title || '')}</h3>
        <p class="gdl-card__price">
          ${Number(deal.pricePerUnit || 0).toLocaleString('ko-KR')}<span>원/${escapeHtml(deal.unitLabel || '개')}</span>
        </p>
        <div class="gdl-card__progress" data-field="progress">
          <div class="gdl-card__progress-bar">
            <div class="gdl-card__progress-fill" style="width:${pct}%" data-field="fill"></div>
          </div>
          <span class="gdl-card__progress-text" data-field="count">${cur}/${min}명</span>
        </div>
        <span class="${ddayClass}">${escapeHtml(ddayText.label)}</span>
      </div>
    `;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.addEventListener('click', () => navigate('/app/group-deals/' + deal.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
    return card;
  }

  // ── FAB (판매자 전용) ──
  if (isSeller) {
    const fab = document.createElement('button');
    fab.className = 'gdl-fab';
    fab.setAttribute('aria-label', '공동구매 개설');
    fab.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    `;
    fab.addEventListener('click', () => navigate('/app/group-deals/create'));
    page.appendChild(fab);
  }

  // ── Socket.io 구독 ──
  const socket = Sock.connect();
  const onUpdated = (updatedDeal) => {
    if (!updatedDeal || !updatedDeal.id) return;
    // 상태에 반영
    const idx = dealsList.findIndex((d) => d.id === updatedDeal.id);
    if (idx >= 0) {
      dealsList[idx] = { ...dealsList[idx], ...updatedDeal };
    }
    // DOM 부분 갱신 (해당 카드의 진행바·참여자수)
    const card = scrollEl.querySelector(`.gdl-card[data-id="${CSS.escape(String(updatedDeal.id))}"]`);
    if (!card) return;
    const cur = Number(updatedDeal.currentParticipants || 0);
    const min = Number(updatedDeal.minParticipants || 1);
    const pct = Math.min(100, Math.round((cur / min) * 100));
    const fill = card.querySelector('[data-field="fill"]');
    const count = card.querySelector('[data-field="count"]');
    if (fill) fill.style.width = pct + '%';
    if (count) count.textContent = `${cur}/${min}명`;
  };
  socket.on('group-deal:updated', onUpdated);

  setCleanup(() => {
    socket.off('group-deal:updated', onUpdated);
    socket.disconnect();
  });

  // ── 초기 로드 ──
  await fetchDeals();
  renderList();

  return page;
}

function computeDday(closesAt) {
  if (!closesAt) return { label: '마감일 미정', urgent: false };
  const now = Date.now();
  const target = new Date(closesAt).getTime();
  if (!Number.isFinite(target)) return { label: '마감일 미정', urgent: false };
  const diffMs = target - now;
  if (diffMs <= 0) return { label: '마감', urgent: true };
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 24) return { label: `${diffH}시간 남음`, urgent: true };
  const diffD = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return { label: `D-${diffD}`, urgent: diffD <= 2 };
}

