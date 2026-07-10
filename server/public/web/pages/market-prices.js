/**
 * Market Prices Detail Page — 농산물 시세 상세
 * Route: /app/market-prices/:itemCode?kindName=후지
 *
 * @module pages/market-prices
 */

import { request } from '/app/scripts/api.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';

const _cssId = 'page-css-market-prices';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/market-prices.css';
  document.head.appendChild(link);
}

export default async function load(params) {
  const itemCode = params?.itemCode || '';
  const search = new URLSearchParams(window.location.search);
  const kindName = search.get('kindName') || '';

  const page = document.createElement('section');
  page.className = 'mp-page';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <header class="mp-header">
      <button class="mp-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="mp-header__title">시세 상세</h1>
    </header>
    <div class="mp-scroll" id="mp-scroll">
      <div class="mp-loading">
        <div class="mp-loading__dot"></div>
        <span>시세를 불러오는 중...</span>
      </div>
    </div>
  `;

  page.querySelector('.mp-header__back').addEventListener('click', () => window.history.back());

  const scrollEl = page.querySelector('#mp-scroll');
  page.appendChild(createBottomTabBar());

  // Fetch history asynchronously
  (async () => {
    try {
      const url = `/api/market-prices/${encodeURIComponent(itemCode)}/history?kindName=${encodeURIComponent(kindName)}&days=30`;
      const history = await request(url);

      // Try to fetch item meta from list endpoint to get itemName/unit/category
      let meta = null;
      try {
        const list = await request('/api/market-prices');
        meta = list.find(it => String(it.itemCode) === String(itemCode) && (!kindName || it.kindName === kindName))
            || list.find(it => String(it.itemCode) === String(itemCode));
      } catch {}

      renderDetail(scrollEl, { itemCode, kindName, history, meta });
      scrollEl.appendChild(createTabSpacer());
    } catch {
      scrollEl.innerHTML = `
        <div class="mp-empty">
          <span class="mp-empty__title">시세 데이터를 불러올 수 없습니다</span>
          <span class="mp-empty__desc">잠시 후 다시 시도해 주세요.</span>
        </div>
      `;
      scrollEl.appendChild(createTabSpacer());
    }
  })();

  return page;
}

function renderDetail(root, { itemCode, kindName, history, meta }) {
  if (!Array.isArray(history) || history.length === 0) {
    root.innerHTML = `
      <div class="mp-empty">
        <span class="mp-empty__title">가격 이력이 없습니다</span>
        <span class="mp-empty__desc">아직 등록된 시세 데이터가 없어요.</span>
      </div>
    `;
    return;
  }

  // history is ASC; get latest = last, prev = second-to-last
  const latest = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const diff = prev ? Number(latest.price) - Number(prev.price) : 0;
  const diffPct = prev && Number(prev.price) > 0 ? (diff / Number(prev.price)) * 100 : 0;

  const itemName = meta?.itemName || `품목 ${itemCode}`;
  const unit = meta?.unit || '';
  const category = meta?.category || '';

  const trendClass =
    diff > 0 ? 'mp-trend--up' : diff < 0 ? 'mp-trend--down' : 'mp-trend--flat';
  const trendArrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '–';
  const trendSign = diff > 0 ? '+' : '';
  const trendLabel = prev
    ? `${trendSign}${Number(diff).toLocaleString('ko-KR')}원 ${trendArrow} (${trendSign}${diffPct.toFixed(1)}%)`
    : '전일 데이터 없음';

  // Build SVG line chart
  const chartSvg = buildChart(history);

  // Build history list (DESC = newest first)
  const reversed = [...history].reverse();
  const todayDate = latest.priceDate;
  const listRows = reversed.map((row, idx) => {
    const nextOlder = reversed[idx + 1];
    const rowDiff = nextOlder ? Number(row.price) - Number(nextOlder.price) : 0;
    const rowTrendClass =
      rowDiff > 0 ? 'mp-row__trend--up'
      : rowDiff < 0 ? 'mp-row__trend--down'
      : 'mp-row__trend--flat';
    const rowArrow = rowDiff > 0 ? '▲' : rowDiff < 0 ? '▼' : '–';
    const rowDiffStr = nextOlder
      ? `${rowDiff > 0 ? '+' : ''}${Number(rowDiff).toLocaleString('ko-KR')} ${rowArrow}`
      : '–';
    const isToday = row.priceDate === todayDate;
    return `
      <li class="mp-row ${isToday ? 'mp-row--today' : ''}">
        <span class="mp-row__date">${formatDate(row.priceDate)}</span>
        <span class="mp-row__price">${Number(row.price).toLocaleString('ko-KR')}원</span>
        <span class="mp-row__trend ${rowTrendClass}">${rowDiffStr}</span>
      </li>
    `;
  }).join('');

  root.innerHTML = `
    <section class="mp-summary">
      ${category ? `<span class="mp-summary__cat mp-summary__cat--${escapeAttr(category)}">${escapeHtml(category)}</span>` : ''}
      <h2 class="mp-summary__name">${escapeHtml(itemName)}</h2>
      ${kindName ? `<p class="mp-summary__kind">${escapeHtml(kindName)}</p>` : ''}
      <div class="mp-summary__price-row">
        <span class="mp-summary__price">${Number(latest.price).toLocaleString('ko-KR')}<span class="mp-summary__won">원</span></span>
        ${unit ? `<span class="mp-summary__unit">/${escapeHtml(unit)}</span>` : ''}
      </div>
      <span class="mp-trend ${trendClass}">${trendLabel}</span>
      <span class="mp-summary__date">${formatDate(latest.priceDate)} 기준</span>
    </section>

    <section class="mp-chart-card">
      <div class="mp-chart-card__header">
        <span class="mp-chart-card__title">최근 ${history.length}일 추이</span>
      </div>
      ${chartSvg}
    </section>

    <section class="mp-history">
      <h3 class="mp-history__title">가격 이력</h3>
      <ul class="mp-history__list">
        ${listRows}
      </ul>
    </section>
  `;
}

function buildChart(history) {
  const W = 320;
  const H = 80;
  const PAD_X = 12;
  const PAD_Y = 10;

  const prices = history.map(h => Number(h.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const n = history.length;
  const stepX = n > 1 ? (W - PAD_X * 2) / (n - 1) : 0;

  const points = prices.map((p, i) => {
    const x = PAD_X + i * stepX;
    const y = PAD_Y + (1 - (p - min) / range) * (H - PAD_Y * 2);
    return [x, y];
  });

  const polyline = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  // Min/max markers
  const minIdx = prices.indexOf(min);
  const maxIdx = prices.indexOf(max);
  const [minX, minY] = points[minIdx];
  const [maxX, maxY] = points[maxIdx];

  // Filled area (under the line)
  const areaPoints =
    `${PAD_X},${H - PAD_Y} ` + polyline + ` ${(PAD_X + (n - 1) * stepX).toFixed(1)},${H - PAD_Y}`;

  return `
    <svg class="mp-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <polygon class="mp-chart__area" points="${areaPoints}" />
      <polyline class="mp-chart__line" points="${polyline}" />
      <circle class="mp-chart__marker mp-chart__marker--max" cx="${maxX.toFixed(1)}" cy="${maxY.toFixed(1)}" r="3" />
      <circle class="mp-chart__marker mp-chart__marker--min" cx="${minX.toFixed(1)}" cy="${minY.toFixed(1)}" r="3" />
    </svg>
    <div class="mp-chart__legend">
      <span class="mp-chart__legend-item"><span class="mp-chart__dot mp-chart__dot--max"></span>최고 ${Number(max).toLocaleString('ko-KR')}원</span>
      <span class="mp-chart__legend-item"><span class="mp-chart__dot mp-chart__dot--min"></span>최저 ${Number(min).toLocaleString('ko-KR')}원</span>
    </div>
  `;
}

function formatDate(iso) {
  if (!iso) return '';
  // Accept 'YYYY-MM-DD' or full ISO
  const d = String(iso).slice(0, 10);
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;');
}
