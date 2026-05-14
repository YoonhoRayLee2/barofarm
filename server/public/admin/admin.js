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
  return `<span class="badge badge--info">${status || '-'}</span>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  if (!confirm('이 정산을 완료 처리하시겠습니까?')) return;
  button.disabled = true;
  try {
    await apiFetch(`/admin/api/settlements/${encodeURIComponent(id)}/pay`, {
      method: 'PATCH',
    });
    await loadSettlements();
  } catch (err) {
    alert(`처리 실패: ${err.message}`);
    button.disabled = false;
  }
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

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadSettlements);

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
}

/* -------------------- Bootstrap -------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'dashboard') initDashboardPage();
  else if (page === 'settlements') initSettlementsPage();
});
