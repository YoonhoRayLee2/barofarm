/**
 * Live Create Page — 3-W21
 * Full-screen 2-step form (+ optional 3rd permission step).
 *
 * Step 1: 라이브 정보 (썸네일 + 카테고리 + 제목 + 입장 메시지)
 * Step 2: 시간·태그 (예약 시간 + 태그 선택)
 *         → "라이브 예약" 클릭 시: createLive({ scheduledAt }) 후 home으로
 *         → "라이브 바로 시작" 클릭 시: Step 3 (권한 화면)으로 진입
 * Step 3: 카메라+마이크 권한 → createLive() → live-seller/:id 로 이동
 *
 * @module pages/live-create
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { requestCameraPermission, requestMicPermission } from '/app/scripts/native-bridge.js';
import { replace, setCleanup } from '/app/scripts/router.js';
import { createLive } from '/app/scripts/api.js';
import { showToast } from '/app/components/toast.js';

// Inject page CSS once
const _cssId = 'page-css-live-create';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/live-create.css';
  document.head.appendChild(link);
}

const CATEGORIES = ['과일', '채소', '수산', '축산', '곡물', '기타'];
const TAGS = [
  '과일', '채소', '수산', '축산', '쌀',
  '한라봉', '사과', '배', '딸기', '감귤',
  '수박', '참외', '고구마', '옥수수', '전복', '꿀',
];

/**
 * @returns {Promise<HTMLElement>}
 */
