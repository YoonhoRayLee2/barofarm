// 카테고리 페이지: 정렬 + 전체 그리드
import { listProducts } from '../scripts/api.js';
import { productGrid } from '../components/product-card.js';
import { escapeHtml } from '../scripts/format.js';

const SORTS = [
  { key: 'default', label: '추천순' },
  { key: 'priceAsc', label: '가격 낮은순' },
  { key: 'priceDesc', label: '가격 높은순' },
  { key: 'stockDesc', label: '인기순' },
];

function applySort(items, sort) {
  const arr = items.slice();
  if (sort === 'priceAsc') arr.sort((a, b) => a.price - b.price);
  else if (sort === 'priceDesc') arr.sort((a, b) => b.price - a.price);
  else if (sort === 'stockDesc') arr.sort((a, b) => b.stock - a.stock);
  return arr;
}

export async function renderCategory(view, category) {
  const { items, total } = await listProducts({ category, limit: 100, offset: 0 });

  let sort = 'default';

  const sortBarHtml = () => SORTS.map((s) => `
    <button type="button" class="mall-sort-btn${s.key === sort ? ' is-active' : ''}" data-sort="${s.key}">
      ${s.label}
    </button>
  `).join('');

  function paint() {
    const sorted = applySort(items, sort);
    const gridHost = view.querySelector('#mall-grid-host');
    if (gridHost) gridHost.innerHTML = productGrid(sorted);
    const bar = view.querySelector('#mall-sort-bar');
    if (bar) bar.innerHTML = sortBarHtml();
  }

  view.innerHTML = `
    <div class="mall-container mall-main">
      <div class="mall-page-title">
        <h1>${escapeHtml(category)}</h1>
        <p>총 ${total}개 상품</p>
      </div>
      <div class="mall-sort-bar" id="mall-sort-bar">${sortBarHtml()}</div>
      <div id="mall-grid-host">${productGrid(items)}</div>
    </div>
  `;

  view.querySelector('#mall-sort-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    sort = btn.dataset.sort;
    paint();
  });
}
