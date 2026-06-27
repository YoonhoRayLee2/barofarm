/**
 * My Forest Page — 나의 탄소절감 숲 시각화
 * Route: /app/my-forest
 *
 * @module pages/my-forest
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace } from '/app/scripts/router.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';

const _cssId = 'page-css-my-forest';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/my-forest.css';
  document.head.appendChild(link);
}

const MILESTONES = [
  { min: 0,  max: 0,  icon: '🪨', label: '아직 숲이 없어요' },
  { min: 1,  max: 9,  icon: '🌱', label: '새싹' },
  { min: 10, max: 29, icon: '🌿', label: '묘목숲' },
  { min: 30, max: 49, icon: '🌲', label: '작은숲' },
  { min: 50, max: Infinity, icon: '🌳', label: '울창한숲' },
];

function getMilestone(trees) {
  return MILESTONES.slice().reverse().find(m => trees >= m.min) || MILESTONES[0];
}

function getNextMilestone(trees) {
  return MILESTONES.find(m => m.min > trees) || null;
}

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) { await replace('/app/login'); return document.createElement('div'); }
  let user;
  try { user = JSON.parse(stored); } catch { await replace('/app/login'); return document.createElement('div'); }

  const page = document.createElement('div');
  page.className = 'mf-page';

  page.innerHTML = `
    <header class="mf-header">
      <button class="mf-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="mf-header__title">🌳 나의 숲</h1>
    </header>
    <div class="mf-scroll" id="mf-scroll">
      <div class="mf-loading">불러오는 중...</div>
    </div>
  `;

  page.querySelector('.mf-header__back').addEventListener('click', () => window.history.back());

  const scroll = page.querySelector('#mf-scroll');
  page.appendChild(createBottomTabBar());

  try {
    const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/carbon-summary`);
    const summary = res.ok ? await res.json() : null;

    const trees        = summary ? Math.max(0, Math.floor(Number(summary.treeEquiv || 0))) : 0;
    const orderCount   = summary ? Number(summary.orderCount   || 0) : 0;
    const savedCount   = summary ? Number(summary.savedCount   || 0) : 0;
    const totalSavedKm = summary ? Number(summary.totalSavedKm || 0) : 0;
    const totalCo2g    = summary ? Number(summary.totalSavedCo2g || 0) : 0;

    const milestone = getMilestone(trees);
    const next      = getNextMilestone(trees);

    /* progress bar */
    const progressHtml = next
      ? (() => {
          const prevMin = milestone.min || 0;
          const pct     = next.min > prevMin
            ? Math.min(100, Math.round((trees - prevMin) / (next.min - prevMin) * 100))
            : 100;
          return `
            <div class="mf-progress">
              <div class="mf-progress__label">
                <span>${milestone.label}</span>
                <span>${next.label}까지 ${next.min - trees}그루</span>
              </div>
              <div class="mf-progress__track">
                <div class="mf-progress__fill" style="width:${pct}%"></div>
              </div>
            </div>
          `;
        })()
      : `<div class="mf-progress"><p class="mf-progress__max">최고 단계 달성!</p></div>`;

    /* tree grid */
    const treeGridHtml = trees > 0
      ? `<div class="mf-tree-grid" aria-label="나무 ${trees}그루">${'🌳'.repeat(Math.min(trees, 100))}${trees > 100 ? `<span class="mf-tree-more">+${(trees - 100).toLocaleString('ko-KR')}</span>` : ''}</div>`
      : `<div class="mf-tree-empty">아직 심은 나무가 없어요.<br>산지직송 주문으로 첫 나무를 심어보세요!</div>`;

    scroll.innerHTML = `
      <div class="mf-stage-badge">
        <span class="mf-stage-badge__icon">${milestone.icon}</span>
        <span class="mf-stage-badge__label">${milestone.label}</span>
      </div>

      ${treeGridHtml}

      ${progressHtml}

      <section class="mf-summary">
        <h2 class="mf-summary__title">누적 절감</h2>
        <div class="mf-summary__grid">
          <div class="mf-summary__item">
            <span class="mf-summary__value">${totalSavedKm.toLocaleString('ko-KR')}<small>km</small></span>
            <span class="mf-summary__label">이동거리 절감</span>
          </div>
          <div class="mf-summary__item">
            <span class="mf-summary__value">${totalCo2g.toLocaleString('ko-KR')}<small>g</small></span>
            <span class="mf-summary__label">CO₂ 절감</span>
          </div>
          <div class="mf-summary__item">
            <span class="mf-summary__value">${savedCount.toLocaleString('ko-KR')}<small>건</small></span>
            <span class="mf-summary__label">절감 주문</span>
          </div>
          <div class="mf-summary__item">
            <span class="mf-summary__value">${orderCount.toLocaleString('ko-KR')}<small>건</small></span>
            <span class="mf-summary__label">총 주문</span>
          </div>
        </div>
      </section>

      <section class="mf-milestones">
        <h2 class="mf-milestones__title">마일스톤</h2>
        ${MILESTONES.filter(m => m.min > 0).map(m => {
          const reached = trees >= m.min;
          return `
            <div class="mf-milestone ${reached ? 'mf-milestone--reached' : ''}">
              <span class="mf-milestone__icon">${m.icon}</span>
              <div class="mf-milestone__body">
                <span class="mf-milestone__label">${m.label}</span>
                <span class="mf-milestone__req">${m.min}그루 이상</span>
              </div>
              ${reached ? '<span class="mf-milestone__check">✓</span>' : ''}
            </div>
          `;
        }).join('')}
      </section>
    `;
    scroll.appendChild(createTabSpacer());
  } catch {
    scroll.innerHTML = `<div class="mf-error">데이터를 불러올 수 없습니다.</div>`;
    scroll.appendChild(createTabSpacer());
  }

  return page;
}
