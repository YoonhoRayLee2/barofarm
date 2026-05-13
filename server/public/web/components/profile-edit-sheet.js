/**
 * Profile Edit Bottom Sheet — Barofarm
 * Full-screen modal for editing avatar and nickname (90-day lock).
 *
 * @module components/profile-edit-sheet
 */

import { updateProfile } from '/app/scripts/api.js';
import { showToast } from '/app/components/toast.js';

/* ── CSS injection ─────────────────────────────────────────── */
const _cssId = 'comp-css-profile-edit-sheet';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/profile-edit-sheet.css';
  document.head.appendChild(link);
}

/* ── HTML escape helper ───────────────────────────────────── */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Date format YYYY.MM.DD ────────────────────────────────── */
function formatDate(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
}

/* ── Initial fallback for avatar (single Korean char) ─────── */
function initialOf(name) {
  const s = String(name || '').trim();
  return s ? s.charAt(0) : '?';
}

/**
 * Open the profile edit sheet.
 * @param {{
 *   id: string|number,
 *   nickname?: string|null,
 *   avatarUrl?: string|null,
 *   nicknameChangedAt?: string|null,
 * }} user
 * @param {(updatedUser: object) => void} [onSaved]
 */
export function openProfileEditSheet(user, onSaved) {
  // ── Compute nickname lock state ──
  let nicknameLocked = false;
  let nextChangeText = '변경 가능';
  if (user.nicknameChangedAt) {
    const last = new Date(user.nicknameChangedAt).getTime();
    const next = last + 90 * 24 * 60 * 60 * 1000;
    if (Date.now() < next) {
      nicknameLocked = true;
      nextChangeText = `다음 변경 가능: ${formatDate(new Date(next))}`;
    }
  }

  // ── Build backdrop + sheet ──
  const backdrop = document.createElement('div');
  backdrop.className = 'pes-backdrop';
  backdrop.dataset.theme = 'light';

  const sheet = document.createElement('div');
  sheet.className = 'pes-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', '프로필 수정');

  sheet.innerHTML = `
    <header class="pes-header">
      <button type="button" class="pes-close" aria-label="닫기">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <h2 class="pes-title">프로필 수정</h2>
      <span class="pes-header-spacer"></span>
    </header>

    <main class="pes-body">
      <!-- 섹션 1: 프로필 사진 -->
      <section class="pes-section pes-section--avatar">
        <p class="pes-section-title">프로필 사진</p>
        <div class="pes-avatar-row">
          <button type="button" class="pes-avatar-btn" aria-label="사진 변경">
            <span class="pes-avatar-img-wrap">
              ${user.avatarUrl
                ? `<img src="${esc(user.avatarUrl)}" alt="" class="pes-avatar-img"/>`
                : `<span class="pes-avatar-fallback">${esc(initialOf(user.nickname))}</span>`}
            </span>
            <span class="pes-avatar-edit-dot" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </span>
          </button>
          <span class="pes-avatar-label">사진 변경</span>
          <input type="file" accept="image/*" class="pes-avatar-input" hidden/>
        </div>
      </section>

      <!-- 섹션 2: 닉네임 -->
      <section class="pes-section">
        <p class="pes-section-title">닉네임</p>
        <input type="text" class="pes-input" name="nickname"
          value="${esc(user.nickname || '')}"
          maxlength="20"
          placeholder="닉네임"
          ${nicknameLocked ? 'disabled' : ''}/>
        <p class="pes-hint ${nicknameLocked ? 'is-locked' : ''}">${esc(nextChangeText)}</p>
      </section>

      <!-- 섹션 3: 농장 우편번호 (판매자용) -->
      <section class="pes-section">
        <p class="pes-section-title">농장 우편번호</p>
        <input type="text" class="pes-input" name="farmZipcode"
          value="${esc(user.farmZipcode || '')}"
          maxlength="10"
          inputmode="numeric"
          placeholder="예: 55365"/>
        <p class="pes-hint">산지 위치 기반 탄소발자국 계산에 사용됩니다</p>
      </section>

    </main>

    <footer class="pes-footer">
      <button type="button" class="pes-save-btn">저장하기</button>
    </footer>
  `;

  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  // ── Local state ──
  let pickedAvatar = null; // File | null

  // ── Element refs ──
  const closeBtn   = sheet.querySelector('.pes-close');
  const avatarBtn  = sheet.querySelector('.pes-avatar-btn');
  const avatarIn   = sheet.querySelector('.pes-avatar-input');
  const avatarWrap = sheet.querySelector('.pes-avatar-img-wrap');
  const saveBtn    = sheet.querySelector('.pes-save-btn');

  function getInput(name) {
    return sheet.querySelector(`.pes-input[name="${name}"]`);
  }

  // ── Trigger enter animation ──
  requestAnimationFrame(() => {
    requestAnimationFrame(() => backdrop.classList.add('is-visible'));
  });

  function close() {
    backdrop.classList.remove('is-visible');
    backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKeyDown);

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  // ── Avatar picker ──
  avatarBtn.addEventListener('click', () => avatarIn.click());
  avatarIn.addEventListener('change', () => {
    const file = avatarIn.files && avatarIn.files[0];
    if (!file) return;
    pickedAvatar = file;
    const url = URL.createObjectURL(file);
    avatarWrap.innerHTML = `<img src="${url}" alt="" class="pes-avatar-img"/>`;
  });

  // ── Save ──
  saveBtn.addEventListener('click', async () => {
    const fields = {};
    const newNick = (getInput('nickname').value || '').trim();
    if (!nicknameLocked && newNick && newNick !== (user.nickname || '')) {
      fields.nickname = newNick;
    }
    const newFarmZip = (getInput('farmZipcode').value || '').trim();
    if (newFarmZip !== (user.farmZipcode || '')) {
      fields.farmZipcode = newFarmZip;
    }
    if (pickedAvatar) fields.avatar = pickedAvatar;

    if (Object.keys(fields).length === 0) {
      showToast('변경된 내용이 없습니다.', { duration: 1800 });
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';
    try {
      const updated = await updateProfile(user.id, fields);
      showToast('프로필이 저장되었습니다.', { variant: 'success', duration: 1800 });
      if (typeof onSaved === 'function') onSaved(updated);
      close();
    } catch (err) {
      const msg = err?.message || '저장에 실패했습니다.';
      showToast(msg, { variant: 'error', duration: 2400 });
      saveBtn.disabled = false;
      saveBtn.textContent = '저장하기';
    }
  });
}
