/**
 * SPA Router — Barofarm
 * History API based router with cleanup hooks for page transitions.
 *
 * Pages are loaded via dynamic import: `/app/pages/<name>.js`.
 * Each page module should export `default` async function `(params, root) => HTMLElement`
 * and optionally `cleanup()` for resource teardown (camera tracks, sockets, timers).
 *
 * @module router
 */

import { getSecureItem, setSecureItem } from './native-bridge.js'; // ensure window.onPush / onAppResume hooks exist
import { getMe, clearAuthToken } from './api.js';
// api.js / socket.js are imported by individual pages on demand.

/* ----------------------------- Route table ----------------------------- */

/**
 * @typedef {Object} Route
 * @property {RegExp}                            pattern
 * @property {(params: Object) => Promise<HTMLElement>} loader
 */

/** @type {Route[]} */
const routes = [];

/**
 * Register a route.
 * Pattern is a path string with `:param` placeholders, e.g. '/app/live/:liveId'.
 * @param {string} pattern
 * @param {(params: Object) => Promise<HTMLElement>} loader
 */
export function register(pattern, loader) {
  const re = patternToRegExp(pattern);
  routes.push({ pattern: re, loader });
}

/**
 * Convert a route pattern with :params into a RegExp with named groups.
 * @param {string} pattern
 * @returns {RegExp}
 */
