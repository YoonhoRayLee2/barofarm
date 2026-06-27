/**
 * Profile History Page — 4-1b-D
 * Two-tab page: 라이브 기록 / 입찰 기록
 * Route: /app/profile/history?tab=lives|bids
 *
 * @module pages/profile-history
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { escapeHtml } from '/app/scripts/dom.js';
import { formatPrice, formatDateShort } from '/app/scripts/format.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';

// Inject CSS once
const _cssId = 'page-css-profile-history';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/profile-history.css';
  document.head.appendChild(link);
}

/**
 * @param {object} [params]
 * @returns {Promise<HTMLElement>}
 */
export default async function load(params) {
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

  // Read tab from query string
  const searchParams = new URLSearchParams(window.location.search);
  let activeTab = searchParams.get('tab') === 'bids' ? 'bids' : 'lives';

  const page = document.createElement('div');
  page.className = 'history-page';
  page.dataset.theme = 'light';

  // Header
  const header = document.createElement('header');
  header.className = 'history-header';
  header.innerHTML = `
    <button class="history-header__back" aria-label="뒤로 가기">‹</button>
    <h1 class="history-header__title">내 기록</h1>
  `;
  header.querySelector('.history-header__back').addEventListener('click', () => window.history.back());
  page.appendChild(header);

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'history-tabs';
  tabBar.innerHTML = `
    <button class="history-tab${activeTab === 'lives' ? ' is-active' : ''}" data-tab="lives">라이브 기록</button>
    <button class="history-tab${activeTab === 'bids' ? ' is-active' : ''}" data-tab="bids">입찰 기록</button>
  `;
  page.appendChild(tabBar);

  // Content area
  const contentArea = document.createElement('div');
  contentArea.className = 'history-content';
  page.appendChild(contentArea);

  // Tab switch handler
  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.history-tab');
    if (!btn) return;
    const tab = btn.dataset.tab;
    if (tab === activeTab) return;
    activeTab = tab;
    tabBar.querySelectorAll('.history-tab').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === activeTab);
    });
    // Update URL without re-render
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    window.history.replaceState({}, '', url.toString());
    // 탭 전환 시 콘텐츠 영역 스크롤 맨 위로 초기화
    contentArea.scrollTop = 0;
    loadTab(activeTab);
  });

  async function loadTab(tab) {
    contentArea.innerHTML = `
      <div class="history-loading">
        <div class="history-loading__dot"></div>
        <span>로딩 중...</span>
      </div>
    `;
    try {
      if (tab === 'lives') {
        const data = await fetchLives(user.id);
        renderLives(contentArea, data);
      } else {
        const data = await fetchBids(user.id);
        renderBids(contentArea, data);
      }
    } catch (err) {
      contentArea.innerHTML = `
        <div class="history-empty">
          <span class="history-empty__icon">⚠️</span>
          <span class="history-empty__title">데이터를 불러올 수 없습니다</span>
          <button class="history-empty__retry" id="history-retry-btn">다시 시도</button>
        </div>
      `;
      contentArea.querySelector('#history-retry-btn').addEventListener('click', () => loadTab(tab));
      contentArea.appendChild(createTabSpacer());
    }
  }

  loadTab(activeTab);
  page.appendChild(createBottomTabBar());
  return page;
}

async function fetchLives(userId) {
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}/lives`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchBids(userId) {
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}/bids`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function renderLives(container, list) {
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="history-empty">
        <span class="history-empty__icon">📡</span>
        <span class="history-empty__title">라이브 기록이 없습니다</span>
        <span class="history-empty__desc">라이브 방송을 시작하면 여기에 기록됩니다.</span>
      </div>
    `;
    container.appendChild(createTabSpacer());
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'history-list';
  list.forEach((live) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    const startDate = live.startedAt ? formatDateShort(live.startedAt) : '—';
    const endDate = live.endedAt ? formatDateShort(live.endedAt) : '진행 중';
    const statusClass = live.status === 'ended' ? 'history-status--ended' : 'history-status--live';
    const statusLabel = live.status === 'ended' ? '종료' : 'LIVE';
    li.innerHTML = `
      <div class="history-item__row">
        <span class="history-item__title">${escapeHtml(live.title || '라이브 방송')}</span>
        <span class="history-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="history-item__meta">
        <span>${startDate}</span>
        ${live.totalAuctions != null ? `<span>낙찰 ${live.totalAuctions}건</span>` : ''}
        ${live.totalRevenue ? `<span>${formatPrice(live.totalRevenue)}</span>` : ''}
      </div>
    `;
    ul.appendChild(li);
  });
  container.innerHTML = '';
  container.appendChild(ul);
  container.appendChild(createTabSpacer());
}

function renderBids(container, list) {
  if (!list || list.length === 0) {
    container.innerHTML = `
      <div class="history-empty">
        <span class="history-empty__icon">🏷️</span>
        <span class="history-empty__title">입찰 기록이 없습니다</span>
        <span class="history-empty__desc">라이브 방송에 참여하여 입찰하면 여기에 기록됩니다.</span>
      </div>
    `;
    container.appendChild(createTabSpacer());
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'history-list';
  list.forEach((bid) => {
    const li = document.createElement('li');
    li.className = 'history-item history-item--has-thumb';
    const bidDate = bid.bidAt ? formatDateShort(bid.bidAt) : '—';

    const thumb = document.createElement('div');
    thumb.className = 'history-item__thumb';
    if (bid.imageUrl) {
      const img = document.createElement('img');
      img.src = bid.imageUrl;
      img.alt = bid.productName || '';
      img.loading = 'lazy';
      thumb.appendChild(img);
    } else {
      const fb = document.createElement('span');
      fb.className = 'history-item__thumb-fallback';
      fb.textContent = '🌱';
      thumb.appendChild(fb);
    }

    const body = document.createElement('div');
    body.className = 'history-item__body';
    body.innerHTML = `
      <div class="history-item__row">
        <span class="history-item__title">
          ${bid.isWinner ? '🏆 ' : ''}${escapeHtml(bid.productName || '상품')}
        </span>
        <span class="history-item__price">${formatPrice(bid.bidPrice)}</span>
      </div>
      <div class="history-item__meta">
        <span>${bidDate}</span>
        ${bid.isWinner ? '<span class="history-item__winner">낙찰</span>' : '<span class="history-item__no-winner">미낙찰</span>'}
      </div>
    `;

    li.appendChild(thumb);
    li.appendChild(body);
    ul.appendChild(li);
  });
  container.innerHTML = '';
  container.appendChild(ul);
  container.appendChild(createTabSpacer());
}

