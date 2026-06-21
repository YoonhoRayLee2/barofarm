// 홈: 히어로 + 카테고리별 추천 6개 × 3섹션
import { listProducts } from '../scripts/api.js';
import { productGrid } from '../components/product-card.js';
import { escapeHtml } from '../scripts/format.js';

const SECTIONS = [
  { category: '농산물', title: '제철 농산물', subtitle: '산지직송 신선 과채' },
  { category: '축산물', title: '오늘의 축산물', subtitle: '한우·돼지·닭·계란까지' },
  { category: '수산물', title: '오늘의 수산물', subtitle: '연안에서 바로 식탁으로' },
];

export async function renderHome(view) {
  const sectionData = await Promise.all(
    SECTIONS.map(async (s) => {
      const { items } = await listProducts({ category: s.category, limit: 6, offset: 0 });
      return { ...s, items };
    }),
  );

  const sectionsHtml = sectionData
    .map((s) => `
      <section class="mall-section">
        <div class="mall-section-head">
          <h2>${escapeHtml(s.title)}</h2>
          <a href="/mall/category/${encodeURIComponent(s.category)}" data-mall-link>
            ${escapeHtml(s.category)} 전체 보기 →
          </a>
        </div>
        ${productGrid(s.items)}
      </section>
    `)
    .join('');

  view.innerHTML = `
    <div class="mall-container mall-main">
      <section class="mall-hero" aria-label="브랜드 소개">
        <div class="mall-hero-shapes" aria-hidden="true"></div>
        <h1>오늘 수확한 신선함을<br>식탁 위로</h1>
        <p>산지에서 바로 보내는 바로팜몰. 농수축산물 직거래로 더 신선하고 합리적인 가격을 만나보세요.</p>
        <a href="/mall/category/농산물" data-mall-link class="mall-btn mall-btn--primary">신선 농산물 보러가기</a>
      </section>

      ${sectionsHtml}
    </div>
  `;
}
