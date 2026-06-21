// History API 라우터
// 라우트:
//   /mall/                        → home
//   /mall/category/:category      → category
//   /mall/product/:id             → detail
//   /mall/search?q=...            → search

import { renderHome } from '../pages/home.js';
import { renderCategory } from '../pages/category.js';
import { renderDetail } from '../pages/detail.js';
import { renderSearch } from '../pages/search.js';
import { renderHeader } from '../components/header.js';
import { renderFooter } from '../components/footer.js';

const root = () => document.getElementById('mall-view');

function matchRoute(pathname) {
  // 기준은 /mall 접두사
  const path = pathname.replace(/^\/mall\/?/, '/');
  if (path === '/' || path === '') {
    return { name: 'home', params: {} };
  }
  let m;
  if ((m = path.match(/^\/category\/([^/]+)\/?$/))) {
    return { name: 'category', params: { category: decodeURIComponent(m[1]) } };
  }
  if ((m = path.match(/^\/product\/([^/]+)\/?$/))) {
    return { name: 'detail', params: { id: decodeURIComponent(m[1]) } };
  }
  if (path.startsWith('/search')) {
    return { name: 'search', params: {} };
  }
  return { name: 'notfound', params: {} };
}

async function render() {
  const view = root();
  if (!view) return;

  const route = matchRoute(window.location.pathname);
  const search = new URLSearchParams(window.location.search);

  // 헤더 active 카테고리 표시 갱신
  renderHeader({
    activeCategory: route.name === 'category' ? route.params.category : null,
    currentQ: route.name === 'search' ? (search.get('q') || '') : '',
  });

  view.innerHTML = '<div class="mall-container mall-main"><p style="color:var(--mall-ink-3)">불러오는 중…</p></div>';

  try {
    if (route.name === 'home') {
      await renderHome(view);
    } else if (route.name === 'category') {
      await renderCategory(view, route.params.category);
    } else if (route.name === 'detail') {
      await renderDetail(view, route.params.id);
    } else if (route.name === 'search') {
      await renderSearch(view, search.get('q') || '');
    } else {
      view.innerHTML = `
        <div class="mall-container mall-main">
          <div class="mall-empty">
            <div class="mall-empty-icon">·_·</div>
            <div class="mall-empty-title">페이지를 찾을 수 없습니다</div>
            <p>요청하신 페이지가 존재하지 않습니다.</p>
            <a href="/mall/" class="mall-btn mall-btn--primary" data-mall-link style="margin-top:16px">홈으로</a>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.error('[mall] render failed', err);
    view.innerHTML = `
      <div class="mall-container mall-main">
        <div class="mall-empty">
          <div class="mall-empty-icon">!</div>
          <div class="mall-empty-title">일시적인 오류가 발생했습니다</div>
          <p>잠시 후 다시 시도해주세요.</p>
        </div>
      </div>
    `;
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
  renderFooter();
}

export function navigate(href) {
  if (!href || href.startsWith('http')) return;
  if (window.location.pathname + window.location.search === href) return;
  window.history.pushState({}, '', href);
  render();
}

// 전역 링크 위임: data-mall-link 속성이 있는 a 클릭 시 SPA 네비
function installLinkHandler() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-mall-link]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/mall')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(href);
  });
}

export function startRouter() {
  installLinkHandler();
  window.addEventListener('popstate', render);
  render();
}