export default async function load() {
  // ---- Auth guard ----
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

  // ---- State ----
  let currentStep = 1; // 1, 2, 3
  let title = '';
  let category = CATEGORIES[0];
  let welcomeMsg = '';
  let memo = '';
  const MAX_MEMO_IMAGES = 5;
  /** @type {File[]} 메모 첨부 사진 */
  const memoImageFiles = [];
  /** @type {string[]} 메모 사진 미리보기 ObjectURL (memoImageFiles와 1:1) */
  const memoImagePreviews = [];
  let camGranted = false;
  let micGranted = false;
  /** @type {File|null} */
  let thumbnailFile = null;
  /** @type {string|null} 미리보기용 ObjectURL */
  let thumbnailPreviewUrl = null;
  /** @type {string} datetime-local input의 현재 값 (yyyy-MM-ddTHH:mm) */
  let scheduledAtLocal = '';
  /** @type {Set<string>} 선택된 태그 */
  const selectedTags = new Set();

  // ---- Page shell ----
  const page = document.createElement('div');
  page.className = 'live-create';
  page.dataset.theme = 'light';

  // Safe area top
  const safeTop = document.createElement('div');
  safeTop.className = 'live-create__safe-top';
  page.appendChild(safeTop);

  // Header
  const header = document.createElement('header');
  header.className = 'live-create__header';
  header.innerHTML = `
    <button class="live-create__back-btn" id="lc-back" aria-label="뒤로">←</button>
    <h1 class="live-create__title">라이브 만들기</h1>
    <div class="live-create__spacer"></div>
  `;
  page.appendChild(header);

  // Step dots (steps 1,2 only — step 3은 권한 단계라 dot 없음)
  const stepsEl = document.createElement('div');
  stepsEl.className = 'live-create__steps';
  stepsEl.innerHTML = `
    <div class="step-dot is-active" data-step="1"></div>
    <div class="step-dot" data-step="2"></div>
  `;
  page.appendChild(stepsEl);

  // Content area (swapped by renderStep)
  const contentEl = document.createElement('div');
  contentEl.className = 'live-create__content';
  page.appendChild(contentEl);

  // Bottom CTA area (replaced per step)
  const bottomEl = document.createElement('div');
  bottomEl.className = 'live-create__bottom';
  bottomEl.innerHTML = `
    <div class="live-create__error" id="lc-error"></div>
    <div class="live-create__cta-slot" id="lc-cta-slot"></div>
  `;
  page.appendChild(bottomEl);

  const ctaSlot = bottomEl.querySelector('#lc-cta-slot');
  const errorEl = bottomEl.querySelector('#lc-error');

  function setError(msg) {
    errorEl.textContent = msg || '';
  }

  function updateStepDots(step) {
    stepsEl.querySelectorAll('.step-dot').forEach((dot) => {
      const n = parseInt(dot.dataset.step, 10);
      dot.classList.toggle('is-active', n === step);
      dot.classList.toggle('is-done', n < step);
    });
  }

  // datetime-local 기본값: 현재 + 1시간 (분 단위 truncate, 초 제거)
  function defaultScheduledAtLocal() {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function nowLocalForMin() {
    const d = new Date();
    d.setSeconds(0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // ============================================================
  // Step 1 — 라이브 정보
  // ============================================================
  function renderStep1() {
    contentEl.classList.remove('live-create__content');
    contentEl.className = 'lc-form-section';

    const previewMarkup = thumbnailPreviewUrl
      ? `<img src="${escapeAttr(thumbnailPreviewUrl)}" alt="썸네일 미리보기" />`
      : `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="6" width="18" height="14" rx="2"/>
          <circle cx="12" cy="13" r="3.5"/>
          <path d="M8 6l1.5-2h5L16 6"/>
        </svg>
      `;

    contentEl.innerHTML = `
      <div class="lc-info-banner">
        <span class="lc-info-banner__icon">i</span>
        <span>라이브 및 카테고리와 무관한 이미지나 제목 설정 시 라이브가 취소될 수 있으며, 시세 및 가격 정보는 기재할 수 없습니다.</span>
      </div>

      <div class="lc-upload-row">
        <div class="lc-upload-item">
          <div class="lc-upload-tile" id="lc-thumb-tile" role="button" tabindex="0" aria-label="대표 이미지 추가">
            <input type="file" id="lc-thumb-input" accept="image/*" style="display:none" />
            ${previewMarkup}
          </div>
          <div class="lc-upload-cap">대표 이미지</div>
        </div>
      </div>

      <label class="lc-label" for="lc-category">라이브 카테고리 <span class="lc-required">*</span></label>
      <select class="lc-select-field" id="lc-category">
        ${CATEGORIES.map((c) => `<option value="${escapeAttr(c)}"${c === category ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>

      <label class="lc-label" for="lc-title-input">라이브 제목 <span class="lc-required">*</span></label>
      <input
        class="lc-input"
        id="lc-title-input"
        type="text"
        placeholder="제목을 입력해 주세요"
        maxlength="40"
        autocomplete="off"
        value="${escapeAttr(title)}"
      />
      <div class="lc-counter" id="lc-title-counter">${title.length}/40</div>

      <label class="lc-label" for="lc-msg-input">라이브 입장 메시지</label>
      <textarea
        class="lc-textarea"
        id="lc-msg-input"
        placeholder="환영 메시지를 입력해 주세요"
        rows="2"
        maxlength="60"
      >${escapeHtml(welcomeMsg)}</textarea>
      <div class="lc-counter" id="lc-msg-counter">${welcomeMsg.length}/60</div>

      <label class="lc-label" for="lc-memo-input">라이브 메모 (선택)</label>
      <textarea
        class="lc-textarea"
        id="lc-memo-input"
        placeholder="상품 정보·배송 안내 등 시청자에게 보여줄 메모"
        rows="4"
        maxlength="2000"
      >${escapeHtml(memo)}</textarea>
      <div class="lc-counter" id="lc-memo-counter">${memo.length}/2000</div>

      <label class="lc-label">메모 사진 (선택, 최대 5장)</label>
      <div class="lc-memo-imgs" id="lc-memo-imgs"></div>

      <div class="lc-info-banner" style="margin-top: var(--space-4)">
        <span class="lc-info-banner__icon">i</span>
        <span>라이브와 무관한 제목은 취소될 수 있습니다.</span>
      </div>
    `;

    // CTA: 단일 "다음"
    ctaSlot.innerHTML = `<button class="live-create__cta" id="lc-cta-next">다음</button>`;
    ctaSlot.querySelector('#lc-cta-next').addEventListener('click', handleStep1Next);

    // Title input
    const titleInput = contentEl.querySelector('#lc-title-input');
    const titleCounter = contentEl.querySelector('#lc-title-counter');
    titleInput.addEventListener('input', () => {
      title = titleInput.value;
      titleCounter.textContent = `${title.length}/40`;
      setError('');
    });

    // Welcome msg
    const msgInput = contentEl.querySelector('#lc-msg-input');
    const msgCounter = contentEl.querySelector('#lc-msg-counter');
    msgInput.addEventListener('input', () => {
      welcomeMsg = msgInput.value;
      msgCounter.textContent = `${welcomeMsg.length}/60`;
    });

    // Live memo
    const memoInput = contentEl.querySelector('#lc-memo-input');
    const memoCounter = contentEl.querySelector('#lc-memo-counter');
    memoInput.addEventListener('input', () => {
      memo = memoInput.value;
      memoCounter.textContent = `${memo.length}/2000`;
    });

    // Memo images — 슬롯 렌더 (미리보기 + 개별 제거 + 추가 슬롯)
    const memoImgsEl = contentEl.querySelector('#lc-memo-imgs');
    function renderMemoImageSlots() {
      memoImgsEl.innerHTML = '';
      memoImagePreviews.forEach((url, i) => {
        const slot = document.createElement('div');
        slot.className = 'lc-memo-slot';
        const img = document.createElement('img');
        img.src = url;
        img.alt = `메모 사진 ${i + 1}`;
        slot.appendChild(img);
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'lc-memo-slot__remove';
        rm.setAttribute('aria-label', `메모 사진 ${i + 1} 제거`);
        rm.textContent = '✕';
        rm.addEventListener('click', () => {
          try { URL.revokeObjectURL(memoImagePreviews[i]); } catch {}
          memoImageFiles.splice(i, 1);
          memoImagePreviews.splice(i, 1);
          renderMemoImageSlots();
        });
        slot.appendChild(rm);
        memoImgsEl.appendChild(slot);
      });

      if (memoImageFiles.length < MAX_MEMO_IMAGES) {
        const addSlot = document.createElement('div');
        addSlot.className = 'lc-memo-slot lc-memo-slot--add';
        addSlot.setAttribute('role', 'button');
        addSlot.tabIndex = 0;
        addSlot.setAttribute('aria-label', '메모 사진 추가');
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        addSlot.appendChild(fileInput);
        const plus = document.createElement('span');
        plus.className = 'lc-memo-slot__add';
        plus.textContent = '+';
        addSlot.appendChild(plus);
        const cap = document.createElement('span');
        cap.className = 'lc-memo-slot__count';
        cap.textContent = `${memoImageFiles.length}/${MAX_MEMO_IMAGES}`;
        addSlot.appendChild(cap);

        fileInput.addEventListener('change', () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file || memoImageFiles.length >= MAX_MEMO_IMAGES) return;
          memoImageFiles.push(file);
          memoImagePreviews.push(URL.createObjectURL(file));
          renderMemoImageSlots();
        });
        addSlot.addEventListener('click', (e) => {
          if (e.target === fileInput) return;
          fileInput.click();
        });
        addSlot.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
          }
        });
        memoImgsEl.appendChild(addSlot);
      }
    }
    renderMemoImageSlots();

    // Category
    const catSelect = contentEl.querySelector('#lc-category');
    catSelect.addEventListener('change', () => {
      category = catSelect.value;
    });

    // Thumbnail
    const thumbTile = contentEl.querySelector('#lc-thumb-tile');
    const thumbInput = contentEl.querySelector('#lc-thumb-input');

    thumbTile.addEventListener('click', () => thumbInput.click());
    thumbTile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        thumbInput.click();
      }
    });

    thumbInput.addEventListener('change', () => {
      const file = thumbInput.files && thumbInput.files[0];
      if (!file) return;
      // 이전 미리보기 URL 정리
      if (thumbnailPreviewUrl) {
        try { URL.revokeObjectURL(thumbnailPreviewUrl); } catch {}
      }
      thumbnailFile = file;
      thumbnailPreviewUrl = URL.createObjectURL(file);
      thumbTile.innerHTML = `<input type="file" id="lc-thumb-input-2" accept="image/*" style="display:none" /><img src="${escapeAttr(thumbnailPreviewUrl)}" alt="썸네일 미리보기" />`;
      // 새 input wiring (replaced DOM)
      const newInput = thumbTile.querySelector('#lc-thumb-input-2');
      newInput.addEventListener('change', () => {
        const f2 = newInput.files && newInput.files[0];
        if (!f2) return;
        if (thumbnailPreviewUrl) {
          try { URL.revokeObjectURL(thumbnailPreviewUrl); } catch {}
        }
        thumbnailFile = f2;
        thumbnailPreviewUrl = URL.createObjectURL(f2);
        const img = thumbTile.querySelector('img');
        if (img) img.src = thumbnailPreviewUrl;
      });
      thumbTile.removeEventListener('click', null);
      thumbTile.addEventListener('click', () => newInput.click());
      setError('');
    });

    setTimeout(() => titleInput.focus(), 80);
  }

  function handleStep1Next() {
    setError('');
    if (!title.trim()) {
      setError('라이브 제목을 입력해 주세요.');
      return;
    }
    title = title.trim();
    currentStep = 2;
    updateStepDots(2);
    renderStep2();
  }

  // ============================================================
  // Step 2 — 시간·태그
  // ============================================================
  function renderStep2() {
    contentEl.className = 'lc-form-section';

    if (!scheduledAtLocal) {
      scheduledAtLocal = defaultScheduledAtLocal();
    }
    const minLocal = nowLocalForMin();

    contentEl.innerHTML = `
      <label class="lc-label" for="lc-datetime">라이브 시작 시간 <span class="lc-required">*</span></label>
      <input
        type="datetime-local"
        class="lc-datetime-field"
        id="lc-datetime"
        value="${escapeAttr(scheduledAtLocal)}"
        min="${escapeAttr(minLocal)}"
      />

      <div class="lc-info-banner" style="margin-top: var(--space-4)">
        <span class="lc-info-banner__icon">i</span>
        <span>"라이브 바로 시작"을 선택하면 예약 시간은 무시됩니다.</span>
      </div>

      <label class="lc-label">라이브 태그 설정 (최대 3개) <span class="lc-required">*</span></label>
      <div class="lc-tag-grid" id="lc-tag-grid">
        ${TAGS.map((t) => `<button type="button" class="lc-tag-chip${selectedTags.has(t) ? ' is-active' : ''}" data-tag="${escapeAttr(t)}">${escapeHtml(t)}</button>`).join('')}
      </div>

      <div class="lc-info-banner" style="margin-top: var(--space-4)">
        <span class="lc-info-banner__icon">i</span>
        <span>라이브 태그 설정시, 해당 분야를 주로 시청하는 컬렉터들에게 라이브가 우선으로 노출됩니다.</span>
      </div>
    `;

    // CTA: 메인 "예약" 위, 서브 "바로 시작" 아래 (세로 스택)
    ctaSlot.innerHTML = `
      <div class="live-create__cta-row">
        <button class="live-create__cta" id="lc-schedule">라이브 예약</button>
        <button class="live-create__cta live-create__cta--secondary" id="lc-start-now">라이브 바로 시작</button>
      </div>
    `;
    ctaSlot.querySelector('#lc-start-now').addEventListener('click', handleStartNow);
    ctaSlot.querySelector('#lc-schedule').addEventListener('click', handleSchedule);

    // Datetime change
    const dtInput = contentEl.querySelector('#lc-datetime');
    dtInput.addEventListener('input', () => {
      scheduledAtLocal = dtInput.value;
      setError('');
    });

    // Tag toggling
    const tagGrid = contentEl.querySelector('#lc-tag-grid');
    tagGrid.addEventListener('click', (e) => {
      const target = e.target.closest('.lc-tag-chip');
      if (!target) return;
      const t = target.dataset.tag;
      if (selectedTags.has(t)) {
        selectedTags.delete(t);
        target.classList.remove('is-active');
      } else {
        if (selectedTags.size >= 3) {
          setError('태그는 최대 3개까지 선택할 수 있습니다.');
          return;
        }
        selectedTags.add(t);
        target.classList.add('is-active');
        setError('');
      }
    });
  }

  async function handleSchedule() {
    setError('');
    const scheduleBtn = ctaSlot.querySelector('#lc-schedule');
    const startNowBtn = ctaSlot.querySelector('#lc-start-now');

    if (!scheduledAtLocal) {
      setError('라이브 시작 시간을 선택해 주세요.');
      return;
    }
    const scheduledAt = new Date(scheduledAtLocal).getTime();
    if (!scheduledAt || Number.isNaN(scheduledAt) || scheduledAt <= Date.now()) {
      setError('미래의 시간을 선택해 주세요.');
      return;
    }
    if (!thumbnailFile) {
      setError('대표 이미지를 선택해 주세요.');
      return;
    }

    scheduleBtn.disabled = true;
    if (startNowBtn) startNowBtn.disabled = true;
    scheduleBtn.textContent = '예약 중...';

    try {
      await createLive({
        sellerId: String(user.id),
        title,
        thumbnail: thumbnailFile,
        category,
        scheduledAt,
        memo: memo.trim() || null,
        memoImages: memoImageFiles,
      });
      const when = new Date(scheduledAt).toLocaleString('ko-KR');
      showToast(`라이브가 ${when}로 예약됐습니다`, { variant: 'success' });
      await replace('/app/home?tab=upcoming');
    } catch (err) {
      const msg = '라이브 예약 실패: ' + (err.message || String(err));
      setError(msg);
      showToast(msg, { variant: 'error' });
      scheduleBtn.disabled = false;
      if (startNowBtn) startNowBtn.disabled = false;
      scheduleBtn.textContent = '라이브 예약';
    }
  }

  async function handleStartNow() {
    setError('');
    currentStep = 3;
    // Step 3 (권한)에는 dot 없음 — 둘 다 done 처리
    stepsEl.querySelectorAll('.step-dot').forEach((dot) => {
      dot.classList.remove('is-active');
      dot.classList.add('is-done');
    });
    await advanceToStep3();
  }

  // ============================================================
  // Step 3 — 권한
  // ============================================================
  function renderStep3() {
    contentEl.className = 'live-create__content';
    contentEl.innerHTML = `
      <div class="live-create__icon">🎙️</div>
      <h2 class="live-create__step-title">권한이 필요합니다</h2>
      <p class="live-create__step-desc">라이브 방송을 위해 카메라와<br>마이크 접근을 허용해 주세요.</p>
      <div class="perm-card-list">
        <div class="perm-card ${camGranted ? 'is-granted' : ''}" id="lc-cam-card">
          <div class="perm-card__icon">📷</div>
          <div class="perm-card__info">
            <div class="perm-card__name">카메라</div>
            <div class="perm-card__desc">라이브 영상 촬영에 필요합니다</div>
          </div>
          <div class="perm-card__status" id="lc-cam-status">${camGranted ? '✅' : '⬜'}</div>
        </div>
        <div class="perm-card ${micGranted ? 'is-granted' : ''}" id="lc-mic-card">
          <div class="perm-card__icon">🎤</div>
          <div class="perm-card__info">
            <div class="perm-card__name">마이크</div>
            <div class="perm-card__desc">실시간 음성 방송에 필요합니다</div>
          </div>
          <div class="perm-card__status" id="lc-mic-status">${micGranted ? '✅' : '⬜'}</div>
        </div>
      </div>
    `;

    ctaSlot.innerHTML = `<button class="live-create__cta" id="lc-cta-perm">권한 허용</button>`;
    ctaSlot.querySelector('#lc-cta-perm').addEventListener('click', handlePermissionRequest);
  }

  function updatePermCards() {
    const camCard = contentEl.querySelector('#lc-cam-card');
    const camStatus = contentEl.querySelector('#lc-cam-status');
    const micCard = contentEl.querySelector('#lc-mic-card');
    const micStatus = contentEl.querySelector('#lc-mic-status');
    if (camCard) camCard.classList.toggle('is-granted', camGranted);
    if (camStatus) camStatus.textContent = camGranted ? '✅' : '⬜';
    if (micCard) micCard.classList.toggle('is-granted', micGranted);
    if (micStatus) micStatus.textContent = micGranted ? '✅' : '⬜';
  }

  async function checkExistingPermissions() {
    try {
      const [cam, mic] = await Promise.all([
        navigator.permissions.query({ name: 'camera' }),
        navigator.permissions.query({ name: 'microphone' }),
      ]);
      return cam.state === 'granted' && mic.state === 'granted';
    } catch {
      return false;
    }
  }

  // Enter Step 3: if camera+mic already granted, skip permissions UI and
  // proceed directly to live creation.
  async function advanceToStep3() {
    const alreadyGranted = await checkExistingPermissions();
    if (alreadyGranted) {
      camGranted = true;
      micGranted = true;
      await proceedToCreateLive();
      return;
    }
    renderStep3();
  }

  async function handlePermissionRequest() {
    setError('');
    const ctaBtn = ctaSlot.querySelector('#lc-cta-perm');
    if (!ctaBtn) return;
    ctaBtn.disabled = true;
    ctaBtn.textContent = '권한 요청 중...';
    try {
      const camResult = await requestCameraPermission();
      camGranted = camResult === 'granted' || camResult === 'web-fallback';

      const micResult = await requestMicPermission();
      micGranted = micResult === 'granted' || micResult === 'web-fallback';

      updatePermCards();

      if (!camGranted || !micGranted) {
        setError('카메라와 마이크 권한을 모두 허용해 주세요.');
        ctaBtn.disabled = false;
        ctaBtn.textContent = '다시 시도';
        return;
      }

      await proceedToCreateLive();
    } catch (err) {
      const msg = '라이브 생성 실패: ' + (err.message || String(err));
      setError(msg);
      showToast(msg, { variant: 'error' });
      ctaBtn.textContent = '다시 시도';
      ctaBtn.disabled = false;
    }
  }

  async function proceedToCreateLive() {
    // CTA 영역에 "라이브 생성 중..." 상태 표시
    ctaSlot.innerHTML = `<button class="live-create__cta" disabled>라이브 생성 중...</button>`;
    try {
      const live = await createLive({
        sellerId: String(user.id),
        title,
        thumbnail: thumbnailFile,
        category,
        memo: memo.trim() || null,
        memoImages: memoImageFiles,
      });
      await replace(`/app/live-seller/${live.id}`);
    } catch (err) {
      const msg = '라이브 생성 실패: ' + (err.message || String(err));
      setError(msg);
      showToast(msg, { variant: 'error' });
      ctaSlot.innerHTML = `<button class="live-create__cta" id="lc-cta-retry">다시 시도</button>`;
      ctaSlot.querySelector('#lc-cta-retry').addEventListener('click', handlePermissionRequest);
    }
  }

  // ---- Back button ----
  header.querySelector('#lc-back').addEventListener('click', () => {
    if (currentStep === 3) {
      currentStep = 2;
      updateStepDots(2);
      renderStep2();
      setError('');
    } else if (currentStep === 2) {
      currentStep = 1;
      updateStepDots(1);
      renderStep1();
      setError('');
    } else {
      window.history.back();
    }
  });

  // ---- Initial render ----
  renderStep1();
  updateStepDots(1);

  setCleanup(() => {
    if (thumbnailPreviewUrl) {
      try { URL.revokeObjectURL(thumbnailPreviewUrl); } catch {}
      thumbnailPreviewUrl = null;
    }
    memoImagePreviews.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch {}
    });
    memoImagePreviews.length = 0;
  });

  return page;
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
