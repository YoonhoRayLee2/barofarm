// Barofarm Admin Frontend
// Shared utilities + per-page bootstrap

const TOKEN_KEY = 'adminToken';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = Object.assign(
    { 'Content-Type': 'application/json' },
    options.headers || {},
    token ? { Authorization: `Bearer ${token}` } : {},
  );
  const res = await fetch(url, Object.assign({}, options, { headers }));
  if (res.status === 401) {
    clearToken();
    window.location.href = '/admin';
    throw new Error('unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && data.error ? data.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function formatKRW(value) {
  const n = Number(value || 0);
  return `${n.toLocaleString('ko-KR')}원`;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function formatDateOnly(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const SHIPPING_STATUS_LABEL = {
  payment_complete: '결제완료',
  shipped: '배송중',
  purchase_confirmed: '구매확정',
  settlement_complete: '정산완료',
};

function shippingStatusLabel(s) {
  return SHIPPING_STATUS_LABEL[s] || s || '-';
}

function statusBadge(status) {
  if (status === 'pending') return '<span class="badge badge--pending">대기</span>';
  if (status === 'paid') return '<span class="badge badge--paid">완료</span>';
  if (status === 'cancelled') return '<span class="badge badge--cancelled">취소</span>';
  return `<span class="badge badge--info">${escapeHtml(status || '-')}</span>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function roleBadge(role) {
  if (role === 'seller') return '<span class="badge badge--info">판매자</span>';
  return '<span class="badge">구매자</span>';
}

function userStatusBadge(status) {
  if (status === 'suspended') return '<span class="badge badge--danger">정지</span>';
  return '<span class="badge badge--success">활성</span>';
}

function renderPagination(containerId, currentPage, total, pageSize, onPageChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const totalPages = Math.ceil(total / pageSize) || 1;
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    if (i === currentPage) html += `<span class="page-btn page-btn--active">${i}</span>`;
    else html += `<button class="page-btn" data-page="${i}">${i}</button>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => onPageChange(Number(btn.dataset.page)));
  });
}

function bindLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    clearToken();
    window.location.href = '/admin';
  });
}

/* Responsive sidebar drawer: hamburger + backdrop (injected once, mobile only) */
function initResponsiveNav() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  if (document.querySelector('.admin-hamburger')) return; // already injected

  const hamburger = document.createElement('button');
  hamburger.type = 'button';
  hamburger.className = 'admin-hamburger';
  hamburger.setAttribute('aria-label', '메뉴 열기');
  hamburger.textContent = '☰'; // ☰

  const backdrop = document.createElement('div');
  backdrop.className = 'admin-backdrop';

  function open() {
    sidebar.classList.add('sidebar--open');
    backdrop.classList.add('admin-backdrop--open');
  }
  function close() {
    sidebar.classList.remove('sidebar--open');
    backdrop.classList.remove('admin-backdrop--open');
  }

  hamburger.addEventListener('click', () => {
    if (sidebar.classList.contains('sidebar--open')) close();
    else open();
  });
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  // Close after navigating via a sidebar link
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('.sidebar__link')) close();
  });

  document.body.appendChild(backdrop);
  document.body.appendChild(hamburger);
}

/* Dark/light theme toggle: inject a button near the sidebar logout, persist to localStorage */
function initThemeToggle() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  if (sidebar.querySelector('.admin-theme-toggle')) return; // already injected

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'admin-theme-toggle';

  function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }
  function render() {
    const dark = currentTheme() === 'dark';
    btn.textContent = dark ? '☀️ 라이트 모드' : '🌙 다크 모드';
    btn.setAttribute('aria-label', dark ? '라이트 모드로 전환' : '다크 모드로 전환');
  }
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('adminTheme', theme); } catch (e) { /* ignore */ }
    render();
  }

  btn.addEventListener('click', () => {
    apply(currentTheme() === 'dark' ? 'light' : 'dark');
  });

  render();
  const logout = document.getElementById('logout-btn');
  if (logout && logout.parentNode) logout.parentNode.insertBefore(btn, logout);
  else sidebar.appendChild(btn);
}

/* -------------------- Custom dialogs & toast (native confirm/alert/prompt replacement) -------------------- */

function _adminBuildDialog({ title, message, confirmLabel, cancelLabel, danger, withInput, placeholder }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'admin-dialog-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'admin-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    if (title) {
      const titleEl = document.createElement('p');
      titleEl.className = 'admin-dialog__title';
      titleEl.textContent = title;
      dialog.appendChild(titleEl);
    }
    if (message) {
      const msgEl = document.createElement('p');
      msgEl.className = 'admin-dialog__message';
      msgEl.textContent = message;
      dialog.appendChild(msgEl);
    }

    let input = null;
    if (withInput) {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'admin-dialog__input';
      if (placeholder) input.placeholder = placeholder;
      dialog.appendChild(input);
    }

    const actions = document.createElement('div');
    actions.className = 'admin-dialog__actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'admin-dialog__btn admin-dialog__btn--cancel';
    cancelBtn.textContent = cancelLabel;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'admin-dialog__btn admin-dialog__btn--confirm' + (danger ? ' is-danger' : '');
    confirmBtn.textContent = confirmLabel;

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    const previouslyFocused = document.activeElement;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        backdrop.classList.add('is-visible');
        if (input) input.focus();
        else cancelBtn.focus();
      });
    });

    function close(result) {
      backdrop.classList.remove('is-visible');
      backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
      setTimeout(() => { if (backdrop.isConnected) backdrop.remove(); }, 300);
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
      resolve(result);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') close(withInput ? null : false);
      else if (e.key === 'Enter' && withInput) close(input.value);
    }

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(withInput ? null : false); });
    cancelBtn.addEventListener('click', () => close(withInput ? null : false));
    confirmBtn.addEventListener('click', () => close(withInput ? input.value : true));
    document.addEventListener('keydown', onKeyDown);
  });
}

function adminConfirm({ title = '확인', message = '', confirmLabel = '확인', cancelLabel = '취소', danger = false } = {}) {
  return _adminBuildDialog({ title, message, confirmLabel, cancelLabel, danger, withInput: false });
}

function adminPrompt({ title = '입력', message = '', placeholder = '', confirmLabel = '확인', cancelLabel = '취소' } = {}) {
  return _adminBuildDialog({ title, message, confirmLabel, cancelLabel, danger: false, withInput: true, placeholder });
}

function adminToast(message, { type = 'info', duration = 2600 } = {}) {
  let container = document.getElementById('admin-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'admin-toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  while (container.children.length >= 3) container.firstElementChild.remove();

  const toast = document.createElement('div');
  toast.className = `admin-toast admin-toast--${type}`;
  toast.setAttribute('role', 'status');
  const msg = document.createElement('span');
  msg.className = 'admin-toast__msg';
  msg.textContent = String(message);
  toast.appendChild(msg);
  container.appendChild(toast);

  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('is-visible')); });

  function dismiss() {
    toast.classList.remove('is-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    setTimeout(() => { if (toast.isConnected) toast.remove(); }, 300);
  }
  const timer = setTimeout(dismiss, duration);
  toast.addEventListener('click', () => { clearTimeout(timer); dismiss(); }, { once: true });
}

/* -------------------- SVG chart helpers (dependency-free, dark-aware) -------------------- */

// Category colors read from CSS custom properties (single source of truth).
// Fixed order per spec: 과일 채소 곡물 축산 수산 기타
const CATEGORY_ORDER = ['과일', '채소', '곡물', '축산', '수산', '기타'];
const CATEGORY_VARS = {
  '과일': '--cat-fruit',
  '채소': '--cat-veg',
  '곡물': '--cat-grain',
  '축산': '--cat-meat',
  '수산': '--cat-fish',
  '기타': '--cat-etc',
};

function categoryColor(name) {
  const varName = CATEGORY_VARS[name] || '--cat-etc';
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return val || '#607D8B';
}

function _svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function _renderEmpty(el, label) {
  el.innerHTML = `<div class="chart-empty">${escapeHtml(label || '데이터 없음')}</div>`;
}

function _shortNum(n) {
  n = Number(n || 0);
  if (n >= 100000000) return `${(n / 100000000).toFixed(1).replace(/\.0$/, '')}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}천`;
  return n.toLocaleString('ko-KR');
}

/**
 * Vertical bar chart for a time series.
 * series: [{date:'YYYY-MM-DD', value:number}]
 * opts: { valueLabel, formatValue }
 */
function renderLineChart(el, series, opts = {}) {
  if (!el) return;
  const data = Array.isArray(series) ? series : [];
  if (data.length === 0) { _renderEmpty(el, opts.emptyLabel || '데이터 없음'); return; }

  const fmtVal = opts.formatValue || _shortNum;
  const W = 640, H = 260;
  const padL = 56, padR = 16, padT = 16, padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxVal = Math.max(1, ...data.map((d) => Number(d.value || 0)));

  // "nice" max rounded up to a clean gridline value
  const niceMax = _niceCeil(maxVal);
  const ticks = 4;

  const barGap = data.length > 1 ? Math.min(6, plotW / data.length * 0.25) : 4;
  const barW = Math.max(1, plotW / data.length - barGap);

  const svg = _svgEl('svg', {
    class: 'chart-svg', viewBox: `0 0 ${W} ${H}`,
    role: 'img', 'aria-label': opts.ariaLabel || '시계열 막대 차트',
    preserveAspectRatio: 'xMidYMid meet',
  });

  // Y gridlines + labels
  for (let i = 0; i <= ticks; i++) {
    const v = (niceMax / ticks) * i;
    const y = padT + plotH - (v / niceMax) * plotH;
    svg.appendChild(_svgEl('line', {
      x1: padL, y1: y, x2: W - padR, y2: y,
      stroke: 'var(--chart-grid)', 'stroke-width': 1,
    }));
    const t = _svgEl('text', {
      x: padL - 8, y: y + 4, 'text-anchor': 'end',
      'font-size': 11, fill: 'var(--ff-ink-mute)',
    });
    t.textContent = fmtVal(v);
    svg.appendChild(t);
  }

  // Bars
  data.forEach((d, i) => {
    const val = Number(d.value || 0);
    const h = (val / niceMax) * plotH;
    const x = padL + i * (plotW / data.length) + barGap / 2;
    const y = padT + plotH - h;
    const rect = _svgEl('rect', {
      x, y: h > 0 ? y : padT + plotH - 1, width: barW, height: Math.max(h, val > 0 ? 2 : 0),
      rx: Math.min(4, barW / 2), fill: 'var(--ff-accent)',
    });
    const title = _svgEl('title', {});
    title.textContent = `${d.date}: ${fmtVal(val)}`;
    rect.appendChild(title);
    svg.appendChild(rect);
  });

  // X labels: first, middle, last (avoid crowding)
  const xIdx = data.length <= 3
    ? data.map((_, i) => i)
    : [0, Math.floor((data.length - 1) / 2), data.length - 1];
  xIdx.forEach((i) => {
    const x = padL + i * (plotW / data.length) + (plotW / data.length) / 2;
    const t = _svgEl('text', {
      x, y: H - 12, 'text-anchor': 'middle',
      'font-size': 11, fill: 'var(--ff-ink-mute)',
    });
    t.textContent = _mmdd(data[i].date);
    svg.appendChild(t);
  });

  el.innerHTML = '';
  el.appendChild(svg);
}

function _niceCeil(v) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const frac = v / base;
  let nice;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function _mmdd(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length >= 3) return `${Number(parts[1])}/${Number(parts[2])}`;
  return String(dateStr);
}

/**
 * Donut chart with legend.
 * segments: [{label, value, color}]  (color optional; falls back to categoryColor)
 * opts: { formatValue }
 * Renders SVG donut + an accessible legend (label + value + percent) so identity
 * is never color-alone (required — category palette fails CVD separation).
 */
