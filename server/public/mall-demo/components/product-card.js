// 상품 카드 컴포넌트
import { escapeHtml, formatPrice, productHref, resolveImageUrl } from '../scripts/format.js';

export function productCard(p) {
  const tags = Array.isArray(p.tags) ? p.tags.slice(0, 2) : [];
  const tagsHtml = tags
    .map((t) => `<span class="mall-tag">${escapeHtml(t)}</span>`)
    .join('');

  return `
    <a href="${productHref(p.id)}" data-mall-link class="mall-card" aria-label="${escapeHtml(p.name)}">
      <div class="mall-card-img">
        <img src="${escapeHtml(resolveImageUrl(p.imageUrl))}" alt="" loading="lazy" />
      </div>
      <div class="mall-card-body">
        <div class="mall-card-origin">${escapeHtml(p.origin || '')}</div>
        <div class="mall-card-name">${escapeHtml(p.name)}</div>
        <div class="mall-card-tags">${tagsHtml}</div>
        <div class="mall-card-price">
          ${formatPrice(p.price)}
          <span class="mall-card-price-unit">/ ${escapeHtml(p.unit || '')}</span>
        </div>
      </div>
    </a>
  `;
}

export function productGrid(items) {
  if (!items || items.length === 0) {
    return `
      <div class="mall-empty">
        <div class="mall-empty-icon">∅</div>
        <div class="mall-empty-title">표시할 상품이 없습니다</div>
      </div>
    `;
  }
  return `<div class="mall-grid">${items.map(productCard).join('')}</div>`;
}
