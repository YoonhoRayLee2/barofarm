/**
 * Auction Result Page — 낙찰 직후 농협몰 추천 결과를 보여주는 전용 페이지.
 *
 * Route: /app/auction/:auctionId/result
 *
 * 라이브 화면의 낙찰 오버레이에서 "농협몰에서 더보기 →" 클릭 시 진입한다.
 * 추천 카드 5~10개를 그리드로 표시하고, 각 카드 클릭 시 mall-demo 상품
 * 페이지로 새 탭 열기.
 *
 * @module pages/auction-result
 */

import { navigate, setCleanup } from '/app/scripts/router.js';
import * as api from '/app/scripts/api.js';
import { showToast } from '/app/components/toast.js';

// Inject page CSS once
const _cssId = 'page-css-auction-result';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/auction-result.css';
  document.head.appendChild(link);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {{ auctionId: string }} params
 * @returns {Promise<HTMLElement>}
 */
export default async function load(params) {
  const { auctionId } = params;

  const page = document.createElement('div');
  page.className = 'auction-result';
  page.dataset.theme = 'light';

  // Initial skeleton
  page.innerHTML = `
    <header class="ar-topbar">
      <button class="ar-topbar__back" id="ar-back" aria-label="뒤로가기">←</button>
      <span class="ar-topbar__title">낙찰 결과</span>
      <span class="ar-topbar__spacer" aria-hidden="true"></span>
    </header>

    <div class="ar-scroll" id="ar-scroll">
      <section class="ar-summary" id="ar-summary">
        <div class="ar-summary__icon" aria-hidden="true">🏆</div>
        <div class="ar-summary__body">
          <div class="ar-summary__title">불러오는 중...</div>
          <div class="ar-summary__meta"></div>
        </div>
      </section>

      <section class="ar-recs">
        <div class="ar-recs__header">
          <h2 class="ar-recs__title">✨ 농협몰에서 함께 즐기면 좋은 상품</h2>
          <span class="ar-recs__badge" id="ar-algo-badge"></span>
        </div>
        <div class="ar-recs__grid" id="ar-grid">
          ${renderSkeletons(6)}
        </div>
      </section>

      <section class="ar-actions">
        <button class="ar-actions__primary" id="ar-go-home">다른 라이브 보러가기</button>
      </section>
    </div>
  `;

  page.querySelector('#ar-back').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/app/home');
  });
  page.querySelector('#ar-go-home').addEventListener('click', () => navigate('/app/home'));

  // ── Cleanup ───────────────────────────────────────────────────
  let aborted = false;
  setCleanup(() => { aborted = true; });

  // ── Fetch recommendations ─────────────────────────────────────
  try {
    const data = await api.getRecommendations(auctionId, 8);
    if (aborted) return page;
    renderSummary(page, data.auction);
    renderAlgoBadge(page, data.meta);
    renderGrid(page, data.recommendations || []);
  } catch (err) {
    if (aborted) return page;
    const status = err && err.status;
    if (status === 404) {
      renderError(page, '낙찰 정보를 찾을 수 없습니다', true);
    } else {
      showToast('추천 정보를 불러오지 못했습니다', { variant: 'error' });
      renderError(page, '추천 정보를 불러오지 못했습니다', false);
    }
  }

  return page;
}

function renderSkeletons(n) {
  const cards = [];
  for (let i = 0; i < n; i++) {
    cards.push(`
      <div class="ar-card ar-card--skeleton" aria-hidden="true">
        <div class="ar-card__thumb ar-skel"></div>
        <div class="ar-skel ar-skel--line" style="width:80%"></div>
        <div class="ar-skel ar-skel--line" style="width:40%"></div>
      </div>
    `);
  }
  return cards.join('');
}

function renderSummary(page, auction) {
  if (!auction) return;
  const summary = page.querySelector('#ar-summary');
  if (!summary) return;
  const itemName = auction.itemName || '낙찰 상품';
  const category = auction.category || '';
  const price = (auction.finalPrice || 0).toLocaleString();
  const winner = auction.winnerNickname ? `${auction.winnerNickname}님 · ` : '';

  summary.innerHTML = `
    <div class="ar-summary__icon" aria-hidden="true">🏆</div>
    <div class="ar-summary__body">
      <div class="ar-summary__title">축하합니다! <span class="ar-summary__item">${escapeHtml(itemName)}</span> 낙찰</div>
      <div class="ar-summary__meta">
        ${category ? `<span class="ar-summary__chip">${escapeHtml(category)}</span>` : ''}
        <span class="ar-summary__price">${winner}${price}원</span>
      </div>
    </div>
  `;
}

function renderAlgoBadge(page, meta) {
  if (!meta) return;
  const badge = page.querySelector('#ar-algo-badge');
  if (!badge) return;
  const label = meta.algorithm === 'ai' ? 'AI 추천' : '룰 기반 추천';
  badge.textContent = label;
}

function renderGrid(page, recommendations) {
  const grid = page.querySelector('#ar-grid');
  if (!grid) return;

  if (recommendations.length === 0) {
    grid.innerHTML = '<div class="ar-empty">추천 상품을 준비 중입니다</div>';
    return;
  }

  grid.innerHTML = recommendations.map((rec) => {
    const p = rec.product || {};
    const reasons = Array.isArray(rec.reasons) ? rec.reasons.slice(0, 3) : [];
    const score = Math.max(0, Math.min(1, Number(rec.score) || 0));
    const scorePct = Math.round(score * 100);
    const price = (p.price || 0).toLocaleString();
    const img = p.imageUrl || '';
    const origin = p.origin || '';
    const productHref = `/mall/product/${encodeURIComponent(p.id || '')}`;

    const reasonChips = reasons.map((r) =>
      `<span class="ar-card__reason-chip">${escapeHtml(r)}</span>`
    ).join('');

    return `
      <article class="ar-card">
        <a class="ar-card__link" href="${productHref}" target="_blank" rel="noopener">
          <div class="ar-card__thumb">
            ${img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" />` : ''}
          </div>
          <div class="ar-card__body">
            <div class="ar-card__name">${escapeHtml(p.name || '')}</div>
            <div class="ar-card__meta">
              ${origin ? `<span class="ar-card__origin">${escapeHtml(origin)}</span>` : ''}
              <span class="ar-card__price">${price}원</span>
            </div>
            ${reasonChips ? `<div class="ar-card__reasons">${reasonChips}</div>` : ''}
            <div class="ar-card__score" title="추천 점수: ${scorePct}점">
              <div class="ar-card__score-track">
                <div class="ar-card__score-fill" style="width:${scorePct}%"></div>
              </div>
              <span class="ar-card__score-label">${scorePct}점</span>
            </div>
          </div>
        </a>
        <a class="ar-card__cta" href="${productHref}" target="_blank" rel="noopener">
          농협몰에서 보기 →
        </a>
      </article>
    `;
  }).join('');
}

function renderError(page, message, isNotFound) {
  const scroll = page.querySelector('#ar-scroll');
  if (!scroll) return;
  scroll.innerHTML = `
    <div class="ar-error">
      <div class="ar-error__icon">${isNotFound ? '🔍' : '⚠️'}</div>
      <div class="ar-error__title">${escapeHtml(message)}</div>
      <div class="ar-error__actions">
        <button class="ar-actions__primary" id="ar-err-home">홈으로 이동</button>
      </div>
    </div>
  `;
  const homeBtn = scroll.querySelector('#ar-err-home');
  if (homeBtn) homeBtn.addEventListener('click', () => navigate('/app/home'));
}
