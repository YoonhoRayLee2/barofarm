// 검색 결과 페이지
import { listProducts } from '../scripts/api.js';
import { productGrid } from '../components/product-card.js';
import { escapeHtml } from '../scripts/format.js';

export async function renderSearch(view, q) {
  q = (q || '').trim();
  if (!q) {
    view.innerHTML = `
      <div class="mall-container mall-main">
        <div class="mall-page-title">
          <h1>검색</h1>
          <p>검색어를 입력해주세요.</p>
        </div>
      </div>
    `;
    return;
  }

  const { items, total } = await listProducts({ q, limit: 100, offset: 0 });

  view.innerHTML = `
    <div class="mall-container mall-main">
      <div class="mall-page-title">
        <h1>"${escapeHtml(q)}" 검색 결과</h1>
        <p>총 ${total}개 상품이 발견되었습니다.</p>
      </div>
      ${total === 0 ? `
        <div class="mall-empty">
          <div class="mall-empty-icon">∅</div>
          <div class="mall-empty-title">검색 결과가 없습니다</div>
          <p>다른 검색어를 입력하거나 카테고리에서 둘러보세요.</p>
          <a href="/mall/" data-mall-link class="mall-btn mall-btn--primary" style="margin-top:16px">홈으로</a>
        </div>
      ` : productGrid(items)}
    </div>
  `;
}
