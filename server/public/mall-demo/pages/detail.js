// 상품 상세 페이지
import { getProduct, listProducts } from '../scripts/api.js';
import { escapeHtml, formatPrice, stockLabel, resolveImageUrl } from '../scripts/format.js';
import { productGrid } from '../components/product-card.js';

export async function renderDetail(view, id) {
  let product;
  try {
    product = await getProduct(id);
  } catch (err) {
    if (err.status === 404) {
      view.innerHTML = `
        <div class="mall-container mall-main">
          <div class="mall-empty">
            <div class="mall-empty-icon">?</div>
            <div class="mall-empty-title">존재하지 않는 상품입니다</div>
            <a href="/mall/" data-mall-link class="mall-btn mall-btn--primary" style="margin-top:16px">홈으로</a>
          </div>
        </div>
      `;
      return;
    }
    throw err;
  }

  const stock = stockLabel(product.stock);
  const tagsHtml = (product.tags || [])
    .map((t) => `<span class="mall-tag">${escapeHtml(t)}</span>`)
    .join('');

  // 관련 상품 (같은 카테고리에서 자신 제외 후 무작위 4개)
  const { items: catItems } = await listProducts({ category: product.category, limit: 100, offset: 0 });
  const related = catItems
    .filter((p) => p.id !== product.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 4);

  view.innerHTML = `
    <div class="mall-container mall-main">
      <div class="mall-detail">
        <div class="mall-detail-img">
          <img src="${escapeHtml(resolveImageUrl(product.imageUrl))}" alt="${escapeHtml(product.name)}" />
        </div>
        <div class="mall-detail-info">
          <div class="mall-detail-origin">${escapeHtml(product.origin)}</div>
          <h1 class="mall-detail-name">${escapeHtml(product.name)}</h1>
          <div class="mall-detail-tags">${tagsHtml}</div>

          <div class="mall-detail-price-block">
            <span class="mall-detail-price">${formatPrice(product.price)}</span>
            <span class="mall-detail-unit">/ ${escapeHtml(product.unit || '')}</span>
          </div>

          <dl class="mall-detail-meta">
            <dt>카테고리</dt>
            <dd>${escapeHtml(product.category)}${product.subCategory ? ` · ${escapeHtml(product.subCategory)}` : ''}</dd>
            <dt>산지</dt>
            <dd>${escapeHtml(product.origin)}</dd>
            <dt>중량/단위</dt>
            <dd>${escapeHtml(product.unit || '-')}</dd>
            <dt>재고</dt>
            <dd><span class="${stock.cls}">${escapeHtml(stock.text)}</span></dd>
          </dl>

          <div class="mall-detail-desc">${escapeHtml(product.description)}</div>

          <div class="mall-detail-actions">
            <button type="button" class="mall-btn mall-btn--outline" id="mall-fav-btn">관심상품</button>
            <button type="button" class="mall-btn mall-btn--primary" id="mall-cart-btn">장바구니 담기</button>
          </div>
        </div>
      </div>

      ${related.length > 0 ? `
        <section class="mall-section">
          <div class="mall-section-head">
            <h2>관련 상품</h2>
            <a href="/mall/category/${encodeURIComponent(product.category)}" data-mall-link>
              ${escapeHtml(product.category)} 더 보기 →
            </a>
          </div>
          ${productGrid(related)}
        </section>
      ` : ''}
    </div>
  `;

  const toast = (msg) => {
    window.dispatchEvent(new CustomEvent('mall:toast', { detail: { msg } }));
  };

  const cartBtn = view.querySelector('#mall-cart-btn');
  if (cartBtn) cartBtn.addEventListener('click', () => toast('데모 환경입니다. 실제 결제·배송은 진행되지 않습니다.'));

  const favBtn = view.querySelector('#mall-fav-btn');
  if (favBtn) favBtn.addEventListener('click', () => toast('관심상품에 담았습니다. (데모)'));
}