function renderDonutChart(el, segments, opts = {}) {
  if (!el) return;
  const data = (Array.isArray(segments) ? segments : []).filter((s) => Number(s.value || 0) > 0);
  if (data.length === 0) { _renderEmpty(el, opts.emptyLabel || '데이터 없음'); return; }

  const fmtVal = opts.formatValue || _shortNum;
  const total = data.reduce((sum, s) => sum + Number(s.value || 0), 0);
  const size = 160, cx = size / 2, cy = size / 2, r = 62, stroke = 26;
  const circ = 2 * Math.PI * r;

  const svg = _svgEl('svg', {
    class: 'chart-svg', viewBox: `0 0 ${size} ${size}`,
    role: 'img', 'aria-label': opts.ariaLabel || '카테고리 분포 도넛 차트',
    preserveAspectRatio: 'xMidYMid meet',
  });

  let offset = 0;
  data.forEach((s) => {
    const frac = Number(s.value || 0) / total;
    const color = s.color || categoryColor(s.label);
    const arc = _svgEl('circle', {
      cx, cy, r, fill: 'none',
      stroke: color, 'stroke-width': stroke,
      'stroke-dasharray': `${frac * circ} ${circ}`,
      'stroke-dashoffset': -offset,
      transform: `rotate(-90 ${cx} ${cy})`,
    });
    const title = _svgEl('title', {});
    title.textContent = `${s.label}: ${fmtVal(s.value)} (${Math.round(frac * 100)}%)`;
    arc.appendChild(title);
    svg.appendChild(arc);
    offset += frac * circ;
  });

  // Center total label
  const t1 = _svgEl('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800, fill: 'var(--ff-ink)' });
  t1.textContent = fmtVal(total);
  const t2 = _svgEl('text', { x: cx, y: cy + 15, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--ff-ink-mute)' });
  t2.textContent = opts.centerLabel || '합계';
  svg.appendChild(t1);
  svg.appendChild(t2);

  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  legend.innerHTML = data.map((s) => {
    const frac = Number(s.value || 0) / total;
    const color = s.color || categoryColor(s.label);
    return `<div class="chart-legend__item">
      <span class="chart-legend__swatch" style="background:${escapeHtml(color)}"></span>
      <span class="chart-legend__label">${escapeHtml(s.label)}${s.sub ? ` <span class="chart-legend__pct">(${escapeHtml(s.sub)})</span>` : ''}</span>
      <span class="chart-legend__val">${fmtVal(s.value)} <span class="chart-legend__pct">${Math.round(frac * 100)}%</span></span>
    </div>`;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'donut-wrap';
  wrap.appendChild(svg);
  wrap.appendChild(legend);

  el.innerHTML = '';
  el.appendChild(wrap);
}

/* -------------------- Dashboard page (/admin) -------------------- */

function showLoginScreen() {
  const login = document.getElementById('login-screen');
  const dash = document.getElementById('dashboard-screen');
  if (login) login.hidden = false;
  if (dash) dash.hidden = true;
}

function showDashboardScreen() {
  const login = document.getElementById('login-screen');
  const dash = document.getElementById('dashboard-screen');
  if (login) login.hidden = true;
  if (dash) dash.hidden = false;
  initResponsiveNav(); // sidebar is now visible → enable mobile drawer
  initThemeToggle(); // sidebar is now visible → enable theme toggle
}

async function loadDashboard() {
  const tbody = document.getElementById('recent-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><span class="spinner"></span> 불러오는 중...</td></tr>';
  }
  try {
    const data = await apiFetch('/admin/api/dashboard');
    const todayGrossEl = document.getElementById('stat-today-gross');
    const todayCountEl = document.getElementById('stat-today-count');
    const monthGrossEl = document.getElementById('stat-month-gross');
    const monthCountEl = document.getElementById('stat-month-count');
    const grossEl = document.getElementById('stat-gross');
    const feeEl = document.getElementById('stat-fee');
    const pendingEl = document.getElementById('stat-pending');
    if (todayGrossEl) todayGrossEl.textContent = formatKRW(data.todayGross);
    if (todayCountEl) todayCountEl.textContent = `${Number(data.todayCount ?? 0).toLocaleString('ko-KR')}건`;
    if (monthGrossEl) monthGrossEl.textContent = formatKRW(data.monthGross);
    if (monthCountEl) monthCountEl.textContent = `${Number(data.monthCount ?? 0).toLocaleString('ko-KR')}건`;
    if (grossEl) grossEl.textContent = formatKRW(data.totalGross);
    if (feeEl) feeEl.textContent = formatKRW(data.totalFee);
    if (pendingEl) pendingEl.textContent = `${Number(data.pendingSettlements || 0).toLocaleString('ko-KR')}건`;

    if (tbody) {
      const rows = Array.isArray(data.recentAuctions) ? data.recentAuctions : [];
      if (rows.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7">최근 낙찰 내역이 없습니다.</td></tr>';
      } else {
        tbody.innerHTML = rows
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(r.auction_id ?? r.id ?? '-')}</td>
            <td>${escapeHtml(r.seller_name ?? '-')}</td>
            <td>${escapeHtml(r.product_name ?? r.title ?? '-')}</td>
            <td>${formatKRW(r.current_price)}</td>
            <td>${formatKRW(r.seller_fee_amt)}</td>
            <td>${shippingStatusLabel(r.delivery_status)}</td>
            <td class="text-muted">${formatDate(r.created_at ?? r.ended_at ?? r.winning_at)}</td>
          </tr>`,
          )
          .join('');
      }
    }
  } catch (err) {
    console.error('[admin] dashboard load failed:', err);
    if (tbody) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">불러오기 실패: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
  loadDashboardCharts();
}

async function loadDashboardCharts() {
  const trendEl = document.getElementById('chart-gross-trend');
  const catEl = document.getElementById('chart-category');

  if (trendEl) {
    trendEl.innerHTML = '<div class="chart-empty"><span class="spinner"></span></div>';
    try {
      const data = await apiFetch('/admin/api/stats/timeseries?metric=gross&days=30');
      const series = Array.isArray(data && data.series) ? data.series : [];
      renderLineChart(trendEl, series, {
        formatValue: (v) => `${_shortNum(v)}원`,
        ariaLabel: '최근 30일 매출 추이',
        emptyLabel: '매출 데이터가 없습니다.',
      });
    } catch (err) {
      console.error('[admin] timeseries load failed:', err);
      _renderEmpty(trendEl, `불러오기 실패: ${err.message}`);
    }
  }

  if (catEl) {
    catEl.innerHTML = '<div class="chart-empty"><span class="spinner"></span></div>';
    try {
      const data = await apiFetch('/admin/api/stats/category');
      const cats = Array.isArray(data && data.categories) ? data.categories : [];
      // Preserve canonical category order for stable colors.
      const byName = {};
      cats.forEach((c) => { byName[c.category] = c; });
      const segments = CATEGORY_ORDER
        .map((name) => byName[name])
        .filter(Boolean)
        .map((c) => ({
          label: c.category,
          value: Number(c.gross || 0),
          color: categoryColor(c.category),
          sub: `${Number(c.productCount || 0).toLocaleString('ko-KR')}개`,
        }));
      // Append any unexpected categories not in canonical order.
      cats.filter((c) => CATEGORY_ORDER.indexOf(c.category) === -1).forEach((c) => {
        segments.push({ label: c.category, value: Number(c.gross || 0), color: categoryColor(c.category), sub: `${Number(c.productCount || 0).toLocaleString('ko-KR')}개` });
      });
      renderDonutChart(catEl, segments, {
        formatValue: (v) => `${_shortNum(v)}원`,
        ariaLabel: '카테고리별 매출 분포',
        centerLabel: '매출',
        emptyLabel: '카테고리 데이터가 없습니다.',
      });
    } catch (err) {
      console.error('[admin] category stats load failed:', err);
      _renderEmpty(catEl, `불러오기 실패: ${err.message}`);
    }
  }
}

async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  if (!username || !password) {
    errorEl.textContent = '아이디와 비밀번호를 입력하세요.';
    return;
  }
  try {
    const res = await fetch('/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      errorEl.textContent = (data && data.error) || '로그인에 실패했습니다.';
      return;
    }
    setToken(data.token);
    showDashboardScreen();
    loadDashboard();
  } catch (err) {
    errorEl.textContent = '서버에 연결할 수 없습니다.';
  }
}

function initDashboardPage() {
  bindLogout();
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) loginBtn.addEventListener('click', handleLogin);
  ['login-username', 'login-password'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
      });
    }
  });

  if (getToken()) {
    showDashboardScreen();
    loadDashboard();
  } else {
    showLoginScreen();
  }
}

/* -------------------- Settlements page (/admin/settlements) -------------------- */

function renderSettlementsTable(rows, filterStatus) {
  const tbody = document.getElementById('settlements-tbody');
  if (!tbody) return;
  const filtered = filterStatus
    ? rows.filter((r) => r.status === filterStatus)
    : rows;
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">정산 데이터가 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered
    .map(
      (r) => `
      <tr data-id="${escapeHtml(r.id)}">
        <td><a class="link" data-action="detail" data-id="${escapeHtml(r.id)}" style="cursor:pointer">${escapeHtml(r.id)}</a></td>
        <td>${escapeHtml(r.seller_name_display ?? r.seller_name ?? r.seller_id ?? '-')}</td>
        <td class="text-muted">${formatDateOnly(r.period_start)} ~ ${formatDateOnly(r.period_end)}</td>
        <td>${Number(r.auction_count || 0).toLocaleString('ko-KR')}</td>
        <td>${formatKRW(r.gross_amount)}</td>
        <td>${formatKRW(r.fee_amount)}</td>
        <td>${formatKRW(r.net_amount)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${
          r.status === 'pending'
            ? `<button class="btn-small" data-action="pay" data-id="${escapeHtml(r.id)}">정산 완료</button>`
            : r.status === 'paid'
              ? `<span class="text-muted">${r.paid_at ? formatDate(r.paid_at) : '-'}</span> <button class="btn-small btn-danger" data-action="cancel" data-id="${escapeHtml(r.id)}">취소</button>`
              : `<span class="text-muted">${r.paid_at ? formatDate(r.paid_at) : '-'}</span>`
        }</td>
      </tr>`,
    )
    .join('');
}

let _settlementsCache = [];

async function loadSettlements() {
  const filter = document.getElementById('status-filter');
  const tbody = document.getElementById('settlements-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9"><span class="spinner"></span> 불러오는 중...</td></tr>';
  }
  try {
    const data = await apiFetch('/admin/api/settlements');
    _settlementsCache = Array.isArray(data) ? data : [];
    renderSettlementsTable(_settlementsCache, filter ? filter.value : '');
  } catch (err) {
    console.error('[admin] settlements load failed:', err);
    if (tbody) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="9">불러오기 실패: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

async function handleGenerate() {
  const startEl = document.getElementById('period-start');
  const endEl = document.getElementById('period-end');
  const msgEl = document.getElementById('generate-msg');
  const btn = document.getElementById('generate-btn');
  msgEl.className = 'generate-msg';
  msgEl.textContent = '';
  const periodStart = startEl.value;
  const periodEnd = endEl.value;
  if (!periodStart || !periodEnd) {
    msgEl.className = 'generate-msg error';
    msgEl.textContent = '기간을 선택하세요.';
    return;
  }
  if (periodStart > periodEnd) {
    msgEl.className = 'generate-msg error';
    msgEl.textContent = '시작일이 종료일보다 늦습니다.';
    return;
  }
  btn.disabled = true;
  try {
    const data = await apiFetch('/admin/api/settlements/generate', {
      method: 'POST',
      body: JSON.stringify({ periodStart, periodEnd }),
    });
    msgEl.className = 'generate-msg success';
    msgEl.textContent = `${Number(data.generated || 0).toLocaleString('ko-KR')}건의 정산이 생성되었습니다.`;
    await loadSettlements();
    loadSettlementSummary();
  } catch (err) {
    msgEl.className = 'generate-msg error';
    msgEl.textContent = `생성 실패: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

async function openSettlementDetail(id) {
  const modal = document.getElementById('detail-modal');
  const metaEl = document.getElementById('modal-meta');
  const tbody = document.getElementById('modal-tbody');
  const titleEl = document.getElementById('modal-title');
  if (!modal || !metaEl || !tbody || !titleEl) return;
  modal.hidden = false;
  metaEl.innerHTML = '<span class="text-muted"><span class="spinner"></span> 불러오는 중...</span>';
  tbody.innerHTML = '';
  try {
    const data = await apiFetch(`/admin/api/settlements/${encodeURIComponent(id)}`);
    titleEl.textContent = `정산 #${data.id} — ${data.seller_name_display ?? data.seller_name ?? data.seller_id ?? '-'}`;
    metaEl.innerHTML = `
      <span>기간: ${formatDateOnly(data.period_start)} ~ ${formatDateOnly(data.period_end)}</span>
      <span>총낙찰액: <strong>${formatKRW(data.gross_amount)}</strong></span>
      <span>수수료: <strong>${formatKRW(data.fee_amount)}</strong></span>
      <span>실지급: <strong>${formatKRW(data.net_amount)}</strong></span>
      <span>상태: ${statusBadge(data.status)}</span>
    `;
    const auctions = Array.isArray(data.auctions) ? data.auctions : [];
    if (!auctions.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">경매 내역 없음</td></tr>';
    } else {
      tbody.innerHTML = auctions
        .map(
          (a) => `
        <tr>
          <td>${escapeHtml(a.id)}</td>
          <td>${escapeHtml(a.product_name)}</td>
          <td>${formatKRW(a.current_price)}</td>
          <td>${formatKRW(a.seller_fee_amt)}</td>
          <td>${shippingStatusLabel(a.delivery_status)}</td>
          <td class="text-muted">${formatDate(a.created_at)}</td>
        </tr>`,
        )
        .join('');
    }
  } catch (err) {
    metaEl.innerHTML = `<span style="color:var(--danger)">불러오기 실패: ${escapeHtml(err.message)}</span>`;
  }
}

async function handlePay(id, button) {
  if (!id) return;
  if (!(await adminConfirm({ title: '정산 완료', message: '이 정산을 완료 처리하시겠습니까?' }))) return;
  button.disabled = true;
  try {
    await apiFetch(`/admin/api/settlements/${encodeURIComponent(id)}/pay`, {
      method: 'PATCH',
    });
    await loadSettlements();
    loadSettlementSummary();
  } catch (err) {
    adminToast(`처리 실패: ${err.message}`, { type: 'error' });
    button.disabled = false;
  }
}

async function handleCancelSettlement(id, button) {
  if (!id) return;
  if (!(await adminConfirm({ title: '정산 취소', message: '이 정산을 취소(대기 상태로 되돌리기)하시겠습니까?', danger: true }))) return;
  button.disabled = true;
  try {
    await apiFetch(`/admin/api/settlements/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    });
    await loadSettlements();
    loadSettlementSummary();
  } catch (err) {
    adminToast(`처리 실패: ${err.message}`, { type: 'error' });
    button.disabled = false;
  }
}

async function handleExportCsv() {
  const typeEl = document.getElementById('export-type');
  const fromEl = document.getElementById('export-from');
  const toEl = document.getElementById('export-to');
  const msgEl = document.getElementById('export-msg');
  const btn = document.getElementById('export-btn');
  if (msgEl) { msgEl.className = 'generate-msg'; msgEl.textContent = ''; }
  const type = typeEl ? typeEl.value : 'settlements';
  const params = new URLSearchParams({ type });
  if (fromEl && fromEl.value) params.set('from', fromEl.value);
  if (toEl && toEl.value) params.set('to', toEl.value);
  if (btn) btn.disabled = true;
  try {
    const token = getToken();
    const res = await fetch(`/admin/api/stats/export?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) { clearToken(); window.location.href = '/admin'; return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (msgEl) { msgEl.className = 'generate-msg success'; msgEl.textContent = 'CSV 다운로드를 시작했습니다.'; }
  } catch (err) {
    if (msgEl) { msgEl.className = 'generate-msg error'; msgEl.textContent = `내보내기 실패: ${err.message}`; }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadSettlementSummary() {
  const cardsEl = document.getElementById('summary-cards');
  const overdueEl = document.getElementById('overdue-list');
  const sellerEl = document.getElementById('seller-status');
  const trendEl = document.getElementById('chart-settle-trend');

  // Summary cards + seller bars + overdue (single summary endpoint)
  if (cardsEl || overdueEl || sellerEl) {
    if (overdueEl) overdueEl.innerHTML = '<div class="overdue-empty">불러오는 중...</div>';
    try {
      const data = await apiFetch('/admin/api/settlements/summary');
      renderSummaryCards(cardsEl, data.byStatus || {});
      renderOverdue(overdueEl, Array.isArray(data.oldestPending) ? data.oldestPending : []);
      renderSellerBars(sellerEl, Array.isArray(data.bySeller) ? data.bySeller : []);
    } catch (err) {
      console.error('[admin] settlement summary load failed:', err);
      if (cardsEl) cardsEl.innerHTML = `<div class="chart-empty">불러오기 실패: ${escapeHtml(err.message)}</div>`;
      if (overdueEl) overdueEl.innerHTML = `<div class="overdue-empty">불러오기 실패: ${escapeHtml(err.message)}</div>`;
      if (sellerEl) _renderEmpty(sellerEl, '불러오기 실패');
    }
  }

  // Settlement trend — reuse timeseries helper (metric=gross; backend has no net metric).
  if (trendEl) {
    trendEl.innerHTML = '<div class="chart-empty"><span class="spinner"></span></div>';
    try {
      const data = await apiFetch('/admin/api/stats/timeseries?metric=gross&days=30');
      const series = Array.isArray(data && data.series) ? data.series : [];
      renderLineChart(trendEl, series, {
        formatValue: (v) => `${_shortNum(v)}원`,
        ariaLabel: '최근 30일 매출 추이',
        emptyLabel: '정산 데이터가 없습니다.',
      });
    } catch (err) {
      console.error('[admin] settlement trend load failed:', err);
      _renderEmpty(trendEl, `불러오기 실패: ${err.message}`);
    }
  }
}

function renderSummaryCards(el, byStatus) {
  if (!el) return;
  const cfg = [
    { key: 'pending', label: '미지급 (대기)', cls: 'summary-card--pending' },
    { key: 'paid', label: '지급 완료', cls: 'summary-card--paid' },
    { key: 'cancelled', label: '취소', cls: 'summary-card--cancelled' },
  ];
  el.innerHTML = cfg.map((c) => {
    const s = byStatus[c.key] || {};
    return `<div class="summary-card ${c.cls}">
      <span class="summary-card__label">${c.label}</span>
      <span class="summary-card__amount">${formatKRW(s.amount)}</span>
      <span class="summary-card__count">${Number(s.count || 0).toLocaleString('ko-KR')}건</span>
    </div>`;
  }).join('');
}

function renderOverdue(el, rows) {
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div class="overdue-empty">지연된 미지급 정산이 없습니다.</div>';
    return;
  }
  const now = Date.now();
  el.innerHTML = rows.map((r) => {
    const created = r.created_at ? new Date(r.created_at).getTime() : now;
    const days = Math.max(0, Math.floor((now - created) / 86400000));
    const ageCls = days >= 7 ? '' : 'overdue-item__age--warn';
    const name = escapeHtml(r.sellerName ?? r.seller_name ?? '-');
    return `<div class="overdue-item">
      <div>
        <div class="overdue-item__seller">${name}</div>
        <div class="overdue-item__period">${formatDateOnly(r.period_start)} ~ ${formatDateOnly(r.period_end)}</div>
      </div>
      <div style="text-align:right">
        <div class="overdue-item__amount">${formatKRW(r.gross_amount)}</div>
        <div class="overdue-item__age ${ageCls}">${days}일 경과</div>
      </div>
    </div>`;
  }).join('');
}

function renderSellerBars(el, rows) {
  if (!el) return;
  if (!rows.length) { _renderEmpty(el, '판매자 데이터가 없습니다.'); return; }
  // Top sellers by pending amount, cap to 8.
  const sorted = rows.slice().sort((a, b) =>
    Number(b.pendingAmount || 0) - Number(a.pendingAmount || 0)).slice(0, 8);
  const maxAmt = Math.max(1, ...sorted.flatMap((r) =>
    [Number(r.pendingAmount || 0), Number(r.paidAmount || 0)]));

  const legend = `<div class="seller-bar__legend">
    <span><i style="background:var(--ff-warn)"></i>미지급</span>
    <span><i style="background:var(--ff-success)"></i>지급</span>
  </div>`;

  const bars = sorted.map((r) => {
    const name = escapeHtml(r.sellerName ?? r.seller_name ?? String(r.sellerId ?? '-'));
    const pAmt = Number(r.pendingAmount || 0);
    const dAmt = Number(r.paidAmount || 0);
    const pW = (pAmt / maxAmt) * 100;
    const dW = (dAmt / maxAmt) * 100;
    return `<div class="seller-bar__row">
      <span class="seller-bar__name" title="${name}">${name}</span>
      <div class="seller-bar__track">
        <div class="seller-bar__meter"><div class="seller-bar__fill seller-bar__fill--pending" style="width:${pW}%"></div></div>
        <span class="seller-bar__val">미지급 ${formatKRW(pAmt)} (${Number(r.pendingCount || 0)}건)</span>
        <div class="seller-bar__meter"><div class="seller-bar__fill seller-bar__fill--paid" style="width:${dW}%"></div></div>
        <span class="seller-bar__val">지급 ${formatKRW(dAmt)} (${Number(r.paidCount || 0)}건)</span>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `${legend}<div class="seller-bars">${bars}</div>`;
}

function initSettlementsPage() {
  if (!getToken()) {
    window.location.href = '/admin';
    return;
  }
  bindLogout();

  // 날짜 기본값: 이번 달 1일 ~ 오늘
  const startInput = document.getElementById('period-start');
  const endInput = document.getElementById('period-end');
  if (startInput && endInput) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const fmt = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    if (!startInput.value) startInput.value = fmt(firstDay);
    if (!endInput.value) endInput.value = fmt(today);
  }

  const genBtn = document.getElementById('generate-btn');
  if (genBtn) genBtn.addEventListener('click', handleGenerate);

  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) exportBtn.addEventListener('click', handleExportCsv);

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => { loadSettlements(); loadSettlementSummary(); });

  const filter = document.getElementById('status-filter');
  if (filter) {
    filter.addEventListener('change', () => {
      renderSettlementsTable(_settlementsCache, filter.value);
    });
  }

  const tbody = document.getElementById('settlements-tbody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const detailLink = e.target.closest('a[data-action="detail"]');
      if (detailLink) {
        openSettlementDetail(detailLink.dataset.id);
        return;
      }
      const cancelBtn = e.target.closest('button[data-action="cancel"]');
      if (cancelBtn) {
        handleCancelSettlement(cancelBtn.dataset.id, cancelBtn);
        return;
      }
      const btn = e.target.closest('button[data-action="pay"]');
      if (!btn) return;
      handlePay(btn.dataset.id, btn);
    });
  }

  const modal = document.getElementById('detail-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  const closeBtn2 = document.getElementById('modal-close-btn2');
  if (closeBtn) closeBtn.addEventListener('click', () => { modal.hidden = true; });
  if (closeBtn2) closeBtn2.addEventListener('click', () => { modal.hidden = true; });
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.hidden = true;
    });
  }

  loadSettlements();
  loadSettlementSummary();
}

/* -------------------- Users page (/admin/users) -------------------- */

function initUsersPage() {
  if (!getToken()) { window.location.href = '/admin'; return; }
  bindLogout();
  let _currentPage = 1;
  let _currentUser = null;

  async function loadUsers(page) {
    _currentPage = page;
    const q = document.getElementById('user-search').value.trim();
    const role = document.getElementById('user-role-filter').value;
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><span class="spinner"></span></td></tr>';
    try {
      const params = new URLSearchParams({ page });
      if (q) params.set('q', q);
      if (role) params.set('role', role);
      const data = await apiFetch(`/admin/api/users?${params}`);
      const rows = data.users || [];
      if (!rows.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7">사용자가 없습니다.</td></tr>';
      } else {
        tbody.innerHTML = rows.map(u => `
          <tr data-id="${u.id}" style="cursor:pointer">
            <td>${escapeHtml(String(u.id))}</td>
            <td>${escapeHtml(u.username)}</td>
            <td>${escapeHtml(u.nickname)}</td>
            <td>${roleBadge(u.role)}</td>
            <td>${userStatusBadge(u.status)}</td>
            <td>${u.is_admin ? '<span class="badge badge--success">운영자</span>' : '-'}</td>
            <td class="text-muted">${formatDate(u.created_at)}</td>
          </tr>`).join('');
      }
      renderPagination('users-pagination', page, data.total, 20, loadUsers);
    } catch (err) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">오류: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function closeUserModal() { document.getElementById('user-modal').hidden = true; }

  async function patchUser(body) {
    await apiFetch(`/admin/api/users/${_currentUser.id}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async function openUserModal(userId) {
    const modal = document.getElementById('user-modal');
    const body = document.getElementById('user-modal-body');
    const title = document.getElementById('user-modal-title');
    const adminBtn = document.getElementById('user-toggle-admin-btn');
    const sellerBtn = document.getElementById('user-toggle-seller-btn');
    modal.hidden = false;
    body.innerHTML = '<span class="spinner"></span>';
    try {
      const u = await apiFetch(`/admin/api/users/${userId}`);
      _currentUser = u;
      title.textContent = `${u.username} (${u.nickname})`;
      body.innerHTML = `
        <p>가입일: ${formatDate(u.created_at)}</p>
        <p>역할: ${roleBadge(u.role)} ${u.is_admin ? '<span class="badge badge--success">운영자</span>' : ''} ${userStatusBadge(u.status)}</p>
        <p>구매: ${u.purchaseCount}건 / ${formatKRW(u.purchaseAmount)}</p>
        <p>판매: ${u.salesCount}건 / ${formatKRW(u.salesAmount)}</p>

        <div class="modal-section-title">닉네임 변경</div>
        <div class="modal-field--row">
          <input type="text" id="user-nickname-input" value="${escapeHtml(u.nickname)}" />
          <button class="btn-small" id="user-nickname-save-btn">저장</button>
        </div>

        <div class="modal-section-title">비밀번호 초기화</div>
        <div class="modal-field--row">
          <input type="password" id="user-newpw-input" placeholder="새 비밀번호 (8자 이상)" />
          <button class="btn-small" id="user-reset-pw-btn">초기화</button>
        </div>

        <div class="modal-section-title">계정 상태</div>
        <div class="modal-field--row">
          <button class="btn-small ${u.status === 'suspended' ? '' : 'btn-danger'}" id="user-toggle-status-btn">${u.status === 'suspended' ? '정지 해제' : '계정 정지'}</button>
        </div>`;
      adminBtn.textContent = u.is_admin ? '운영자 해제' : '운영자 지정';
      sellerBtn.textContent = u.role === 'seller' ? '판매자 해제' : '판매자 지정';

      document.getElementById('user-nickname-save-btn').addEventListener('click', async () => {
        const nickname = document.getElementById('user-nickname-input').value.trim();
        if (!nickname) { adminToast('닉네임을 입력하세요.', { type: 'error' }); return; }
        try { await patchUser({ nickname }); closeUserModal(); loadUsers(_currentPage); }
        catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
      });

      document.getElementById('user-reset-pw-btn').addEventListener('click', async () => {
        const newPassword = document.getElementById('user-newpw-input').value;
        if (!newPassword || newPassword.length < 8) { adminToast('비밀번호는 8자 이상이어야 합니다.', { type: 'error' }); return; }
        try {
          await apiFetch(`/admin/api/users/${_currentUser.id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
          adminToast('비밀번호가 초기화되었습니다.', { type: 'success' });
          document.getElementById('user-newpw-input').value = '';
        } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
      });

      document.getElementById('user-toggle-status-btn').addEventListener('click', async () => {
        const newStatus = _currentUser.status === 'suspended' ? 'active' : 'suspended';
        if (!(await adminConfirm(newStatus === 'suspended'
          ? { title: '계정 정지', message: '이 계정을 정지하시겠습니까?', danger: true }
          : { title: '정지 해제', message: '정지를 해제하시겠습니까?' }))) return;
        try { await patchUser({ status: newStatus }); closeUserModal(); loadUsers(_currentPage); }
        catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
      });
    } catch (err) {
      body.innerHTML = `<p style="color:var(--danger)">오류: ${escapeHtml(err.message)}</p>`;
    }
  }

  document.getElementById('user-search-btn').addEventListener('click', () => loadUsers(1));
  document.getElementById('user-search').addEventListener('keydown', e => { if (e.key === 'Enter') loadUsers(1); });
  document.getElementById('users-tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openUserModal(tr.dataset.id);
  });
  document.getElementById('user-modal-close').addEventListener('click', closeUserModal);
  document.getElementById('user-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  document.getElementById('user-toggle-admin-btn').addEventListener('click', async () => {
    if (!_currentUser) return;
    const newVal = _currentUser.is_admin ? 0 : 1;
    try { await patchUser({ is_admin: newVal }); closeUserModal(); loadUsers(_currentPage); }
    catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });
  document.getElementById('user-toggle-seller-btn').addEventListener('click', async () => {
    if (!_currentUser) return;
    const newRole = _currentUser.role === 'seller' ? 'buyer' : 'seller';
    try { await patchUser({ role: newRole }); closeUserModal(); loadUsers(_currentPage); }
    catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });

  function openCreateTestUserModal() {
    document.getElementById('create-test-user-username').value = '';
    document.getElementById('create-test-user-password').value = '';
    document.getElementById('create-test-user-role').value = 'buyer';
    document.getElementById('create-test-user-modal').hidden = false;
  }
  function closeCreateTestUserModal() { document.getElementById('create-test-user-modal').hidden = true; }

  document.getElementById('create-test-user-btn').addEventListener('click', openCreateTestUserModal);
  document.getElementById('create-test-user-close').addEventListener('click', closeCreateTestUserModal);
  document.getElementById('create-test-user-cancel').addEventListener('click', closeCreateTestUserModal);
  document.getElementById('create-test-user-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  document.getElementById('create-test-user-submit').addEventListener('click', async () => {
    const username = document.getElementById('create-test-user-username').value.trim();
    const password = document.getElementById('create-test-user-password').value;
    const role = document.getElementById('create-test-user-role').value;
    if (!/^[A-Za-z0-9_]{4,30}$/.test(username)) {
      adminToast('아이디는 영문/숫자/언더스코어 4~30자여야 합니다.', { type: 'error' });
      return;
    }
    if (!password || password.length < 8) {
      adminToast('비밀번호는 8자 이상이어야 합니다.', { type: 'error' });
      return;
    }
    try {
      const created = await apiFetch('/admin/api/users', { method: 'POST', body: JSON.stringify({ username, password, role }) });
      adminToast(`테스트 계정이 생성되었습니다: ${created.username}`, { type: 'success' });
      closeCreateTestUserModal();
      loadUsers(_currentPage);
    } catch (err) {
      adminToast(err.message, { type: 'error' });
    }
  });

  loadUsers(1);
}

/* -------------------- Auctions page (/admin/auctions) -------------------- */

function initAuctionsPage() {
  if (!getToken()) { window.location.href = '/admin'; return; }
  bindLogout();
  let _liveInterval = null;
  let _auctionPage = 1;

  async function loadLiveCards() {
    const el = document.getElementById('live-cards');
    try {
      const data = await apiFetch('/admin/api/live/active');
      if (!data.length) { el.innerHTML = '<p class="text-muted">진행 중인 라이브 없음</p>'; return; }
      el.innerHTML = data.map(l => `
        <div class="live-card" data-liveid="${escapeHtml(l.liveId)}">
          <div class="live-card__title">${escapeHtml(l.title)}</div>
          <div class="live-card__meta">판매자: ${escapeHtml(l.sellerName || l.sellerId)} | 시청자: ${l.viewerCount}</div>
          ${l.auction ? `<div class="live-card__auction">경매: ${escapeHtml(l.auction.productName||'')} / ${formatKRW(l.auction.currentPrice)} / 잔여 ${l.auction.timeLeft}초</div>` : '<div class="live-card__auction text-muted">경매 없음</div>'}
          <div class="live-card__actions">
            <button class="btn-small" data-monitor="${escapeHtml(l.liveId)}">관제</button>
            <button class="btn-small btn-danger" data-forceend="${escapeHtml(l.liveId)}">강제 종료</button>
          </div>
        </div>`).join('');
      el.querySelectorAll('button[data-forceend]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!(await adminConfirm({ title: '라이브 강제 종료', message: '이 라이브를 강제 종료하시겠습니까?', danger: true }))) return;
          try {
            await apiFetch(`/admin/api/live/${btn.dataset.forceend}/force-end`, { method: 'POST' });
            refreshLiveAndSubscribe();
          } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
        });
      });
      el.querySelectorAll('button[data-monitor]').forEach(btn => {
        btn.addEventListener('click', () => openMonitor(btn.dataset.monitor, data.find(x => x.liveId === btn.dataset.monitor)));
      });
    } catch (err) { el.innerHTML = `<p style="color:var(--danger)">오류: ${escapeHtml(err.message)}</p>`; }
  }

  let _currentAuction = null;

  async function loadAuctions(page) {
    _auctionPage = page;
    const status = document.getElementById('auction-status-filter').value;
    const deliveryStatus = document.getElementById('auction-delivery-filter').value;
    const tbody = document.getElementById('auctions-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9"><span class="spinner"></span></td></tr>';
    try {
      const params = new URLSearchParams({ page });
      if (status) params.set('status', status);
      if (deliveryStatus) params.set('deliveryStatus', deliveryStatus);
      const data = await apiFetch(`/admin/api/auctions?${params}`);
      const rows = data.auctions || [];
      if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="9">없음</td></tr>'; return; }
      tbody.innerHTML = rows.map(a => {
        const ended = a.status === 'ended';
        return `<tr data-id="${escapeHtml(String(a.id))}"${ended ? ' style="cursor:pointer"' : ''}>
        <td>${escapeHtml(String(a.id))}</td><td>${escapeHtml(a.product_name)}</td>
        <td>${formatKRW(a.current_price)}</td><td>${escapeHtml(a.status)}</td>
        <td>${shippingStatusLabel(a.delivery_status)}</td><td>${escapeHtml(a.seller_nickname||'-')}</td><td>${escapeHtml(a.buyer_nickname||'-')}</td>
        <td class="text-muted">${formatDate(a.created_at)}</td><td>${formatKRW(a.seller_fee_amt)}</td></tr>`;
      }).join('');
      renderPagination('auctions-pagination', page, data.total, 20, loadAuctions);
    } catch (err) { tbody.innerHTML = `<tr class="empty-row"><td colspan="9">오류: ${escapeHtml(err.message)}</td></tr>`; }
  }

  function closeAuctionModal() { document.getElementById('auction-modal').hidden = true; }

  function renderBids(bids) {
    const tbody = document.getElementById('auction-bids-tbody');
    if (!bids || !bids.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">입찰 내역 없음</td></tr>';
      return;
    }
    tbody.innerHTML = bids.map(b => `<tr>
      <td>${escapeHtml(String(b.id))}</td>
      <td>${escapeHtml(b.bidder_name || '-')}</td>
      <td>${formatKRW(b.price)}</td>
      <td class="text-muted">${formatDate(b.created_at)}</td>
      <td><button class="btn-small btn-danger" data-bidid="${escapeHtml(String(b.id))}">입찰 취소</button></td>
    </tr>`).join('');
    tbody.querySelectorAll('button[data-bidid]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!(await adminConfirm({ title: '입찰 취소', message: '이 입찰을 취소(삭제)하시겠습니까?', danger: true }))) return;
        try {
          await apiFetch(`/admin/api/auctions/${_currentAuction.id}/bids/${btn.dataset.bidid}`, { method: 'DELETE' });
          openAuctionModal(_currentAuction.id);
        } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
      });
    });
  }

  async function openAuctionModal(auctionId) {
    const modal = document.getElementById('auction-modal');
    const meta = document.getElementById('auction-modal-meta');
    const title = document.getElementById('auction-modal-title');
    const forceEndBtn = document.getElementById('auction-force-end-btn');
    const deleteBtn = document.getElementById('auction-delete-btn');
    deleteBtn.hidden = true;
    modal.hidden = false;
    meta.innerHTML = '<span class="text-muted"><span class="spinner"></span> 불러오는 중...</span>';
    document.getElementById('auction-bids-tbody').innerHTML = '';
    try {
      const a = await apiFetch(`/admin/api/auctions/${auctionId}`);
      _currentAuction = a;
      title.textContent = `경매 #${a.id} — ${a.product_name || ''}`;
      meta.innerHTML = `
        <span>판매자: <strong>${escapeHtml(a.seller_nickname || '-')}</strong></span>
        <span>구매자(낙찰자): <strong>${escapeHtml(a.buyer_nickname || '-')}</strong></span>
        <span>낙찰가: <strong>${formatKRW(a.current_price)}</strong></span>
        <span>수수료: <strong>${formatKRW(a.seller_fee_amt)}</strong></span>
        <span>상태: ${escapeHtml(a.status)}</span>
        <span>일시: ${formatDate(a.created_at)}</span>`;
      const sel = document.getElementById('auction-delivery-select');
      if (a.delivery_status) sel.value = a.delivery_status;
      forceEndBtn.hidden = a.status === 'ended';
      deleteBtn.hidden = a.status !== 'ended';
      renderBids(a.bids);
    } catch (err) {
      meta.innerHTML = `<span style="color:var(--danger)">불러오기 실패: ${escapeHtml(err.message)}</span>`;
    }
  }

  // ── 실시간 소켓 (10초 폴링 대체) ──────────────────────────────────────
  // admin 토큰을 handshake auth로 실어 서버 io.use가 socket.data.userId를 세팅.
  // 진행 중 라이브 룸을 admin:live:subscribe로 구독(viewer 카운트 미포함)해
  // chat:message/auction:update/purchase:made/viewer:count를 실시간 수신한다.
  let _socket = null;
  const _subscribed = new Set();   // 현재 구독 중인 liveId
  let _monitorLiveId = null;       // 관제 모달이 열린 liveId

  function connectSocket() {
    if (typeof io !== 'function') return null;   // socket.io.js 미로드 시 폴링 폴백
    const s = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: getToken() || '' }),
    });
    s.on('viewer:count', ({ count }) => {
      // 관제 모달이 열린 라이브면 시청자수 갱신
      if (_monitorLiveId != null) {
        const el = document.getElementById('live-monitor-viewer-count');
        if (el) el.textContent = `시청자 ${count}명`;
      }
    });
    s.on('auction:update', (auc) => {
      if (_monitorLiveId && auc && auc.liveId === _monitorLiveId) renderMonitorAuction(auc);
      // 라이브 카드의 경매 정보도 실시간 반영
      const card = document.querySelector(`.live-card[data-liveid="${cssEsc(auc && auc.liveId)}"] .live-card__auction`);
      if (card && auc) card.textContent = `경매: ${auc.productName || ''} / ${formatKRW(auc.currentPrice)} / 잔여 ${auc.timeLeft}초`;
    });
    s.on('chat:message', (m) => {
      if (_monitorLiveId && m) appendMonitorChat(m);
    });
    s.on('purchase:made', (p) => {
      if (_monitorLiveId && p) appendMonitorFeed(`구매: ${p.userName || p.userId} · ${formatKRW(p.price)}`);
    });
    s.on('chat:deleted', ({ ts }) => {
      const row = document.querySelector(`.lm-chat-row[data-ts="${cssEsc(String(ts))}"]`);
      if (row) row.remove();
    });
    return s;
  }

  function cssEsc(v) { return String(v == null ? '' : v).replace(/["\\]/g, '\\$&'); }

  // 초기 로드 후 진행 중 라이브를 소켓 구독
  async function refreshLiveAndSubscribe() {
    await loadLiveCards();
    if (!_socket) return;
    document.querySelectorAll('.live-card[data-liveid]').forEach(card => {
      const id = card.dataset.liveid;
      if (id && !_subscribed.has(id)) { _socket.emit('admin:live:subscribe', { liveId: id }); _subscribed.add(id); }
    });
  }

  _socket = connectSocket();
  refreshLiveAndSubscribe();
  // 소켓이 없으면(스크립트 미로드) 기존 폴링으로 폴백
  if (!_socket) { _liveInterval = setInterval(loadLiveCards, 10000); }
  window.addEventListener('beforeunload', () => {
    if (_liveInterval) clearInterval(_liveInterval);
    if (_socket) { _subscribed.forEach(id => _socket.emit('admin:live:unsubscribe', { liveId: id })); _socket.disconnect(); }
  });

  document.getElementById('auction-search-btn').addEventListener('click', () => loadAuctions(1));
  document.getElementById('auctions-tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr && tr.style.cursor === 'pointer') openAuctionModal(tr.dataset.id);
  });
  document.getElementById('auction-modal-close').addEventListener('click', closeAuctionModal);
  document.getElementById('auction-modal-close2').addEventListener('click', closeAuctionModal);
  document.getElementById('auction-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  document.getElementById('auction-delivery-save-btn').addEventListener('click', async () => {
    if (!_currentAuction) return;
    const deliveryStatus = document.getElementById('auction-delivery-select').value;
    try {
      await apiFetch(`/admin/api/auctions/${_currentAuction.id}/delivery-status`, { method: 'PATCH', body: JSON.stringify({ deliveryStatus }) });
      adminToast('배송상태가 변경되었습니다.', { type: 'success' });
      loadAuctions(_auctionPage);
    } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });
  document.getElementById('auction-force-end-btn').addEventListener('click', async () => {
    if (!_currentAuction) return;
    if (!(await adminConfirm({ title: '경매 강제 종료', message: '이 경매를 강제 종료하시겠습니까?', danger: true }))) return;
    try {
      await apiFetch(`/admin/api/auctions/${_currentAuction.id}/force-end`, { method: 'POST' });
      closeAuctionModal();
      loadAuctions(_auctionPage);
    } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });
  document.getElementById('auction-delete-btn').addEventListener('click', async () => {
    if (!_currentAuction) return;
    if (!(await adminConfirm({ title: '경매 삭제', message: '이 경매 내역을 삭제하시겠습니까? 되돌릴 수 없습니다.', danger: true }))) return;
    try {
      await apiFetch(`/admin/api/auctions/${_currentAuction.id}`, { method: 'DELETE' });
      closeAuctionModal();
      loadAuctions(_auctionPage);
    } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });

  // ── 라이브 관제 모달 ──────────────────────────────────────────────────
  function renderMonitorAuction(auc) {
    const el = document.getElementById('live-monitor-auction');
    const row = document.getElementById('live-monitor-extend-row');
    if (!el) return;
    if (auc && auc.status === 'live') {
      el.textContent = `경매: ${auc.productName || ''} / ${formatKRW(auc.currentPrice)} / 잔여 ${auc.timeLeft}초`;
      if (row) row.hidden = false;
    } else {
      el.textContent = '진행 중 경매 없음';
      if (row) row.hidden = true;
    }
  }
  function appendMonitorChat(m) {
    const box = document.getElementById('live-monitor-chat');
    if (!box) return;
    const row = document.createElement('div');
    row.className = 'lm-chat-row';
    if (m.ts != null) row.dataset.ts = String(m.ts);
    const name = document.createElement('strong'); name.textContent = (m.userName || m.userId || '?') + ': ';
    const msg = document.createElement('span'); msg.textContent = m.message || '';
    const del = document.createElement('button');
    del.className = 'btn-small btn-danger lm-chat-del'; del.textContent = '삭제';
    del.addEventListener('click', () => {
      if (_socket && _monitorLiveId != null && m.ts != null) _socket.emit('admin:chat:delete', { liveId: _monitorLiveId, ts: m.ts });
    });
    row.append(name, msg, del);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }
  function appendMonitorFeed(text) {
    const box = document.getElementById('live-monitor-feed');
    if (!box) return;
    const row = document.createElement('div'); row.textContent = text;
    box.appendChild(row); box.scrollTop = box.scrollHeight;
  }
  function openMonitor(liveId, info) {
    _monitorLiveId = liveId;
    document.getElementById('live-monitor-modal').hidden = false;
    document.getElementById('live-monitor-title').textContent = `라이브 관제 — ${info ? (info.title || liveId) : liveId}`;
    document.getElementById('live-monitor-meta').textContent = info ? `판매자: ${info.sellerName || info.sellerId}` : '';
    document.getElementById('live-monitor-viewer-count').textContent = `시청자 ${info ? info.viewerCount : 0}명`;
    document.getElementById('live-monitor-chat').innerHTML = '';
    document.getElementById('live-monitor-feed').innerHTML = '';
    renderMonitorAuction(info && info.auction);
    if (_socket && !_subscribed.has(liveId)) { _socket.emit('admin:live:subscribe', { liveId }); _subscribed.add(liveId); }
  }
  function closeMonitor() {
    document.getElementById('live-monitor-modal').hidden = true;
    _monitorLiveId = null;
  }
  document.getElementById('live-monitor-close').addEventListener('click', closeMonitor);
  document.getElementById('live-monitor-close2').addEventListener('click', closeMonitor);
  document.getElementById('live-monitor-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeMonitor(); });
  document.getElementById('live-monitor-extend-btn').addEventListener('click', async () => {
    if (_monitorLiveId == null) return;
    const seconds = Math.max(1, Number(document.getElementById('live-monitor-extend-seconds').value) || 10);
    // 진행 중 경매 id는 auction:update로 갱신되는 현재 경매 — 서버가 liveId의 현재 경매를 연장하도록 API 호출
    try {
      const active = await apiFetch('/admin/api/live/active');
      const cur = active.find(x => x.liveId === _monitorLiveId);
      if (!cur || !cur.auction) { adminToast('진행 중 경매가 없습니다.', { type: 'error' }); return; }
      await apiFetch(`/admin/api/auctions/${cur.auction.id}/extend`, { method: 'POST', body: JSON.stringify({ seconds }) });
      adminToast(`${seconds}초 연장했습니다.`, { type: 'success' });
    } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });
  document.getElementById('live-monitor-auction-force-end-btn').addEventListener('click', async () => {
    if (_monitorLiveId == null) return;
    if (!(await adminConfirm({ title: '경매 강제종료', message: '진행 중 경매를 강제 종료하시겠습니까?', danger: true }))) return;
    try {
      const active = await apiFetch('/admin/api/live/active');
      const cur = active.find(x => x.liveId === _monitorLiveId);
      if (!cur || !cur.auction) { adminToast('진행 중 경매가 없습니다.', { type: 'error' }); return; }
      await apiFetch(`/admin/api/auctions/${cur.auction.id}/force-end`, { method: 'POST' });
      adminToast('경매를 강제 종료했습니다.', { type: 'success' });
    } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });
  document.getElementById('live-monitor-kick-btn').addEventListener('click', async () => {
    if (_monitorLiveId == null) return;
    const userId = document.getElementById('live-monitor-kick-userid').value.trim();
    if (!userId) return;
    if (!(await adminConfirm({ title: '사용자 강퇴', message: `userId ${userId}를 이 라이브에서 강퇴하시겠습니까?`, danger: true }))) return;
    if (_socket) _socket.emit('admin:live:kick', { liveId: _monitorLiveId, userId });
    adminToast('강퇴 요청을 보냈습니다.', { type: 'success' });
    document.getElementById('live-monitor-kick-userid').value = '';
  });
  document.getElementById('live-monitor-force-end-btn').addEventListener('click', async () => {
    if (_monitorLiveId == null) return;
    const reason = await adminPrompt({ title: '라이브 강제 종료', message: '중단 사유(선택)를 입력하세요.', placeholder: '사유' });
    if (reason === null) return; // 취소
    try {
      await apiFetch(`/admin/api/live/${_monitorLiveId}/force-end`, { method: 'POST', body: JSON.stringify({ reason: reason || undefined }) });
      adminToast('라이브를 강제 종료했습니다.', { type: 'success' });
      closeMonitor();
      refreshLiveAndSubscribe();
    } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });

  // ── 라이브 이력 탭 ────────────────────────────────────────────────────
  async function loadLiveHistory(page) {
    const tbody = document.getElementById('live-history-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><span class="spinner"></span></td></tr>';
    try {
      const data = await apiFetch(`/admin/api/live/history?page=${page}`);
      const rows = data.lives || data.history || [];
      if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="6">없음</td></tr>'; return; }
      tbody.innerHTML = rows.map(l => `<tr>
        <td>${escapeHtml(String(l.id))}</td>
        <td>${escapeHtml(l.title || '-')}</td>
        <td>${escapeHtml(l.seller_name || String(l.seller_id) || '-')}</td>
        <td>${escapeHtml(l.category || '-')}</td>
        <td class="text-muted">${l.created_at ? formatDate(l.created_at) : '-'}</td>
        <td><button class="btn-small" data-statid="${escapeHtml(String(l.id))}">통계</button></td></tr>`).join('');
      tbody.querySelectorAll('button[data-statid]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            const s = await apiFetch(`/admin/api/live/${btn.dataset.statid}/stats`);
            adminToast(`낙찰 ${s.soldCount ?? s.orderCount ?? 0}건 · 매출 ${formatKRW(s.gross ?? s.revenue ?? 0)}`, { type: 'success' });
          } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
        });
      });
      renderPagination('live-history-pagination', page, data.total || rows.length, 20, loadLiveHistory);
    } catch (err) { tbody.innerHTML = `<tr class="empty-row"><td colspan="6">오류: ${escapeHtml(err.message)}</td></tr>`; }
  }
  let _historyLoaded = false;
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-btn--active'));
      btn.classList.add('tab-btn--active');
      const tab = btn.dataset.tab;
      document.getElementById('tab-ended-auctions').hidden = tab !== 'ended-auctions';
      document.getElementById('tab-live-history').hidden = tab !== 'live-history';
      if (tab === 'live-history' && !_historyLoaded) { _historyLoaded = true; loadLiveHistory(1); }
    });
  });

  loadAuctions(1);
}

/* -------------------- Products page (/admin/products) -------------------- */

function initProductsPage() {
  if (!getToken()) { window.location.href = '/admin'; return; }
  bindLogout();
  let _productPage = 1;
  let _refundPage = 1;

  async function loadProducts(page) {
    _productPage = page;
    const q = document.getElementById('product-search').value.trim();
    const category = document.getElementById('product-category-filter').value;
    const tbody = document.getElementById('products-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><span class="spinner"></span></td></tr>';
    try {
      const params = new URLSearchParams({ page });
      if (q) params.set('q', q);
      if (category) params.set('category', category);
      const data = await apiFetch(`/admin/api/products?${params}`);
      const rows = data.products || [];
      if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="8">없음</td></tr>'; return; }
      tbody.innerHTML = rows.map(p => `<tr data-id="${escapeHtml(String(p.id))}" style="cursor:pointer">
        <td>${escapeHtml(String(p.id))}</td><td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.category)}</td><td>${escapeHtml(p.seller_nickname||'-')}</td>
        <td>${formatKRW(p.price)}</td><td>${escapeHtml(p.status)}</td>
        <td class="text-muted">${formatDate(p.created_at)}</td>
        <td><button class="btn-small btn-danger" data-productid="${escapeHtml(String(p.id))}">삭제</button></td></tr>`).join('');
      renderPagination('products-pagination', page, data.total, 20, loadProducts);
      tbody.querySelectorAll('button[data-productid]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!(await adminConfirm({ title: '상품 삭제', message: '상품을 삭제하시겠습니까?', danger: true }))) return;
          try {
            await apiFetch(`/admin/api/products/${btn.dataset.productid}`, { method: 'DELETE' });
            loadProducts(_productPage);
          } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
        });
      });
      tbody.querySelectorAll('tr[data-id]').forEach(tr => {
        tr.addEventListener('click', () => openProductModal(tr.dataset.id));
      });
    } catch (err) { tbody.innerHTML = `<tr class="empty-row"><td colspan="8">오류: ${escapeHtml(err.message)}</td></tr>`; }
  }

  async function loadRefunds(page) {
    _refundPage = page;
    const status = document.getElementById('refund-status-filter').value;
    const tbody = document.getElementById('refunds-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><span class="spinner"></span></td></tr>';
    try {
      const params = new URLSearchParams({ page });
      if (status) params.set('status', status);
      const data = await apiFetch(`/admin/api/refunds?${params}`);
      const rows = data.refunds || [];
      if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="8">없음</td></tr>'; return; }
      tbody.innerHTML = rows.map(r => `<tr>
        <td>${escapeHtml(String(r.id))}</td><td>${escapeHtml(r.product_name||'-')}</td>
        <td>${escapeHtml(r.buyer_name||'-')}</td><td>${escapeHtml(r.seller_name||'-')}</td>
        <td>${formatKRW(r.refund_amount)}</td><td>${escapeHtml(r.status)}</td>
        <td class="text-muted">${formatDate(r.requested_at)}</td>
        <td>
          ${r.status==='requested'?`<button class="btn-small" data-rid="${r.id}" data-action="approve">승인</button> <button class="btn-small btn-danger" data-rid="${r.id}" data-action="reject">거절</button>`:''}
          ${r.status==='approved'?`<button class="btn-small" data-rid="${r.id}" data-action="complete">완료</button>`:''}
        </td></tr>`).join('');
      renderPagination('refunds-pagination', page, data.total, 20, loadRefunds);
      tbody.querySelectorAll('button[data-rid]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.action;
          const rid = btn.dataset.rid;
          let body = {};
          if (action === 'reject') {
            const reason = await adminPrompt({ title: '환불 거절', message: '거절 사유를 입력하세요 (선택)', placeholder: '거절 사유' });
            if (reason === null) return;
            body = { rejectReason: reason };
          }
          if (!(await adminConfirm({ title: '환불 처리', message: `환불 ${action} 처리하시겠습니까?`, danger: action === 'reject' }))) return;
          try {
            await apiFetch(`/admin/api/refunds/${rid}/${action}`, { method: 'PATCH', body: JSON.stringify(body) });
            loadRefunds(_refundPage);
          } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
        });
      });
    } catch (err) { tbody.innerHTML = `<tr class="empty-row"><td colspan="8">오류: ${escapeHtml(err.message)}</td></tr>`; }
  }

  const PRODUCT_CATEGORIES = ['과일', '채소', '수산', '축산', '곡물', '기타'];
  let _currentProduct = null;

  function closeProductModal() { document.getElementById('product-modal').hidden = true; }

  async function openProductModal(productId) {
    const modal = document.getElementById('product-modal');
    const body = document.getElementById('product-modal-body');
    const title = document.getElementById('product-modal-title');
    modal.hidden = false;
    body.innerHTML = '<span class="spinner"></span>';
    try {
      const p = await apiFetch(`/admin/api/products/${productId}`);
      _currentProduct = p;
      title.textContent = `상품 #${p.id} 수정`;
      const images = Array.isArray(p.images) ? p.images : [];
      const catOptions = PRODUCT_CATEGORIES.map(c => `<option value="${c}"${p.category === c ? ' selected' : ''}>${c}</option>`).join('');
      body.innerHTML = `
        <p class="text-muted">판매자: ${escapeHtml(p.seller_nickname || '-')}</p>
        ${images.length ? `<div class="thumb-row">${images.map(u => `<img src="${escapeHtml(u)}" alt="">`).join('')}</div>` : '<p class="text-muted">등록된 이미지 없음</p>'}
        <div class="modal-field"><label>상품명</label><input type="text" id="product-name-input" value="${escapeHtml(p.name)}" /></div>
        <div class="modal-field"><label>설명</label><textarea id="product-desc-input" rows="3">${escapeHtml(p.description || '')}</textarea></div>
        <div class="modal-field"><label>가격</label><input type="number" id="product-price-input" value="${escapeHtml(String(p.price ?? 0))}" /></div>
        <div class="modal-field"><label>카테고리</label><select id="product-category-input">${catOptions}</select></div>
        <div class="modal-field"><label>상태</label><input type="text" id="product-status-input" value="${escapeHtml(p.status || '')}" /></div>`;
    } catch (err) {
      body.innerHTML = `<p style="color:var(--danger)">오류: ${escapeHtml(err.message)}</p>`;
    }
  }

  document.getElementById('product-search-btn').addEventListener('click', () => loadProducts(1));
  document.getElementById('product-search').addEventListener('keydown', e => { if (e.key === 'Enter') loadProducts(1); });
  document.getElementById('refund-search-btn').addEventListener('click', () => loadRefunds(1));
  document.getElementById('product-modal-close').addEventListener('click', closeProductModal);
  document.getElementById('product-modal-close2').addEventListener('click', closeProductModal);
  document.getElementById('product-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  document.getElementById('product-save-btn').addEventListener('click', async () => {
    if (!_currentProduct) return;
    const body = {
      name: document.getElementById('product-name-input').value.trim(),
      description: document.getElementById('product-desc-input').value,
      price: Number(document.getElementById('product-price-input').value),
      category: document.getElementById('product-category-input').value,
      status: document.getElementById('product-status-input').value.trim(),
    };
    try {
      await apiFetch(`/admin/api/products/${_currentProduct.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      closeProductModal();
      loadProducts(_productPage);
    } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });

  loadProducts(1);
  loadRefunds(1);
}

/* -------------------- Reviews page (/admin/reviews) -------------------- */

function initReviewsPage() {
  if (!getToken()) { window.location.href = '/admin'; return; }
  bindLogout();
  async function load(page) {
    const rating = document.getElementById('review-rating-filter').value;
    const tbody = document.getElementById('reviews-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><span class="spinner"></span></td></tr>';
    try {
      const params = new URLSearchParams({ page });
      if (rating) params.set('maxRating', rating);
      const data = await apiFetch(`/admin/api/reviews?${params}`);
      const rows = data.reviews || [];
      if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="8">없음</td></tr>'; return; }
      tbody.innerHTML = rows.map(r => `<tr>
        <td>${escapeHtml(String(r.id))}</td>
        <td>${'★'.repeat(r.rating)}${'☆'.repeat(Math.max(0, 5 - r.rating))}</td>
        <td>${escapeHtml(r.comment || '-')}</td>
        <td>${escapeHtml(r.reviewer_nickname || '-')}</td>
        <td>${escapeHtml(r.seller_nickname || '-')}</td>
        <td>${escapeHtml(r.seller_reply || '-')}</td>
        <td class="text-muted">${formatDate(r.created_at)}</td>
        <td><button class="btn-small btn-danger" data-rid="${escapeHtml(String(r.id))}">삭제</button></td></tr>`).join('');
      tbody.querySelectorAll('button[data-rid]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!(await adminConfirm({ title: '리뷰 삭제', message: '이 리뷰를 삭제하시겠습니까?', danger: true }))) return;
          try { await apiFetch(`/admin/api/reviews/${btn.dataset.rid}`, { method: 'DELETE' }); adminToast('삭제되었습니다.', { type: 'success' }); load(page); }
          catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
        });
      });
      renderPagination('reviews-pagination', page, data.total, 20, load);
    } catch (err) { tbody.innerHTML = `<tr class="empty-row"><td colspan="8">오류: ${escapeHtml(err.message)}</td></tr>`; }
  }
  document.getElementById('review-search-btn').addEventListener('click', () => load(1));
  load(1);
}

/* -------------------- Group deals page (/admin/group-deals) -------------------- */

function initGroupDealsPage() {
  if (!getToken()) { window.location.href = '/admin'; return; }
  bindLogout();
  let _page = 1, _current = null;
  const GD_STATUS = { recruiting: '모집중', confirmed: '확정', shipped: '발송', completed: '완료', cancelled: '취소' };
  async function load(page) {
    _page = page;
    const status = document.getElementById('gd-status-filter').value;
    const tbody = document.getElementById('gd-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><span class="spinner"></span></td></tr>';
    try {
      const params = new URLSearchParams({ page });
      if (status) params.set('status', status);
      const data = await apiFetch(`/admin/api/group-deals?${params}`);
      const rows = data.deals || [];
      if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="7">없음</td></tr>'; return; }
      tbody.innerHTML = rows.map(d => `<tr data-id="${escapeHtml(String(d.id))}" style="cursor:pointer">
        <td>${escapeHtml(String(d.id))}</td>
        <td>${escapeHtml(d.title || '-')}</td>
        <td>${escapeHtml(d.seller_nickname || '-')}</td>
        <td>${d.current_participants ?? d.participant_count ?? 0}/${d.max_participants ?? '-'}</td>
        <td>${escapeHtml(GD_STATUS[d.status] || d.status)}</td>
        <td class="text-muted">${d.closes_at ? formatDate(d.closes_at) : '-'}</td>
        <td class="text-muted">${formatDate(d.created_at)}</td></tr>`).join('');
      renderPagination('gd-pagination', page, data.total, 20, load);
    } catch (err) { tbody.innerHTML = `<tr class="empty-row"><td colspan="7">오류: ${escapeHtml(err.message)}</td></tr>`; }
  }
  async function openModal(id) {
    document.getElementById('gd-modal').hidden = false;
    document.getElementById('gd-modal-meta').innerHTML = '<span class="text-muted"><span class="spinner"></span> 불러오는 중...</span>';
    document.getElementById('gd-participants-tbody').innerHTML = '';
    try {
      const d = await apiFetch(`/admin/api/group-deals/${id}`);
      _current = d;
      document.getElementById('gd-modal-title').textContent = `공동구매 #${d.id} — ${d.title || ''}`;
      document.getElementById('gd-modal-meta').innerHTML = `
        <span>판매자: <strong>${escapeHtml(d.seller_nickname || '-')}</strong></span>
        <span>상태: <strong>${escapeHtml(GD_STATUS[d.status] || d.status)}</strong></span>
        <span>참여: <strong>${d.current_participants ?? 0}/${d.max_participants ?? '-'}</strong></span>`;
      const parts = d.participants || [];
      const pt = document.getElementById('gd-participants-tbody');
      pt.innerHTML = parts.length ? parts.map(p => `<tr><td>${escapeHtml(String(p.user_id ?? p.id))}</td><td>${escapeHtml(p.nickname || '-')}</td><td>${p.quantity ?? '-'}</td><td class="text-muted">${p.created_at ? formatDate(p.created_at) : '-'}</td></tr>`).join('') : '<tr class="empty-row"><td colspan="4">참여자 없음</td></tr>';
      if (d.status) document.getElementById('gd-status-select').value = d.status;
    } catch (err) { document.getElementById('gd-modal-meta').innerHTML = `<span style="color:var(--ff-danger)">불러오기 실패: ${escapeHtml(err.message)}</span>`; }
  }
  function closeModal() { document.getElementById('gd-modal').hidden = true; _current = null; }
  document.getElementById('gd-search-btn').addEventListener('click', () => load(1));
  document.getElementById('gd-tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) openModal(tr.dataset.id); });
  document.getElementById('gd-modal-close').addEventListener('click', closeModal);
  document.getElementById('gd-modal-close2').addEventListener('click', closeModal);
  document.getElementById('gd-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.getElementById('gd-status-save-btn').addEventListener('click', async () => {
    if (!_current) return;
    const status = document.getElementById('gd-status-select').value;
    const danger = status === 'cancelled';
    if (!(await adminConfirm({ title: '상태 변경', message: `상태를 "${GD_STATUS[status]}"(으)로 변경하시겠습니까?`, danger }))) return;
    try { await apiFetch(`/admin/api/group-deals/${_current.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); adminToast('상태가 변경되었습니다.', { type: 'success' }); closeModal(); load(_page); }
    catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });
  load(1);
}

/* -------------------- Consignments page (/admin/consignments) -------------------- */

function initConsignmentsPage() {
  if (!getToken()) { window.location.href = '/admin'; return; }
  bindLogout();
  let _page = 1, _current = null;
  const CS_STATUS = { pending: '대기', matched: '매칭', closed: '종료' };
  async function load(page) {
    _page = page;
    const status = document.getElementById('cs-status-filter').value;
    const tbody = document.getElementById('cs-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><span class="spinner"></span></td></tr>';
    try {
      const params = new URLSearchParams({ page });
      if (status) params.set('status', status);
      const data = await apiFetch(`/admin/api/consignments?${params}`);
      const rows = data.consignments || [];
      if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="8">없음</td></tr>'; return; }
      tbody.innerHTML = rows.map(c => `<tr data-id="${escapeHtml(String(c.id))}" style="cursor:pointer">
        <td>${escapeHtml(String(c.id))}</td>
        <td>${escapeHtml(c.buyer_nickname || '-')}</td>
        <td>${escapeHtml(c.consignment_type || '-')}</td>
        <td>${escapeHtml(c.category || '-')}</td>
        <td>${escapeHtml(String(c.quantity ?? '-'))}</td>
        <td>${c.expected_price != null ? formatKRW(c.expected_price) : '-'}</td>
        <td>${escapeHtml(CS_STATUS[c.status] || c.status)}</td>
        <td class="text-muted">${formatDate(c.created_at)}</td></tr>`).join('');
      renderPagination('cs-pagination', page, data.total, 20, load);
    } catch (err) { tbody.innerHTML = `<tr class="empty-row"><td colspan="8">오류: ${escapeHtml(err.message)}</td></tr>`; }
  }
  async function openModal(id) {
    document.getElementById('cs-modal').hidden = false;
    document.getElementById('cs-modal-meta').innerHTML = '<span class="text-muted"><span class="spinner"></span> 불러오는 중...</span>';
    document.getElementById('cs-modal-images').innerHTML = '';
    try {
      const c = await apiFetch(`/admin/api/consignments/${id}`);
      _current = c;
      document.getElementById('cs-modal-title').textContent = `위탁 #${c.id}`;
      document.getElementById('cs-modal-meta').innerHTML = `
        <span>신청자: <strong>${escapeHtml(c.buyer_nickname || '-')}</strong></span>
        <span>유형: <strong>${escapeHtml(c.consignment_type || '-')}</strong></span>
        <span>카테고리: <strong>${escapeHtml(c.category || '-')}</strong></span>
        <span>수량: <strong>${escapeHtml(String(c.quantity ?? '-'))}</strong></span>
        <span>희망가: <strong>${c.expected_price != null ? formatKRW(c.expected_price) : '-'}</strong></span>
        <span>상태: <strong>${escapeHtml(CS_STATUS[c.status] || c.status)}</strong></span>`;
      const imgs = c.images || [];
      document.getElementById('cs-modal-images').innerHTML = imgs.map(im => `<img src="${escapeHtml(im.image_url)}" alt="위탁 이미지" style="max-width:120px;max-height:120px;border-radius:8px;margin:4px" />`).join('');
      if (c.status) document.getElementById('cs-status-select').value = c.status;
    } catch (err) { document.getElementById('cs-modal-meta').innerHTML = `<span style="color:var(--ff-danger)">불러오기 실패: ${escapeHtml(err.message)}</span>`; }
  }
  function closeModal() { document.getElementById('cs-modal').hidden = true; _current = null; }
  document.getElementById('cs-search-btn').addEventListener('click', () => load(1));
  document.getElementById('cs-tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) openModal(tr.dataset.id); });
  document.getElementById('cs-modal-close').addEventListener('click', closeModal);
  document.getElementById('cs-modal-close2').addEventListener('click', closeModal);
  document.getElementById('cs-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.getElementById('cs-status-save-btn').addEventListener('click', async () => {
    if (!_current) return;
    const status = document.getElementById('cs-status-select').value;
    if (!(await adminConfirm({ title: '상태 변경', message: `상태를 "${CS_STATUS[status]}"(으)로 변경하시겠습니까?`, danger: status === 'closed' }))) return;
    try { await apiFetch(`/admin/api/consignments/${_current.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); adminToast('상태가 변경되었습니다.', { type: 'success' }); closeModal(); load(_page); }
    catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });
  load(1);
}

/* -------------------- Notice broadcast page (/admin/notice) -------------------- */

function initNoticePage() {
  if (!getToken()) { window.location.href = '/admin'; return; }
  bindLogout();
  const TARGET = { all: '전체', sellers: '판매자', buyers: '구매자' };
  async function loadHistory() {
    const tbody = document.getElementById('notice-history-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="3"><span class="spinner"></span></td></tr>';
    try {
      const data = await apiFetch('/admin/api/audit-logs?action=notification.broadcast&page=1');
      const rows = data.logs || [];
      if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="3">발송 이력 없음</td></tr>'; return; }
      tbody.innerHTML = rows.map(l => {
        let detail = ''; try { const d = typeof l.detail === 'string' ? JSON.parse(l.detail) : l.detail; if (d) detail = `${TARGET[d.target] || d.target || ''} · ${d.count ?? d.sent ?? '?'}명`; } catch (e) {}
        return `<tr><td class="text-muted">${formatDate(l.created_at)}</td><td>${escapeHtml(l.admin_nickname || String(l.admin_user_id))}</td><td>${escapeHtml(detail)}</td></tr>`;
      }).join('');
    } catch (err) { tbody.innerHTML = `<tr class="empty-row"><td colspan="3">이력 조회 실패: ${escapeHtml(err.message)}</td></tr>`; }
  }
  document.getElementById('notice-send-btn').addEventListener('click', async () => {
    const target = document.getElementById('notice-target').value;
    const title = document.getElementById('notice-title').value.trim();
    const body = document.getElementById('notice-body').value.trim();
    if (!title || !body) { adminToast('제목과 내용을 입력하세요.', { type: 'error' }); return; }
    if (!(await adminConfirm({ title: '공지 발송', message: `${TARGET[target]} 대상으로 공지를 발송하시겠습니까?` }))) return;
    try {
      const res = await apiFetch('/admin/api/notifications/broadcast', { method: 'POST', body: JSON.stringify({ title, body, target }) });
      adminToast(`${res.sent ?? 0}명에게 발송했습니다.`, { type: 'success' });
      document.getElementById('notice-title').value = '';
      document.getElementById('notice-body').value = '';
      loadHistory();
    } catch (err) { adminToast(`오류: ${err.message}`, { type: 'error' }); }
  });
  loadHistory();
}

/* -------------------- Phase 7 shared helpers -------------------- */

function genKey() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `k_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function paymentStatusBadge(status) {
  if (status === 'PAID') return '<span class="badge badge--success">PAID</span>';
  if (status === 'FAILED' || status === 'EXPIRED') return `<span class="badge badge--danger">${escapeHtml(status)}</span>`;
  if (status === 'CANCELED' || status === 'PARTIALLY_CANCELED' || status === 'REFUNDED') return `<span class="badge badge--warn">${escapeHtml(status)}</span>`;
  return `<span class="badge badge--info">${escapeHtml(status || '-')}</span>`;
}

function sessionStatusBadge(status) {
  if (status === 'ACTIVE') return '<span class="badge badge--success">ACTIVE</span>';
  if (status === 'REVOKED') return '<span class="badge badge--danger">REVOKED</span>';
  if (status === 'EXPIRED') return '<span class="badge badge--warn">EXPIRED</span>';
  return `<span class="badge">${escapeHtml(status || '-')}</span>`;
}

/** 사용자 검색 결과 목록을 공용 users-tbody 스타일 테이블에 렌더링하고, 행 클릭 시 onSelect(id, user)를 호출한다. */
async function renderUserSearchResults(tbodyId, query, onSelect) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '<tr class="empty-row"><td colspan="4"><span class="spinner"></span></td></tr>';
  try {
    const params = new URLSearchParams({ page: 1 });
    if (query) params.set('q', query);
    const data = await apiFetch(`/admin/api/users?${params}`);
    const rows = data.users || [];
    if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="4">검색 결과가 없습니다.</td></tr>'; return; }
    tbody.innerHTML = rows.map(u => `
      <tr data-id="${u.id}" style="cursor:pointer">
        <td>${escapeHtml(String(u.id))}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.nickname)}</td>
        <td>${roleBadge(u.role)}</td>
      </tr>`).join('');
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => onSelect(Number(tr.dataset.id), rows.find(u => String(u.id) === tr.dataset.id)));
    });
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">오류: ${escapeHtml(err.message)}</td></tr>`;
  }
}

/* -------------------- Payments page (/admin/payments) -------------------- */

function initPaymentsPage() {
  if (!getToken()) { window.location.href = '/admin'; return; }
  bindLogout();
  let _paymentPage = 1;
  let _currentPayment = null;

  async function loadPayments(page) {
    _paymentPage = page;
    const q = document.getElementById('payment-search').value.trim();
    const status = document.getElementById('payment-status-filter').value;
    const method = document.getElementById('payment-method-filter').value;
    const tbody = document.getElementById('payments-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9"><span class="spinner"></span></td></tr>';
    try {
      const params = new URLSearchParams({ page });
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      if (method) params.set('method', method);
      const data = await apiFetch(`/admin/api/payments?${params}`);
      const rows = data.payments || [];
      if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="9">없음</td></tr>'; return; }
      tbody.innerHTML = rows.map(p => `
        <tr data-id="${escapeHtml(String(p.id))}" style="cursor:pointer">
          <td>${escapeHtml(String(p.id))}</td>
          <td>${escapeHtml(p.order_number)}</td>
          <td>${escapeHtml(p.username)} (${escapeHtml(p.nickname)})</td>
          <td>${escapeHtml(p.method)}</td>
          <td>${formatKRW(p.requested_amount)}</td>
          <td>${formatKRW(p.approved_amount)}</td>
          <td>${formatKRW(p.canceled_amount)}</td>
          <td>${paymentStatusBadge(p.status)}</td>
          <td class="text-muted">${formatDate(p.approved_at || p.requested_at)}</td>
        </tr>`).join('');
      renderPagination('payments-pagination', page, data.total, data.pageSize || 20, loadPayments);
    } catch (err) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="9">오류: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function closePaymentModal() { document.getElementById('payment-modal').hidden = true; }

  function renderEvents(events) {
    const tbody = document.getElementById('payment-events-tbody');
    if (!events || !events.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">이벤트 없음</td></tr>';
      return;
    }
    tbody.innerHTML = events.map(e => `
      <tr>
        <td>${escapeHtml(e.transaction_type)}</td>
        <td>${formatKRW(e.amount)}</td>
        <td>${escapeHtml(e.status)}</td>
        <td class="text-muted">${escapeHtml(e.provider_transaction_id || '-')}</td>
        <td class="text-muted">${formatDate(e.created_at)}</td>
      </tr>`).join('');
  }

  async function openPaymentModal(id) {
    const modal = document.getElementById('payment-modal');
    const meta = document.getElementById('payment-modal-meta');
    const title = document.getElementById('payment-modal-title');
    const msgEl = document.getElementById('payment-cancel-msg');
    msgEl.textContent = ''; msgEl.className = 'generate-msg';
    document.getElementById('payment-cancel-reason').value = '';
    document.getElementById('payment-partial-cancel-amount').value = '';
    modal.hidden = false;
    meta.innerHTML = '<span class="text-muted"><span class="spinner"></span> 불러오는 중...</span>';
    document.getElementById('payment-events-tbody').innerHTML = '';
    try {
      const p = await apiFetch(`/admin/api/payments/${id}`);
      _currentPayment = p;
      title.textContent = `결제 #${p.id} — ${p.order_number}`;
      meta.innerHTML = `
        <span>사용자: <strong>${escapeHtml(p.username)} (${escapeHtml(p.nickname)})</strong></span>
        <span>수단: <strong>${escapeHtml(p.method)}</strong></span>
        <span>요청금액: <strong>${formatKRW(p.requested_amount)}</strong></span>
        <span>승인금액: <strong>${formatKRW(p.approved_amount)}</strong></span>
        <span>취소금액: <strong>${formatKRW(p.canceled_amount)}</strong></span>
        <span>상태: ${paymentStatusBadge(p.status)}</span>
        <span>주문상태: ${escapeHtml(p.order_status)}</span>
        <span>포인트/머니 사용: ${formatKRW(p.point_used_amount)} / ${formatKRW(p.money_used_amount)}</span>`;
      renderEvents(p.events);
      const cancelable = ['PAID', 'PARTIALLY_CANCELED'].includes(p.status);
      document.getElementById('payment-cancel-btn').disabled = !cancelable;
      document.getElementById('payment-partial-cancel-btn').disabled = !cancelable;
    } catch (err) {
      meta.innerHTML = `<span style="color:var(--danger)">불러오기 실패: ${escapeHtml(err.message)}</span>`;
    }
  }

  document.getElementById('payment-search-btn').addEventListener('click', () => loadPayments(1));
  document.getElementById('payment-search').addEventListener('keydown', e => { if (e.key === 'Enter') loadPayments(1); });
  document.getElementById('payments-tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openPaymentModal(tr.dataset.id);
  });
  document.getElementById('payment-modal-close').addEventListener('click', closePaymentModal);
  document.getElementById('payment-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });

  document.getElementById('payment-cancel-btn').addEventListener('click', async () => {
    if (!_currentPayment) return;
    const reason = document.getElementById('payment-cancel-reason').value.trim();
    const msgEl = document.getElementById('payment-cancel-msg');
    if (!reason) { msgEl.className = 'generate-msg error'; msgEl.textContent = '취소 사유를 입력하세요.'; return; }
    if (!confirm(`결제 #${_currentPayment.id}를 전체취소하시겠습니까?`)) return;
    try {
      await apiFetch(`/admin/api/payments/${_currentPayment.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason, idempotencyKey: genKey() }),
      });
      msgEl.className = 'generate-msg success';
      msgEl.textContent = '전체취소가 완료되었습니다.';
      await openPaymentModal(_currentPayment.id);
      await loadPayments(_paymentPage);
    } catch (err) {
      msgEl.className = 'generate-msg error';
      msgEl.textContent = `취소 실패: ${err.message}`;
    }
  });

  document.getElementById('payment-partial-cancel-btn').addEventListener('click', async () => {
    if (!_currentPayment) return;
    const reason = document.getElementById('payment-cancel-reason').value.trim();
    const cancelAmount = Number(document.getElementById('payment-partial-cancel-amount').value);
    const msgEl = document.getElementById('payment-cancel-msg');
    if (!reason) { msgEl.className = 'generate-msg error'; msgEl.textContent = '취소 사유를 입력하세요.'; return; }
    if (!cancelAmount || cancelAmount <= 0) { msgEl.className = 'generate-msg error'; msgEl.textContent = '부분취소 금액을 입력하세요.'; return; }
    if (!confirm(`결제 #${_currentPayment.id}를 ${cancelAmount.toLocaleString('ko-KR')}원 부분취소하시겠습니까?`)) return;
    try {
      await apiFetch(`/admin/api/payments/${_currentPayment.id}/partial-cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason, cancelAmount, idempotencyKey: genKey() }),
      });
      msgEl.className = 'generate-msg success';
      msgEl.textContent = '부분취소가 완료되었습니다.';
      await openPaymentModal(_currentPayment.id);
      await loadPayments(_paymentPage);
    } catch (err) {
      msgEl.className = 'generate-msg error';
      msgEl.textContent = `취소 실패: ${err.message}`;
    }
  });

  loadPayments(1);
}

/* -------------------- Wallet page (/admin/wallet) -------------------- */

function initWalletPage() {
  if (!getToken()) { window.location.href = '/admin'; return; }
  bindLogout();
  let _walletUserId = null;

  async function loadWalletDetail(userId, username) {
    document.getElementById('wallet-detail').hidden = false;
    document.getElementById('wallet-detail-title').textContent = `지갑 상세 — ${username || userId} (#${userId})`;
    document.getElementById('wallet-action-msg').textContent = '';
    try {
      const w = await apiFetch(`/api/admin/users/${userId}/wallet`);
      document.getElementById('wallet-money').textContent = formatKRW(w.moneyBalance);
      document.getElementById('wallet-earned').textContent = formatKRW(w.earnedPointBalance);
      document.getElementById('wallet-event').textContent = formatKRW(w.eventPointBalance);
      document.getElementById('wallet-test').textContent = formatKRW(w.testPointBalance);
      document.getElementById('wallet-comp').textContent = formatKRW(w.compensationPointBalance);
    } catch (err) {
      document.getElementById('wallet-action-msg').className = 'generate-msg error';
      document.getElementById('wallet-action-msg').textContent = `지갑 조회 실패: ${err.message}`;
    }
    try {
      const tx = await apiFetch(`/api/admin/users/${userId}/wallet/transactions?limit=50`);
      const items = tx.items || tx.transactions || (Array.isArray(tx) ? tx : []);
      const tbody = document.getElementById('wallet-tx-tbody');
      if (!items.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="6">거래 내역 없음</td></tr>'; }
      else {
        tbody.innerHTML = items.map(t => `
          <tr>
            <td>${escapeHtml(t.transactionType || t.transaction_type)}</td>
            <td>${escapeHtml(t.assetType || t.asset_type)}</td>
            <td>${formatKRW(t.amount)}</td>
            <td class="text-muted">${escapeHtml(t.referenceType || t.reference_type || '-')} ${escapeHtml(t.referenceId || t.reference_id || '')}</td>
            <td class="text-muted">${escapeHtml(t.description || '-')}</td>
            <td class="text-muted">${formatDate(t.createdAt || t.created_at)}</td>
          </tr>`).join('');
      }
    } catch (err) {
      document.getElementById('wallet-tx-tbody').innerHTML = `<tr class="empty-row"><td colspan="6">오류: ${escapeHtml(err.message)}</td></tr>`;
    }
    try {
      const adj = await apiFetch(`/api/admin/wallet-adjustments?userId=${userId}&limit=50`);
      const items = adj.items || [];
      const tbody = document.getElementById('wallet-adjustments-tbody');
      if (!items.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="6">조정 내역 없음</td></tr>'; }
      else {
        tbody.innerHTML = items.map(a => `
          <tr>
            <td>${escapeHtml(a.administratorUsername)}</td>
            <td>${escapeHtml(a.adjustmentType)}</td>
            <td>${escapeHtml(a.assetType)}</td>
            <td>${formatKRW(a.amount)}</td>
            <td class="text-muted">${escapeHtml(a.reason || '-')}</td>
            <td class="text-muted">${formatDate(a.createdAt)}</td>
          </tr>`).join('');
      }
    } catch (err) {
      document.getElementById('wallet-adjustments-tbody').innerHTML = `<tr class="empty-row"><td colspan="6">오류: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function selectWalletUser(userId, user) {
    _walletUserId = userId;
    loadWalletDetail(userId, user ? user.username : null);
  }

  document.getElementById('wallet-user-search-btn').addEventListener('click', () => {
    renderUserSearchResults('wallet-user-tbody', document.getElementById('wallet-user-search').value.trim(), selectWalletUser);
  });
  document.getElementById('wallet-user-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('wallet-user-search-btn').click();
  });

  document.getElementById('wallet-test-grant-btn').addEventListener('click', async () => {
    if (!_walletUserId) { alert('먼저 사용자를 선택하세요.'); return; }
    const assetType = document.getElementById('wallet-test-asset').value;
    const amount = Number(document.getElementById('wallet-test-amount').value);
    const reason = document.getElementById('wallet-test-reason').value.trim();
    const msgEl = document.getElementById('wallet-action-msg');
    if (!amount || amount <= 0) { msgEl.className = 'generate-msg error'; msgEl.textContent = '금액을 입력하세요.'; return; }
    if (!reason) { msgEl.className = 'generate-msg error'; msgEl.textContent = '사유를 입력하세요.'; return; }
    if (!confirm(`${assetType} ${amount.toLocaleString('ko-KR')}을(를) 지급하시겠습니까?`)) return;
    const path = assetType === 'MONEY' ? 'test-money' : 'test-points';
    try {
      await apiFetch(`/api/admin/users/${_walletUserId}/wallet/${path}/grant`, {
        method: 'POST',
        body: JSON.stringify({ amount, reason, idempotencyKey: genKey() }),
      });
      msgEl.className = 'generate-msg success';
      msgEl.textContent = '지급이 완료되었습니다.';
      loadWalletDetail(_walletUserId);
    } catch (err) {
      msgEl.className = 'generate-msg error';
      msgEl.textContent = `지급 실패: ${err.message}`;
    }
  });

  document.getElementById('wallet-test-revoke-btn').addEventListener('click', async () => {
    if (!_walletUserId) { alert('먼저 사용자를 선택하세요.'); return; }
    const assetType = document.getElementById('wallet-test-asset').value;
    const reason = document.getElementById('wallet-test-reason').value.trim();
    const msgEl = document.getElementById('wallet-action-msg');
    if (!reason) { msgEl.className = 'generate-msg error'; msgEl.textContent = '사유를 입력하세요.'; return; }
    if (!confirm(`${assetType} 잔액 전체를 회수하시겠습니까?`)) return;
    const path = assetType === 'MONEY' ? 'test-money' : 'test-points';
    try {
      await apiFetch(`/api/admin/users/${_walletUserId}/wallet/${path}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ revokeAll: true, reason, idempotencyKey: genKey() }),
      });
      msgEl.className = 'generate-msg success';
      msgEl.textContent = '회수가 완료되었습니다.';
      loadWalletDetail(_walletUserId);
    } catch (err) {
      msgEl.className = 'generate-msg error';
      msgEl.textContent = `회수 실패: ${err.message}`;
    }
  });

  document.getElementById('wallet-adj-submit-btn').addEventListener('click', async () => {
    if (!_walletUserId) { alert('먼저 사용자를 선택하세요.'); return; }
    const assetType = document.getElementById('wallet-adj-asset').value;
    const adjustmentType = document.getElementById('wallet-adj-type').value;
    const amount = Number(document.getElementById('wallet-adj-amount').value);
    const reason = document.getElementById('wallet-adj-reason').value.trim();
    const msgEl = document.getElementById('wallet-action-msg');
    if (!Number.isFinite(amount) || amount === 0) { msgEl.className = 'generate-msg error'; msgEl.textContent = '금액을 입력하세요.'; return; }
    if (!reason) { msgEl.className = 'generate-msg error'; msgEl.textContent = '사유를 입력하세요.'; return; }
    if (!confirm(`${assetType} ${adjustmentType} ${amount}를 실행하시겠습니까? (잔액은 조정거래로만 변경되며 원장에 기록됩니다)`)) return;
    try {
      await apiFetch(`/api/admin/users/${_walletUserId}/wallet/adjustments`, {
        method: 'POST',
        body: JSON.stringify({ assetType, adjustmentType, amount, reason, idempotencyKey: genKey() }),
      });
      msgEl.className = 'generate-msg success';
      msgEl.textContent = '조정이 완료되었습니다.';
      loadWalletDetail(_walletUserId);
    } catch (err) {
      msgEl.className = 'generate-msg error';
      msgEl.textContent = `조정 실패: ${err.message}`;
    }
  });
}

/* -------------------- Payment auth management page (/admin/payment-auth) -------------------- */

function initPaymentAuthPage() {
  if (!getToken()) { window.location.href = '/admin'; return; }
  bindLogout();
  let _authUserId = null;

  async function loadAuthDetail(userId, username) {
    document.getElementById('auth-detail').hidden = false;
    document.getElementById('auth-detail-title').textContent = `결제비밀번호 상태 — ${username || userId} (#${userId})`;
    document.getElementById('auth-action-msg').textContent = '';
    try {
      const data = await apiFetch(`/admin/api/users/${userId}/payment-auth`);
      document.getElementById('auth-cred-set').textContent = data.credential.isSet ? '설정됨' : '미설정';
      document.getElementById('auth-cred-version').textContent = data.credential.passwordVersion ?? '-';
      document.getElementById('auth-cred-locked').textContent = data.credential.isLocked
        ? `잠김 (~${formatDate(data.credential.lockedUntil)})`
        : '정상';

      const payTbody = document.getElementById('auth-payment-sessions-tbody');
      if (!data.paymentAuthSessions.length) {
        payTbody.innerHTML = '<tr class="empty-row"><td colspan="7">세션 없음</td></tr>';
      } else {
        payTbody.innerHTML = data.paymentAuthSessions.map(s => `
          <tr>
            <td>${escapeHtml(String(s.id))}</td>
            <td>${escapeHtml(s.purpose)}</td>
            <td class="text-muted">${escapeHtml(s.scope_type || '-')} ${escapeHtml(s.scope_id || '')}</td>
            <td class="text-muted">${escapeHtml(s.device_id || '-')}</td>
            <td class="text-muted">${formatDate(s.expires_at)}</td>
            <td>${sessionStatusBadge(s.status)}</td>
            <td>${s.status === 'ACTIVE' ? `<button class="btn-small btn-danger" data-revoke-payment="${s.id}">강제종료</button>` : '-'}</td>
          </tr>`).join('');
      }
      const accessTbody = document.getElementById('auth-access-sessions-tbody');
      if (!data.auctionAccessSessions.length) {
        accessTbody.innerHTML = '<tr class="empty-row"><td colspan="5">세션 없음</td></tr>';
      } else {
        accessTbody.innerHTML = data.auctionAccessSessions.map(s => `
          <tr>
            <td>${escapeHtml(String(s.id))}</td>
            <td class="text-muted">${escapeHtml(s.auction_id || '-')}</td>
            <td class="text-muted">${escapeHtml(s.scope_type || '-')}</td>
            <td class="text-muted">${formatDate(s.expires_at)}</td>
            <td>${sessionStatusBadge(s.status)} ${s.status === 'ACTIVE' ? `<button class="btn-small btn-danger" data-revoke-access="${s.id}">강제종료</button>` : ''}</td>
          </tr>`).join('');
      }

      payTbody.querySelectorAll('button[data-revoke-payment]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const reason = prompt('결제 인증세션 강제종료 사유를 입력하세요.');
          if (!reason) return;
          try {
            await apiFetch(`/admin/api/payment-auth-sessions/${btn.dataset.revokePayment}/revoke`, {
              method: 'POST', body: JSON.stringify({ reason }),
            });
            loadAuthDetail(userId, username);
          } catch (err) { alert(`오류: ${err.message}`); }
        });
      });
      accessTbody.querySelectorAll('button[data-revoke-access]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const reason = prompt('경매 입장세션 강제종료 사유를 입력하세요.');
          if (!reason) return;
          try {
            await apiFetch(`/admin/api/auction-access-sessions/${btn.dataset.revokeAccess}/revoke`, {
              method: 'POST', body: JSON.stringify({ reason }),
            });
            loadAuthDetail(userId, username);
          } catch (err) { alert(`오류: ${err.message}`); }
        });
      });
    } catch (err) {
      document.getElementById('auth-action-msg').className = 'generate-msg error';
      document.getElementById('auth-action-msg').textContent = `조회 실패: ${err.message}`;
    }
  }

  function selectAuthUser(userId, user) {
    _authUserId = userId;
    loadAuthDetail(userId, user ? user.username : null);
  }

  document.getElementById('auth-user-search-btn').addEventListener('click', () => {
    renderUserSearchResults('auth-user-tbody', document.getElementById('auth-user-search').value.trim(), selectAuthUser);
  });
  document.getElementById('auth-user-search').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('auth-user-search-btn').click();
  });

  document.getElementById('auth-reset-btn').addEventListener('click', async () => {
    if (!_authUserId) { alert('먼저 사용자를 선택하세요.'); return; }
    const reason = document.getElementById('auth-reset-reason').value.trim();
    const msgEl = document.getElementById('auth-action-msg');
    if (!reason) { msgEl.className = 'generate-msg error'; msgEl.textContent = '초기화 사유를 입력하세요.'; return; }
    if (!confirm('결제비밀번호를 강제 초기화하고 모든 인증세션을 폐기하시겠습니까?')) return;
    try {
      await apiFetch(`/admin/api/users/${_authUserId}/payment-credential/reset`, {
        method: 'POST', body: JSON.stringify({ reason }),
      });
      msgEl.className = 'generate-msg success';
      msgEl.textContent = '초기화가 완료되었습니다.';
      loadAuthDetail(_authUserId);
    } catch (err) {
      msgEl.className = 'generate-msg error';
      msgEl.textContent = `초기화 실패: ${err.message}`;
    }
  });
}

/* -------------------- REST auction management page (/admin/rest-auctions) -------------------- */

function initRestAuctionsPage() {
  if (!getToken()) { window.location.href = '/admin'; return; }
  bindLogout();
  let _restAuctionPage = 1;
  let _currentRestAuction = null;

  async function loadRestAuctions(page) {
    _restAuctionPage = page;
    const q = document.getElementById('rest-auction-search').value.trim();
    const status = document.getElementById('rest-auction-status-filter').value;
    const onlyUnpaid = document.getElementById('rest-auction-unpaid-only').checked;
    const tbody = document.getElementById('rest-auctions-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9"><span class="spinner"></span></td></tr>';
    try {
      const params = new URLSearchParams({ page });
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      if (onlyUnpaid) params.set('onlyUnpaid', 'true');
      const data = await apiFetch(`/admin/api/rest-auctions?${params}`);
      const rows = data.auctions || [];
      if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="9">없음</td></tr>'; return; }
      tbody.innerHTML = rows.map(a => `
        <tr data-id="${escapeHtml(String(a.id))}" style="cursor:pointer">
          <td>${escapeHtml(String(a.id))}</td>
          <td>${escapeHtml(a.product_name)}</td>
          <td>${formatKRW(a.current_price)}</td>
          <td>${escapeHtml(a.status)}</td>
          <td>${escapeHtml(a.seller_nickname || '-')}</td>
          <td>${escapeHtml(a.buyer_nickname || '-')}</td>
          <td>${escapeHtml(a.authentication_mode)}</td>
          <td>${a.order_status ? paymentStatusBadge(a.order_status) : '-'}</td>
          <td class="text-muted">${formatDate(a.payment_due_at)}</td>
        </tr>`).join('');
      renderPagination('rest-auctions-pagination', page, data.total, data.pageSize || 20, loadRestAuctions);
    } catch (err) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="9">오류: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function closeRestAuctionModal() { document.getElementById('rest-auction-modal').hidden = true; }

  async function openRestAuctionModal(id) {
    const modal = document.getElementById('rest-auction-modal');
    const meta = document.getElementById('rest-auction-modal-meta');
    const title = document.getElementById('rest-auction-modal-title');
    const authMsg = document.getElementById('rest-auction-auth-msg');
    authMsg.textContent = ''; authMsg.className = 'generate-msg';
    modal.hidden = false;
    meta.innerHTML = '<span class="text-muted"><span class="spinner"></span> 불러오는 중...</span>';
    document.getElementById('rest-auction-orders-tbody').innerHTML = '';
    document.getElementById('rest-auction-bids-tbody').innerHTML = '';
    try {
      const a = await apiFetch(`/admin/api/rest-auctions/${id}`);
      _currentRestAuction = a;
      title.textContent = `경매 #${a.id} — ${a.product_name || ''}`;
      meta.innerHTML = `
        <span>판매자: <strong>${escapeHtml(a.seller_nickname || '-')}</strong></span>
        <span>낙찰자: <strong>${escapeHtml(a.buyer_nickname || '-')}</strong></span>
        <span>낙찰가: <strong>${formatKRW(a.current_price)}</strong></span>
        <span>상태: ${escapeHtml(a.status)}</span>`;
      document.getElementById('rest-auction-auth-mode').value = a.authentication_mode;
      document.getElementById('rest-auction-high-value').value = a.high_value_reauth_amount ?? '';

      const orders = a.orders || [];
      const ordersTbody = document.getElementById('rest-auction-orders-tbody');
      ordersTbody.innerHTML = orders.length
        ? orders.map(o => `
          <tr>
            <td>${escapeHtml(String(o.id))}</td>
            <td>${paymentStatusBadge(o.status)}</td>
            <td>${formatKRW(o.payment_amount)}</td>
            <td class="text-muted">${formatDate(o.payment_due_at)}</td>
            <td class="text-muted">${formatDate(o.created_at)}</td>
          </tr>`).join('')
        : '<tr class="empty-row"><td colspan="5">주문 없음</td></tr>';

      const bids = a.bids || [];
      const bidsTbody = document.getElementById('rest-auction-bids-tbody');
      bidsTbody.innerHTML = bids.length
        ? bids.map(b => `
          <tr>
            <td>${escapeHtml(String(b.id))}</td>
            <td>${escapeHtml(b.bidder_name || '-')}</td>
            <td>${formatKRW(b.price)}</td>
            <td>${escapeHtml(b.status || '-')}</td>
            <td class="text-muted">${formatDate(b.created_at)}</td>
          </tr>`).join('')
        : '<tr class="empty-row"><td colspan="5">입찰 내역 없음</td></tr>';
    } catch (err) {
      meta.innerHTML = `<span style="color:var(--danger)">불러오기 실패: ${escapeHtml(err.message)}</span>`;
    }
  }

  document.getElementById('rest-auction-search-btn').addEventListener('click', () => loadRestAuctions(1));
  document.getElementById('rest-auction-search').addEventListener('keydown', e => { if (e.key === 'Enter') loadRestAuctions(1); });
  document.getElementById('rest-auctions-tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) openRestAuctionModal(tr.dataset.id);
  });
  document.getElementById('rest-auction-modal-close').addEventListener('click', closeRestAuctionModal);
  document.getElementById('rest-auction-modal-close2').addEventListener('click', closeRestAuctionModal);
  document.getElementById('rest-auction-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
  document.getElementById('rest-auction-auth-save-btn').addEventListener('click', async () => {
    if (!_currentRestAuction) return;
    const authenticationMode = document.getElementById('rest-auction-auth-mode').value;
    const highValueRaw = document.getElementById('rest-auction-high-value').value;
    const highValueReauthAmount = highValueRaw === '' ? null : Number(highValueRaw);
    const msgEl = document.getElementById('rest-auction-auth-msg');
    try {
      await apiFetch(`/admin/api/rest-auctions/${_currentRestAuction.id}/auth-settings`, {
        method: 'PATCH',
        body: JSON.stringify({ authenticationMode, highValueReauthAmount }),
      });
      msgEl.className = 'generate-msg success';
      msgEl.textContent = '저장되었습니다.';
      loadRestAuctions(_restAuctionPage);
    } catch (err) {
      msgEl.className = 'generate-msg error';
      msgEl.textContent = `저장 실패: ${err.message}`;
    }
  });

  loadRestAuctions(1);
}

/* -------------------- Bootstrap -------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'dashboard') initDashboardPage();
  else if (page === 'settlements') initSettlementsPage();
  else if (page === 'users') initUsersPage();
  else if (page === 'auctions') initAuctionsPage();
  else if (page === 'products') initProductsPage();
  else if (page === 'reviews') initReviewsPage();
  else if (page === 'group-deals') initGroupDealsPage();
  else if (page === 'consignments') initConsignmentsPage();
  else if (page === 'notice') initNoticePage();
  else if (page === 'payments') initPaymentsPage();
  else if (page === 'wallet') initWalletPage();
  else if (page === 'payment-auth') initPaymentAuthPage();
  else if (page === 'rest-auctions') initRestAuctionsPage();
  // Dashboard injects after login (sidebar starts hidden); other pages have a visible sidebar.
  if (page !== 'dashboard') { initResponsiveNav(); initThemeToggle(); }
});
