// 상단 헤더 (로고·검색·카테고리 네비)
import { escapeHtml } from '../scripts/format.js';

const CATEGORIES = ['농산물', '축산물', '수산물'];

function template({ activeCategory, currentQ }) {
  const navHtml = CATEGORIES.map((cat) => {
    const active = cat === activeCategory ? ' is-active' : '';
    return `<a href="/mall/category/${encodeURIComponent(cat)}" data-mall-link class="${active.trim()}">${escapeHtml(cat)}</a>`;
  }).join('');

  return `
    <div class="mall-header-top">
      <a href="/mall/" data-mall-link class="mall-logo" aria-label="홈으로">
        <span class="mall-logo-mark">바</span>
        <span>바로팜몰</span>
      </a>
      <form class="mall-search" id="mall-search-form" role="search">
        <input
          id="mall-search-input"
          type="search"
          name="q"
          placeholder="신선한 상품을 검색해보세요"
          value="${escapeHtml(currentQ || '')}"
          aria-label="상품 검색"
          autocomplete="off"
        />
        <button type="submit" aria-label="검색">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </button>
      </form>
      <div class="mall-header-actions">
        <a href="/mall/" data-mall-link>홈</a>
        <span style="opacity:0.4">|</span>
        <a href="javascript:void(0)" id="mall-login-link">로그인</a>
      </div>
    </div>
    <nav class="mall-nav" aria-label="카테고리">
      <div class="mall-nav-inner">
        <a href="/mall/" data-mall-link${!activeCategory && location.pathname === '/mall/' ? ' class="is-active"' : ''}>전체</a>
        ${navHtml}
      </div>
    </nav>
  `;
}

export function renderHeader({ activeCategory = null, currentQ = '' } = {}) {
  const host = document.getElementById('mall-header');
  if (!host) return;
  host.innerHTML = template({ activeCategory, currentQ });

  const form = host.querySelector('#mall-search-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('#mall-search-input');
      const q = (input && input.value || '').trim();
      if (!q) return;
      // 라우터의 navigate를 직접 호출하지 않고 dispatch
      const href = `/mall/search?q=${encodeURIComponent(q)}`;
      window.history.pushState({}, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  }

  const loginLink = host.querySelector('#mall-login-link');
  if (loginLink) {
    loginLink.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('mall:toast', { detail: { msg: '데모 환경입니다. 로그인 기능은 비활성 상태입니다.' } }));
    });
  }
}