function patternToRegExp(pattern) {
  const escaped = pattern.replace(/\//g, '\\/').replace(/:([A-Za-z0-9_]+)/g, '(?<$1>[^/]+)');
  return new RegExp(`^${escaped}$`);
}

/* ----------------------------- Cleanup hook ----------------------------- */

/** @type {null | (() => void | Promise<void>)} */
let currentCleanup = null;

/**
 * Pages can register a cleanup function for the active route.
 * Called automatically before the next route renders.
 * @param {() => void | Promise<void>} fn
 */
export function setCleanup(fn) {
  currentCleanup = fn;
}

async function runCleanup() {
  if (typeof currentCleanup === 'function') {
    try {
      await currentCleanup();
    } catch (err) {
      console.error('[router] cleanup error', err);
    }
    currentCleanup = null;
  }
}

/* ----------------------------- Navigation ----------------------------- */

/**
 * Navigate to a path (push to history + render).
 * @param {string} path
 */
export async function navigate(path) {
  const current = window.location.pathname + window.location.search;
  if (path !== current) {
    window.history.pushState({}, '', path);
  }
  await render(path);
}

/**
 * Replace the current entry (no extra history step).
 * @param {string} path
 */
export async function replace(path) {
  window.history.replaceState({}, '', path);
  await render(path);
}

/* ----------------------------- Render ----------------------------- */

async function render(path) {
  await runCleanup();

  // Auth guard — redirect to /app/login if user is not authenticated
  const redirected = await authGuard(path);
  if (redirected) {
    await render('/app/login');
    return;
  }

  const root = document.getElementById('app-root');
  if (!root) {
    console.error('[router] #app-root not found');
    return;
  }

  const match = matchRoute(path);
  root.innerHTML = '';

  try {
    const node = match
      ? await match.loader(match.params)
      : await renderNotFound();
    if (node instanceof HTMLElement) {
      // Route-enter animation: start in invisible+shifted state, then transition in
      node.classList.add('route-enter');
      root.appendChild(node);
      // Force a reflow so the initial state is painted before the transition starts
      // eslint-disable-next-line no-unused-expressions
      node.offsetHeight;
      node.classList.add('route-enter-active');
      node.classList.remove('route-enter');
    }
  } catch (err) {
    console.error('[router] render error', err);
    root.appendChild(renderError(err));
  }
}

function matchRoute(path) {
  const pathname = path.split('?')[0];
  for (const r of routes) {
    const m = r.pattern.exec(pathname);
    if (m) {
      return { loader: r.loader, params: m.groups || {} };
    }
  }
  return null;
}

/* ----------------------------- Placeholders ----------------------------- */

function placeholder(text) {
  const el = document.createElement('section');
  el.className = 'container full-h center';
  el.innerHTML = `
    <div class="stack-12 text-center">
      <h1 class="text-display-m">바로팜</h1>
      <p class="text-body-l ink-soft">${escapeHtml(text)}</p>
    </div>
  `;
  return el;
}

async function renderNotFound() {
  const el = document.createElement('section');
  el.className = 'container full-h center';
  el.innerHTML = `
    <div class="stack-12 text-center">
      <h1 class="text-display-m">404</h1>
      <p class="text-body-l ink-soft">페이지를 찾을 수 없습니다.</p>
      <a class="text-body-m" href="/app/" data-link>홈으로</a>
    </div>
  `;
  return el;
}

function renderError(err) {
  const el = document.createElement('section');
  el.className = 'container full-h center';
  el.innerHTML = `
    <div class="stack-12 text-center">
      <h1 class="text-headline ink-danger">오류</h1>
      <p class="text-body-m ink-soft">${escapeHtml(err.message || String(err))}</p>
    </div>
  `;
  return el;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ----------------------------- Auth guard ----------------------------- */

/**
 * Paths that do not require authentication.
 * @type {string[]}
 */
const AUTH_EXEMPT = [
  '/app/login',
  '/app/signup',
  '/app/forgot-password',
  '/app/_storybook',
  '/app/terms',
  '/app/privacy',
];

/**
 * Unauthenticated guard. Runs before every route render.
 * Verifies token presence first (fast path), then calls GET /api/auth/me to
 * confirm the token is still valid on the server.
 * On 401 the token is cleared and the user is redirected to login.
 * @param {string} path
 * @returns {Promise<boolean>} true if a redirect was performed
 */
async function authGuard(path) {
  // Exempt paths — no auth required
  if (AUTH_EXEMPT.includes(path)) return false;

  // Check stored token (fast path — avoids a server round-trip on first load
  // when the token is clearly absent)
  const token = await getSecureItem('barofarm_token');
  if (!token) {
    window.history.replaceState({}, '', '/app/login');
    return true;
  }

  // Validate token against server
  try {
    const me = await getMe();
    if (me) {
      // Refresh cached user object with latest server data
      await setSecureItem('user', JSON.stringify(me));
    }
  } catch {
    // 401 or network error — clear stale token and redirect
    await clearAuthToken();
    window.history.replaceState({}, '', '/app/login');
    return true;
  }

  return false;
}

/* ----------------------------- Default routes ----------------------------- */

register('/app/',             async ()       => import('/app/pages/home.js').then(m => m.default()));
register('/app',              async ()       => import('/app/pages/home.js').then(m => m.default()));
register('/app/login',        async ()       => import('/app/pages/login.js').then(m => m.default()));
register('/app/signup',       async ()       => import('/app/pages/signup.js').then(m => m.default()));
register('/app/forgot-password', async ()    => import('/app/pages/forgot-password.js').then(m => m.default()));
register('/app/home',         async ()       => import('/app/pages/home.js').then(m => m.default()));
register('/app/profile',      async ()       => import('/app/pages/profile.js').then(m => m.default()));
register('/app/chat',         async ()       => import('/app/pages/chat.js').then(m => m.default()));
register('/app/chat-room/:id', async (p) => import('/app/pages/chat-room.js').then(m => m.default(p)));
register('/app/settings',     async ()       => import('/app/pages/settings.js').then(m => m.default()));
register('/app/live-create',  async ()       => import('/app/pages/live-create.js').then(m => m.default()));
register('/app/create-auction', async ()     => import('/app/pages/create-auction.js').then(m => m.default()));
register('/app/product-register', async ()    => import('/app/pages/product-register.js').then(m => m.default()));
register('/app/my-products',         async ()  => import('/app/pages/my-products.js').then(m => m.default()));
register('/app/product-detail/:id',  async (p) => import('/app/pages/product-detail.js').then(m => m.default(p)));
register('/app/auction-detail/:id', async (p) => import('/app/pages/auction-detail.js').then(m => m.default(p)));
register('/app/live-seller/:liveId', async (p) => import('/app/pages/live-seller.js').then(m => m.default(p)));
register('/app/live-buyer/:liveId',  async (p) => import('/app/pages/live-buyer.js').then(m => m.default(p)));
register('/app/profile/history',     async ()  => import('/app/pages/profile-history.js').then(m => m.default()));
register('/app/profile/orders',      async ()  => import('/app/pages/profile-orders.js').then(m => m.default()));
register('/app/delivery-addresses',  async ()  => import('/app/pages/delivery-addresses.js').then(m => m.default()));
register('/app/seller/sales',            async ()  => import('/app/pages/seller-sales.js').then(m => m.default()));
register('/app/seller/unshipped',        async ()  => import('/app/pages/seller-unshipped.js').then(m => m.default()));
register('/app/seller/shipping-policy',  async ()  => import('/app/pages/shipping-policy.js').then(m => m.default()));
register('/app/order-detail/:id',    async (p) => import('/app/pages/order-detail.js').then(m => m.default(p)));
register('/app/terms',               async ()  => import('/app/pages/terms.js').then(m => m.default()));
register('/app/privacy',             async ()  => import('/app/pages/privacy.js').then(m => m.default()));
register('/app/_storybook',          async ()  => import('/app/pages/_storybook.js').then(m => m.default()));
register('/app/dm',                  async ()  => import('/app/pages/dm.js').then(m => m.default()));
register('/app/user/:id',            async (p) => import('/app/pages/user-profile.js').then(m => m.default(p)));
register('/app/consignment/apply',   async ()  => import('/app/pages/consignment-apply.js').then(m => m.default()));
register('/app/consignment/find',    async ()  => import('/app/pages/consignment-find.js').then(m => m.default()));
register('/app/consignment/:id',     async (p) => import('/app/pages/consignment-detail.js').then(m => m.default(p)));
register('/app/market-prices/:itemCode', async (p) => import('/app/pages/market-prices.js').then(m => m.default(p)));
register('/app/group-deals',         async ()  => import('/app/pages/group-deal-list.js').then(m => m.default()));
register('/app/group-deals/create',  async ()  => import('/app/pages/group-deal-create.js').then(m => m.default()));
register('/app/group-deals/:id',     async (p) => import('/app/pages/group-deal-detail.js').then(m => m.default(p)));

/* ----------------------------- Global handlers ----------------------------- */

/** Intercept clicks on `<a data-link>` to use SPA navigation. */
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const a = target.closest('a[data-link]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('//')) return;
  e.preventDefault();
  navigate(href);
});

window.addEventListener('popstate', () => {
  render(window.location.pathname);
});

/* ----------------------------- Boot ----------------------------- */

// Restore saved theme before first render to prevent flash
(function restoreTheme() {
  const saved = localStorage.getItem('barofarm_theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.setAttribute('data-theme', saved);
  }
})();

render(window.location.pathname);
