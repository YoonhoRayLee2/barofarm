/**
 * Seller Dashboard Page — 4-2-spa
 * Route: /app/seller/dashboard
 *
 * Allows sellers to view summary stats, manage their lives/auctions,
 * and quickly navigate to live-seller or create a new live.
 *
 * @module pages/seller-dashboard
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { showConfirmDialog } from '/app/components/confirm-dialog.js';
import { getDashboardSummary, getUserLives, endLive } from '/app/scripts/api.js';

// Inject CSS once
const _cssId = 'page-css-seller-dashboard';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/seller-dashboard.css';
  document.head.appendChild(link);
}

/** Tab identifiers */
const TABS = ['ongoing', 'upcoming', 'ended'];
const TAB_LABELS = { ongoing: '진행 중', upcoming: '예고', ended: '종료' };
/** Map API status values to tab keys */
const STATUS_TAB = { live: 'ongoing', upcoming: 'upcoming', ended: 'ended', scheduled: 'upcoming' };

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
  let user;
  try {
    user = JSON.parse(stored);
  } catch {
    await replace('/app/login');
    return document.createElement('div');
  }

  const page = document.createElement('div');
  page.className = 'seller-dash';

  /* ---- Header ---- */
  const header = document.createElement('header');
  header.className = 'seller-dash__header';
  header.innerHTML = `
    <button class="seller-dash__back" aria-label="뒤로 가기">‹</button>
    <h1 class="seller-dash__title">셀러 대시보드</h1>
  `;
  header.querySelector('.seller-dash__back').addEventListener('click', () => window.history.back());
  page.appendChild(header);

  /* ---- Summary cards placeholder ---- */
  const summaryGrid = document.createElement('div');
  summaryGrid.className = 'seller-dash__summary';
  summaryGrid.innerHTML = buildStatCardsSkeleton();
  page.appendChild(summaryGrid);

  /* ---- Quick action buttons ---- */
  const actionsBar = document.createElement('div');
  actionsBar.className = 'seller-dash__actions';

  const btnStartLive = document.createElement('button');
  btnStartLive.className = 'seller-dash__action-btn seller-dash__action-btn--primary';
  btnStartLive.textContent = '새 라이브 시작';
  btnStartLive.addEventListener('click', () => navigate('/app/live-create'));

  const btnSample = document.createElement('button');
  btnSample.className = 'seller-dash__action-btn seller-dash__action-btn--secondary';
  btnSample.textContent = '샘플 경매 체험';
  btnSample.addEventListener('click', () => navigate('/app/sample'));

  actionsBar.appendChild(btnStartLive);
  actionsBar.appendChild(btnSample);
  page.appendChild(actionsBar);

  /* ---- Tab bar ---- */
  let activeTab = 'ongoing';

  const tabBar = document.createElement('div');
  tabBar.className = 'seller-tabs';
  TABS.forEach((key) => {
    const btn = document.createElement('button');
    btn.className = 'seller-tab' + (key === activeTab ? ' is-active' : '');
    btn.dataset.tab = key;
    btn.textContent = TAB_LABELS[key];
    tabBar.appendChild(btn);
  });
  page.appendChild(tabBar);

  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.seller-tab');
    if (!btn) return;
    const tab = btn.dataset.tab;
    if (tab === activeTab) return;
    activeTab = tab;
    tabBar.querySelectorAll('.seller-tab').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === activeTab);
    });
    renderTabContent(activeTab);
  });

  /* ---- Content area ---- */
  const contentArea = document.createElement('div');
  contentArea.className = 'seller-dash__content';
  page.appendChild(contentArea);

  /* ---- State ---- */
  let allLives = null; // cached after first fetch

  /* ---- Load summary ---- */
  loadSummary();

  async function loadSummary() {
    try {
      const summary = await getDashboardSummary(user.id);
      const s = summary.stats || {};

      // If seller has no live history at all — show first-time empty state
      if (s.liveCount === 0) {
        renderFirstTimeCTA();
        return;
      }

      summaryGrid.innerHTML = buildStatCards(s);
      // Load lives list
      await loadLives();
    } catch {
      summaryGrid.innerHTML = buildStatCardsFallback();
      // Still attempt to load lives
      await loadLives();
    }
  }

  async function loadLives() {
    contentArea.innerHTML = buildLoadingHtml();
    try {
      const data = await getUserLives(user.id);
      allLives = Array.isArray(data) ? data : [];
      renderTabContent(activeTab);
    } catch (err) {
      allLives = [];
      contentArea.innerHTML = `
        <div class="seller-dash__error">
          <span class="seller-dash__error-icon">⚠️</span>
          <span class="seller-dash__error-msg">라이브 목록을 불러올 수 없습니다</span>
          <button class="seller-dash__retry-btn" id="seller-retry-btn">다시 시도</button>
        </div>
      `;
      contentArea.querySelector('#seller-retry-btn').addEventListener('click', loadLives);
    }
  }

  function renderTabContent(tab) {
    if (!allLives) {
      contentArea.innerHTML = buildLoadingHtml();
      return;
    }
    const filtered = allLives.filter((live) => {
      const mapped = STATUS_TAB[live.status] || 'ended';
      return mapped === tab;
    });
    if (filtered.length === 0) {
      renderEmptyTab(tab);
      return;
    }
    renderLiveList(filtered, tab);
  }

  function renderEmptyTab(tab) {
    const msgs = {
      ongoing: { icon: '📡', title: '진행 중인 라이브가 없습니다', desc: '새 라이브를 시작해 보세요.' },
      upcoming: { icon: '📅', title: '예고된 라이브가 없습니다', desc: '라이브를 미리 예고할 수 있습니다.' },
      ended: { icon: '📼', title: '종료된 라이브가 없습니다', desc: '라이브를 진행하면 여기에 기록됩니다.' },
    };
    const m = msgs[tab] || msgs.ended;
    contentArea.innerHTML = `
      <div class="seller-dash__empty">
        <span class="seller-dash__empty-icon">${m.icon}</span>
        <span class="seller-dash__empty-title">${m.title}</span>
        <span class="seller-dash__empty-desc">${m.desc}</span>
      </div>
    `;
  }

  function renderFirstTimeCTA() {
    summaryGrid.innerHTML = buildStatCardsFallback();
    contentArea.innerHTML = `
      <div class="seller-dash__empty">
        <span class="seller-dash__empty-icon">🌱</span>
        <span class="seller-dash__empty-title">첫 라이브를 시작해 보세요!</span>
        <span class="seller-dash__empty-desc">산지직송 라이브 커머스로 농산물을 직접 판매해 보세요.</span>
        <button class="seller-dash__empty-cta" id="seller-first-live-btn">첫 라이브 시작하기</button>
      </div>
    `;
    contentArea.querySelector('#seller-first-live-btn').addEventListener('click', () => navigate('/app/live-create'));
  }

  function renderLiveList(lives, tab) {
    const ul = document.createElement('ul');
    ul.className = 'seller-live-list';

    lives.forEach((live) => {
      const li = buildLiveItem(live, tab);
      ul.appendChild(li);
    });

    contentArea.innerHTML = '';
    contentArea.appendChild(ul);
  }

  function buildLiveItem(live, tab) {
    const li = document.createElement('li');
    li.className = 'seller-live-item';

    const isOwn = live.sellerId === user.id || !live.sellerId; // server validates; client double-checks
    const isOngoing = tab === 'ongoing';
    const isEnded = tab === 'ended';

    const thumbHtml = live.thumbnailUrl
      ? `<img src="${escapeAttr(live.thumbnailUrl)}" alt="라이브 썸네일">`
      : '📡';

    const startDate = live.startedAt ? formatDate(live.startedAt) : '—';
    const badgeClass = isOngoing
      ? 'seller-live-item__badge--live'
      : tab === 'upcoming'
      ? 'seller-live-item__badge--upcoming'
      : 'seller-live-item__badge--ended';
    const badgeLabel = isOngoing ? 'LIVE' : tab === 'upcoming' ? '예고' : '종료';

    const viewersMeta = isOngoing && live.currentViewers != null
      ? `<span>👁 ${live.currentViewers}명</span>`
      : '';
    const revenueMeta = live.totalRevenue
      ? `<span class="seller-live-item__meta-accent">매출 ${formatPrice(live.totalRevenue)}</span>`
      : '';
    const auctionMeta = live.totalAuctions != null
      ? `<span>경매 ${live.totalAuctions}건</span>`
      : '';

    let actionsHtml = '';
    if (isOngoing && isOwn) {
      actionsHtml = `
        <div class="seller-live-item__actions">
          <button class="seller-live-item__btn seller-live-item__btn--manage" data-action="manage" data-live-id="${escapeAttr(live.liveId)}">관리</button>
          <button class="seller-live-item__btn seller-live-item__btn--end" data-action="end" data-live-id="${escapeAttr(live.liveId)}">종료</button>
        </div>
      `;
    }

    li.innerHTML = `
      <div class="seller-live-item__thumb">${thumbHtml}</div>
      <div class="seller-live-item__body">
        <div class="seller-live-item__title-row">
          <span class="seller-live-item__title">${escapeHtml(live.title || '라이브 방송')}</span>
          <span class="seller-live-item__badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <div class="seller-live-item__meta">
          <span>${startDate}</span>
          ${auctionMeta}
          ${revenueMeta}
          ${viewersMeta}
        </div>
      </div>
      ${actionsHtml}
    `;

    // Click on the item body — navigate to detail or manage
    li.querySelector('.seller-live-item__body').addEventListener('click', () => {
      if (isOngoing) {
        navigate(`/app/live-seller/${encodeURIComponent(live.liveId)}`);
      } else if (isEnded) {
        navigate(`/app/auction-detail/${encodeURIComponent(live.liveId)}`);
      }
    });

    // Manage button
    const manageBtn = li.querySelector('[data-action="manage"]');
    if (manageBtn) {
      manageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigate(`/app/live-seller/${encodeURIComponent(live.liveId)}`);
      });
    }

    // End button
    const endBtn = li.querySelector('[data-action="end"]');
    if (endBtn) {
      endBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await showConfirmDialog({
          title: '라이브 종료',
          message: `"${live.title || '라이브 방송'}"을(를) 지금 종료하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
          confirmLabel: '종료',
          cancelLabel: '취소',
          danger: true,
        });
        if (!confirmed) return;
        try {
          await endLive(live.liveId, user.id);
          showToast('라이브가 종료되었습니다', { variant: 'success', duration: 2000 });
          // Refresh list
          allLives = null;
          await loadLives();
        } catch (err) {
          showToast('종료에 실패했습니다. 다시 시도해 주세요.', { variant: 'error', duration: 2500 });
        }
      });
    }

    return li;
  }

  return page;
}

/* ---- Helpers ---- */

function buildLoadingHtml() {
  return `
    <div class="seller-dash__loading">
      <div class="seller-dash__loading-dot"></div>
      <span>로딩 중...</span>
    </div>
  `;
}

function buildStatCards(s) {
  const revenue = formatPrice(s.totalRevenue);
  return `
    ${statCard('누적 매출', revenue, '')}
    ${statCard('전체 라이브', s.liveCount ?? '—', '회')}
    ${statCard('진행 중', s.ongoingCount ?? '—', '개')}
    ${statCard('경매 건수', s.totalAuctions ?? '—', '건')}
  `;
}

function buildStatCardsSkeleton() {
  return [
    statCard('누적 매출', '—', ''),
    statCard('전체 라이브', '—', '회'),
    statCard('진행 중', '—', '개'),
    statCard('경매 건수', '—', '건'),
  ].join('');
}

function buildStatCardsFallback() {
  return buildStatCardsSkeleton();
}

function statCard(label, value, unit) {
  return `
    <div class="seller-dash__stat-card">
      <span class="seller-dash__stat-label">${escapeHtml(label)}</span>
      <span class="seller-dash__stat-value">${escapeHtml(String(value))}</span>
      ${unit ? `<span class="seller-dash__stat-unit">${escapeHtml(unit)}</span>` : ''}
    </div>
  `;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function formatPrice(price) {
  if (price == null) return '—';
  return Number(price).toLocaleString('ko-KR') + '원';
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
  return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
