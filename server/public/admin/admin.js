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

async function handleCancelSettlement(id, button) {
  if (!id) return;
  if (!confirm('이 정산을 취소(대기 상태로 되돌리기)하시겠습니까?')) return;
  button.disabled = true;
  try {
    await apiFetch(`/admin/api/settlements/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    });
    await loadSettlements();
  } catch (err) {
    alert(`처리 실패: ${err.message}`);
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
        if (!nickname) { alert('닉네임을 입력하세요.'); return; }
        try { await patchUser({ nickname }); closeUserModal(); loadUsers(_currentPage); }
        catch (err) { alert(`오류: ${err.message}`); }
      });

      document.getElementById('user-reset-pw-btn').addEventListener('click', async () => {
        const newPassword = document.getElementById('user-newpw-input').value;
        if (!newPassword || newPassword.length < 8) { alert('비밀번호는 8자 이상이어야 합니다.'); return; }
        try {
          await apiFetch(`/admin/api/users/${_currentUser.id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
          alert('비밀번호가 초기화되었습니다.');
          document.getElementById('user-newpw-input').value = '';
        } catch (err) { alert(`오류: ${err.message}`); }
      });

      document.getElementById('user-toggle-status-btn').addEventListener('click', async () => {
        const newStatus = _currentUser.status === 'suspended' ? 'active' : 'suspended';
        if (!confirm(newStatus === 'suspended' ? '이 계정을 정지하시겠습니까?' : '정지를 해제하시겠습니까?')) return;
        try { await patchUser({ status: newStatus }); closeUserModal(); loadUsers(_currentPage); }
        catch (err) { alert(`오류: ${err.message}`); }
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
    catch (err) { alert(`오류: ${err.message}`); }
  });
  document.getElementById('user-toggle-seller-btn').addEventListener('click', async () => {
    if (!_currentUser) return;
    const newRole = _currentUser.role === 'seller' ? 'buyer' : 'seller';
    try { await patchUser({ role: newRole }); closeUserModal(); loadUsers(_currentPage); }
    catch (err) { alert(`오류: ${err.message}`); }
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
        <div class="live-card">
          <div class="live-card__title">${escapeHtml(l.title)}</div>
          <div class="live-card__meta">판매자: ${escapeHtml(l.sellerName || l.sellerId)} | 시청자: ${l.viewerCount}</div>
          ${l.auction ? `<div class="live-card__auction">경매: ${escapeHtml(l.auction.productName||'')} / ${formatKRW(l.auction.currentPrice)} / 잔여 ${l.auction.timeLeft}초</div>` : '<div class="live-card__auction text-muted">경매 없음</div>'}
          <button class="btn-small btn-danger" data-liveid="${escapeHtml(l.liveId)}">강제 종료</button>
        </div>`).join('');
      el.querySelectorAll('button[data-liveid]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('이 라이브를 강제 종료하시겠습니까?')) return;
          try {
            await apiFetch(`/admin/api/live/${btn.dataset.liveid}/force-end`, { method: 'POST' });
            loadLiveCards();
          } catch (err) { alert(`오류: ${err.message}`); }
        });
      });
    } catch (err) { el.innerHTML = `<p style="color:var(--danger)">오류: ${escapeHtml(err.message)}</p>`; }
  }

  let _currentAuction = null;

  async function loadAuctions(page) {
    _auctionPage = page;
    const status = document.getElementById('auction-status-filter').value;
    const deliveryStatus = document.getElementById('auction-delivery-filter').value;
    const tbody = document.getElementById('auctions-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8"><span class="spinner"></span></td></tr>';
    try {
      const params = new URLSearchParams({ page });
      if (status) params.set('status', status);
      if (deliveryStatus) params.set('deliveryStatus', deliveryStatus);
      const data = await apiFetch(`/admin/api/auctions?${params}`);
      const rows = data.auctions || [];
      if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="8">없음</td></tr>'; return; }
      tbody.innerHTML = rows.map(a => {
        const ended = a.status === 'ended';
        return `<tr data-id="${escapeHtml(String(a.id))}"${ended ? ' style="cursor:pointer"' : ''}>
        <td>${escapeHtml(String(a.id))}</td><td>${escapeHtml(a.product_name)}</td>
        <td>${formatKRW(a.current_price)}</td><td>${escapeHtml(a.status)}</td>
        <td>${shippingStatusLabel(a.delivery_status)}</td><td>${escapeHtml(a.seller_nickname||'-')}</td>
        <td class="text-muted">${formatDate(a.created_at)}</td><td>${formatKRW(a.seller_fee_amt)}</td></tr>`;
      }).join('');
      renderPagination('auctions-pagination', page, data.total, 20, loadAuctions);
    } catch (err) { tbody.innerHTML = `<tr class="empty-row"><td colspan="8">오류: ${escapeHtml(err.message)}</td></tr>`; }
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
        if (!confirm('이 입찰을 취소(삭제)하시겠습니까?')) return;
        try {
          await apiFetch(`/admin/api/auctions/${_currentAuction.id}/bids/${btn.dataset.bidid}`, { method: 'DELETE' });
          openAuctionModal(_currentAuction.id);
        } catch (err) { alert(`오류: ${err.message}`); }
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

  loadLiveCards();
  _liveInterval = setInterval(loadLiveCards, 10000);
  window.addEventListener('beforeunload', () => { if (_liveInterval) clearInterval(_liveInterval); });

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
      alert('배송상태가 변경되었습니다.');
      loadAuctions(_auctionPage);
    } catch (err) { alert(`오류: ${err.message}`); }
  });
  document.getElementById('auction-force-end-btn').addEventListener('click', async () => {
    if (!_currentAuction) return;
    if (!confirm('이 경매를 강제 종료하시겠습니까?')) return;
    try {
      await apiFetch(`/admin/api/auctions/${_currentAuction.id}/force-end`, { method: 'POST' });
      closeAuctionModal();
      loadAuctions(_auctionPage);
    } catch (err) { alert(`오류: ${err.message}`); }
  });
  document.getElementById('auction-delete-btn').addEventListener('click', async () => {
    if (!_currentAuction) return;
    if (!confirm('이 경매 내역을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      await apiFetch(`/admin/api/auctions/${_currentAuction.id}`, { method: 'DELETE' });
      closeAuctionModal();
      loadAuctions(_auctionPage);
    } catch (err) { alert(`오류: ${err.message}`); }
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
          if (!confirm('상품을 삭제하시겠습니까?')) return;
          try {
            await apiFetch(`/admin/api/products/${btn.dataset.productid}`, { method: 'DELETE' });
            loadProducts(_productPage);
          } catch (err) { alert(`오류: ${err.message}`); }
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
            const reason = prompt('거절 사유를 입력하세요 (선택)');
            if (reason === null) return;
            body = { rejectReason: reason };
          }
          if (!confirm(`환불 ${action} 처리하시겠습니까?`)) return;
          try {
            await apiFetch(`/admin/api/refunds/${rid}/${action}`, { method: 'PATCH', body: JSON.stringify(body) });
            loadRefunds(_refundPage);
          } catch (err) { alert(`오류: ${err.message}`); }
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
    } catch (err) { alert(`오류: ${err.message}`); }
  });

  loadProducts(1);
  loadRefunds(1);
}

/* -------------------- Bootstrap -------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'dashboard') initDashboardPage();
  else if (page === 'settlements') initSettlementsPage();
  else if (page === 'users') initUsersPage();
  else if (page === 'auctions') initAuctionsPage();
  else if (page === 'products') initProductsPage();
});
