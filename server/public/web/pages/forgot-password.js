/**
 * Forgot Password Page — Barofarm
 * Two-step password reset flow:
 *   Step 1: verify identity by username + phone (POST /api/auth/verify-identity)
 *   Step 2: set a new password using the issued reset token (POST /api/auth/reset-password)
 *
 * @module pages/forgot-password
 */

import { navigate } from '/app/scripts/router.js';
import { escapeHtml } from '/app/scripts/dom.js';
import { showToast } from '/app/components/toast.js';

// Inject CSS once
const _cssId = 'page-css-forgot-password';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/forgot-password.css';
  document.head.appendChild(link);
}

function formatPhone(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/**
 * @returns {Promise<HTMLElement>}
 */
export default async function load() {
  const page = document.createElement('div');
  page.className = 'fp-page';

  page.innerHTML = `
    <header class="fp-header">
      <button class="fp-header__back" type="button" aria-label="뒤로가기">‹</button>
      <h1 class="fp-header__title">비밀번호 찾기</h1>
    </header>

    <main class="fp-main">
      <div class="fp-step" id="fp-step1">
        <p class="fp-desc">가입 시 등록한 아이디와 휴대폰 번호를 입력해 주세요.</p>
        <div class="fp-field">
          <input type="text" id="fp-username" class="fp-input" placeholder="아이디" autocomplete="username" maxlength="30">
          <p class="fp-error" id="fp-username-error"></p>
        </div>
        <div class="fp-field">
          <input type="tel" id="fp-phone" class="fp-input" placeholder="010-0000-0000" inputmode="numeric" maxlength="13">
          <p class="fp-error" id="fp-phone-error"></p>
        </div>
        <p class="fp-error fp-error--global" id="fp-step1-error"></p>
        <button class="fp-btn" type="button" id="fp-step1-submit">확인</button>
      </div>

      <div class="fp-step fp-step--hidden" id="fp-step2">
        <p class="fp-desc">새로운 비밀번호를 입력해 주세요.</p>
        <div class="fp-field">
          <input type="password" id="fp-pw" class="fp-input" placeholder="새 비밀번호 (8자 이상)" autocomplete="new-password" maxlength="128">
          <p class="fp-error" id="fp-pw-error"></p>
        </div>
        <div class="fp-field">
          <input type="password" id="fp-pw-confirm" class="fp-input" placeholder="비밀번호 확인" autocomplete="new-password" maxlength="128">
          <p class="fp-error" id="fp-pw-confirm-error"></p>
        </div>
        <p class="fp-error fp-error--global" id="fp-step2-error"></p>
        <button class="fp-btn" type="button" id="fp-step2-submit">변경하기</button>
      </div>
    </main>
  `;

  const backBtn         = page.querySelector('.fp-header__back');
  const step1           = page.querySelector('#fp-step1');
  const step2           = page.querySelector('#fp-step2');

  const usernameInput   = page.querySelector('#fp-username');
  const phoneInput      = page.querySelector('#fp-phone');
  const usernameError   = page.querySelector('#fp-username-error');
  const phoneError      = page.querySelector('#fp-phone-error');
  const step1Error      = page.querySelector('#fp-step1-error');
  const step1Submit     = page.querySelector('#fp-step1-submit');

  const pwInput         = page.querySelector('#fp-pw');
  const pwConfirmInput  = page.querySelector('#fp-pw-confirm');
  const pwError         = page.querySelector('#fp-pw-error');
  const pwConfirmError  = page.querySelector('#fp-pw-confirm-error');
  const step2Error      = page.querySelector('#fp-step2-error');
  const step2Submit     = page.querySelector('#fp-step2-submit');

  /** @type {string|null} */
  let resetToken = null;

  backBtn.addEventListener('click', () => {
    window.history.back();
  });

  phoneInput.addEventListener('input', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    t.value = formatPhone(t.value);
  });

  function clearStep1Errors() {
    usernameError.textContent = '';
    phoneError.textContent = '';
    step1Error.textContent = '';
    usernameInput.classList.remove('is-error');
    phoneInput.classList.remove('is-error');
  }

  function clearStep2Errors() {
    pwError.textContent = '';
    pwConfirmError.textContent = '';
    step2Error.textContent = '';
    pwInput.classList.remove('is-error');
    pwConfirmInput.classList.remove('is-error');
  }

  function validateStep1(username, phone) {
    let valid = true;
    if (!username) {
      usernameError.textContent = '아이디를 입력해 주세요.';
      usernameInput.classList.add('is-error');
      valid = false;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      phoneError.textContent = '올바른 휴대폰 번호를 입력해 주세요.';
      phoneInput.classList.add('is-error');
      valid = false;
    }
    return valid;
  }

  function validateStep2(pw, pwConfirm) {
    let valid = true;
    if (pw.length < 8) {
      pwError.textContent = '비밀번호는 8자 이상이어야 합니다.';
      pwInput.classList.add('is-error');
      valid = false;
    }
    if (pw !== pwConfirm) {
      pwConfirmError.textContent = '비밀번호가 일치하지 않습니다.';
      pwConfirmInput.classList.add('is-error');
      valid = false;
    }
    return valid;
  }

  step1Submit.addEventListener('click', async () => {
    clearStep1Errors();

    const username = usernameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (!validateStep1(username, phone)) return;

    step1Submit.disabled = true;
    step1Submit.textContent = '확인 중...';

    try {
      const res = await fetch('/api/auth/verify-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, phone }),
      });

      if (!res.ok) {
        let msg = '아이디 또는 휴대폰 번호가 일치하지 않습니다.';
        try {
          const data = await res.json();
          if (data && data.message) msg = escapeHtml(data.message);
        } catch { /* ignore parse errors */ }
        step1Error.textContent = msg;
        return;
      }

      const data = await res.json();
      if (!data || !data.resetToken) {
        step1Error.textContent = '서버 응답이 올바르지 않습니다.';
        return;
      }

      resetToken = data.resetToken;
      step1.classList.add('fp-step--hidden');
      step2.classList.remove('fp-step--hidden');
      pwInput.focus();
    } catch (err) {
      step1Error.textContent = '네트워크 오류가 발생했습니다. 다시 시도해 주세요.';
    } finally {
      step1Submit.disabled = false;
      step1Submit.textContent = '확인';
    }
  });

  step2Submit.addEventListener('click', async () => {
    clearStep2Errors();

    const pw = pwInput.value;
    const pwConfirm = pwConfirmInput.value;

    if (!validateStep2(pw, pwConfirm)) return;
    if (!resetToken) {
      step2Error.textContent = '인증이 만료됐습니다. 처음부터 다시 시도해 주세요.';
      return;
    }

    step2Submit.disabled = true;
    step2Submit.textContent = '변경 중...';

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, newPassword: pw }),
      });

      if (!res.ok) {
        let msg = '비밀번호 변경에 실패했습니다.';
        try {
          const data = await res.json();
          if (data && data.message) msg = escapeHtml(data.message);
        } catch { /* ignore parse errors */ }
        step2Error.textContent = msg;
        return;
      }

      showToast('비밀번호가 변경됐습니다', { variant: 'success' });
      await navigate('/app/login');
    } catch (err) {
      step2Error.textContent = '네트워크 오류가 발생했습니다. 다시 시도해 주세요.';
    } finally {
      step2Submit.disabled = false;
      step2Submit.textContent = '변경하기';
    }
  });

  return page;
}
