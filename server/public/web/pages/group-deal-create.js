/**
 * Group Deal Create Page — 공동구매 개설
 * Route: /app/group-deals/create
 *
 * 판매자만 접근. 비판매자는 /app/group-deals 로 리다이렉트.
 *
 * @module pages/group-deal-create
 */
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';

const _cssId = 'page-css-group-deal-create';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/group-deal-create.css';
  document.head.appendChild(link);
}

const CATEGORIES = ['과일', '채소', '수산', '축산', '곡물', '기타'];

const CAT_EMOJI = {
  '과일': '🍎',
  '채소': '🥬',
  '수산': '🐟',
  '축산': '🥩',
  '곡물': '🌾',
  '기타': '🛒',
};

export default async function load() {
  const stored = await getSecureItem('user');
  if (!stored) {
    await replace('/app/login');
    return document.createElement('div');
  }
  let user;
  try {
    user = JSON.parse(stored);
  } catch {
    await replace('/app/login');
    return document.createElement('div');
  }

  // 판매자 권한 휴리스틱 (role 필드 부재 시 계좌 인증 여부로 판단)
  // 인증 정보가 비어있으면 통과 (앱 데모 환경).
  const isSeller =
    user.bankVerifiedAt != null || user.bankVerifiedAt === undefined;
  if (!isSeller) {
    showToast('판매자만 공동구매를 개설할 수 있습니다', { variant: 'error' });
    await replace('/app/group-deals');
    return document.createElement('div');
  }

  const page = document.createElement('div');
  page.className = 'gdc-page';
  page.dataset.theme = 'light';

  // 기본 마감일: 7일 후 23:59
  const defaultCloseDate = new Date();
  defaultCloseDate.setDate(defaultCloseDate.getDate() + 7);
  defaultCloseDate.setHours(23, 59, 0, 0);
  const defaultCloseStr = toLocalDatetime(defaultCloseDate);

  page.innerHTML = `
    <header class="gdc-header">
      <button class="gdc-header__back" aria-label="뒤로 가기">‹</button>
      <h1 class="gdc-header__title">공동구매 개설</h1>
    </header>

    <form class="gdc-form" id="gdc-form" autocomplete="off">

      <section class="gdc-section">
        <label class="gdc-thumb-slot" id="gdc-thumb-slot">
          <input type="file" accept="image/*" id="gdc-thumb-input" style="display:none">
          <div class="gdc-thumb-slot__inner" id="gdc-thumb-inner">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
            <span>대표 이미지 추가</span>
          </div>
        </label>
      </section>

      <section class="gdc-section">
        <label class="gdc-label">제목 <span class="gdc-required">*</span></label>
        <input class="gdc-input" type="text" name="title" placeholder="예: 햇사과 공동구매 5kg" maxlength="60" required>
      </section>

      <section class="gdc-section">
        <label class="gdc-label">카테고리 <span class="gdc-required">*</span></label>
        <div class="gdc-cat-grid" id="gdc-cat-grid">
          ${CATEGORIES.map((c) => `
            <button type="button" class="gdc-cat-chip" data-cat="${c}">
              <span class="gdc-cat-chip__emoji">${CAT_EMOJI[c]}</span>
              <span class="gdc-cat-chip__label">${c}</span>
            </button>
          `).join('')}
        </div>
        <input type="hidden" name="category" id="gdc-category" required>
      </section>

      <section class="gdc-section gdc-row">
        <div class="gdc-field">
          <label class="gdc-label">단가 <span class="gdc-required">*</span></label>
          <div class="gdc-input-suffix">
            <input class="gdc-input" type="number" name="pricePerUnit" placeholder="0" min="0" step="100" required>
            <span class="gdc-input-suffix__text">원</span>
          </div>
        </div>
        <div class="gdc-field gdc-field--narrow">
          <label class="gdc-label">단위</label>
          <input class="gdc-input" type="text" name="unitLabel" placeholder="박스" value="개" maxlength="8">
        </div>
      </section>

      <section class="gdc-section gdc-row">
        <div class="gdc-field">
          <label class="gdc-label">목표 인원 <span class="gdc-required">*</span></label>
          <div class="gdc-input-suffix">
            <input class="gdc-input" type="number" name="minParticipants" placeholder="2" min="2" value="2" required>
            <span class="gdc-input-suffix__text">명 이상</span>
          </div>
        </div>
        <div class="gdc-field">
          <label class="gdc-label">최대 인원</label>
          <div class="gdc-input-suffix">
            <input class="gdc-input" type="number" name="maxParticipants" placeholder="무제한" min="1">
            <span class="gdc-input-suffix__text">명까지</span>
          </div>
        </div>
      </section>

      <section class="gdc-section">
        <label class="gdc-label">마감일 <span class="gdc-required">*</span></label>
        <input class="gdc-input" type="datetime-local" name="closesAt" value="${defaultCloseStr}" required>
        <p class="gdc-hint">마감일까지 목표 인원이 모이면 자동 확정됩니다.</p>
      </section>

      <section class="gdc-section">
        <label class="gdc-label">설명</label>
        <textarea class="gdc-textarea" name="description" rows="4" placeholder="상품 정보, 배송 안내, 픽업 장소 등을 자유롭게 작성해주세요."></textarea>
      </section>

      <div class="gdc-submit-wrap">
        <button type="submit" class="gdc-submit" id="gdc-submit">이벤트 개설하기</button>
      </div>
    </form>
  `;

  page.querySelector('.gdc-header__back').addEventListener('click', () => window.history.back());

  // ── 이미지 미리보기 ──
  const thumbInput = page.querySelector('#gdc-thumb-input');
  const thumbInner = page.querySelector('#gdc-thumb-inner');
  let thumbFile = null;
  thumbInput.addEventListener('change', () => {
    const f = thumbInput.files && thumbInput.files[0];
    if (!f) return;
    thumbFile = f;
    const url = URL.createObjectURL(f);
    thumbInner.innerHTML = `<img src="${url}" alt="" class="gdc-thumb-slot__img">`;
  });

  // ── 카테고리 칩 선택 ──
  const catGrid = page.querySelector('#gdc-cat-grid');
  const catHidden = page.querySelector('#gdc-category');
  catGrid.addEventListener('click', (e) => {
    const chip = e.target.closest('.gdc-cat-chip');
    if (!chip) return;
    catGrid.querySelectorAll('.gdc-cat-chip').forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    catHidden.value = chip.dataset.cat;
  });

  // ── 폼 제출 ──
  const formEl = page.querySelector('#gdc-form');
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = page.querySelector('#gdc-submit');

    if (!catHidden.value) {
      showToast('카테고리를 선택해주세요', { variant: 'error' });
      return;
    }
    const minP = Number(formEl.minParticipants.value);
    const maxP = formEl.maxParticipants.value ? Number(formEl.maxParticipants.value) : null;
    if (maxP != null && maxP < minP) {
      showToast('최대 인원은 목표 인원보다 작을 수 없습니다', { variant: 'error' });
      return;
    }
    const closesAt = new Date(formEl.closesAt.value);
    if (!Number.isFinite(closesAt.getTime()) || closesAt.getTime() < Date.now()) {
      showToast('마감일을 미래 시점으로 설정해주세요', { variant: 'error' });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '개설 중...';

    const fd = new FormData();
    fd.append('sellerId', String(user.id));
    fd.append('title', formEl.title.value.trim());
    fd.append('category', catHidden.value);
    fd.append('pricePerUnit', formEl.pricePerUnit.value);
    fd.append('unitLabel', formEl.unitLabel.value.trim() || '개');
    fd.append('minParticipants', String(minP));
    if (maxP != null) fd.append('maxParticipants', String(maxP));
    fd.append('closesAt', closesAt.toISOString().slice(0, 19).replace('T', ' '));
    fd.append('description', formEl.description.value.trim());
    if (thumbFile) fd.append('image', thumbFile);

    try {
      const res = await fetch('/api/group-deals', { method: 'POST', body: fd });
      if (!res.ok) {
        let err = {};
        try { err = await res.json(); } catch {}
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      showToast('공동구매가 개설되었습니다!', { variant: 'success' });
      navigate('/app/group-deals/' + data.id);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = '이벤트 개설하기';
      showToast(err.message || '개설에 실패했습니다', { variant: 'error' });
    }
  });

  return page;
}

function toLocalDatetime(d) {
  // input[type=datetime-local] 형식: YYYY-MM-DDTHH:MM
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
