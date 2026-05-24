/**
 * Signup Page — Barofarm (AUTH-9, AUTH-11)
 * Full registration form: username, password, phone + terms consent.
 * Phone auto-formats to 010-XXXX-XXXX on input (AUTH-11).
 * On success: stores tokens, shows welcome modal, redirects to /app/home.
 *
 * @module pages/signup
 */

import { signup } from '/app/scripts/api.js';
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace, navigate } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';
import { showWelcomeModal } from '/app/components/welcome-nickname-modal.js';

// Inject CSS once
const _cssId = 'page-css-signup';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/signup.css';
  document.head.appendChild(link);
}

/* ─── AUTH-11: Phone formatter ─────────────────────────────────────── */

/**
 * Format a raw phone string to 010-XXXX-XXXX.
 * Strips all non-digits first, then applies Korean mobile format.
 * @param {string} raw - Raw input value (may contain hyphens, spaces, etc.)
 * @returns {string} Formatted string (e.g. "010-1234-5678")
 */
export function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3)  return digits;
  if (digits.length <= 7)  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

const PHONE_RE    = /^010-\d{4}-\d{4}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{4,30}$/;

/* ─── Page ──────────────────────────────────────────────────────────── */

/**
 * @returns {Promise<HTMLElement>}
 */
export default async function load() {
  // Already logged in — skip to home
  const token = await getSecureItem('barofarm_token');
  if (token) {
    await replace('/app/home');
    return document.createElement('div');
  }

  const page = document.createElement('div');
  page.className = 'signup-page';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <div class="signup-card">
      <div class="signup-header">
        <button type="button" class="signup-back-btn" id="signup-back" aria-label="뒤로가기">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="var(--color-ink)" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <h1 class="signup-title">회원가입</h1>
      </div>

      <form class="signup-form" id="signup-form" novalidate>

        <!-- Username -->
        <div class="signup-field">
          <label class="signup-label" for="su-username">아이디</label>
          <input
            class="signup-input"
            id="su-username"
            name="username"
            type="text"
            placeholder="영문·숫자·언더스코어 4~30자"
            autocomplete="username"
            inputmode="text"
            maxlength="30"
            aria-describedby="su-username-error"
          />
          <span class="signup-field-hint">영문, 숫자, 언더스코어(_) 4~30자</span>
          <span class="signup-field-error" id="su-username-error" role="alert" aria-live="polite"></span>
        </div>

        <!-- Password -->
        <div class="signup-field">
          <label class="signup-label" for="su-password">비밀번호</label>
          <input
            class="signup-input"
            id="su-password"
            name="password"
            type="password"
            placeholder="8자 이상"
            autocomplete="new-password"
            maxlength="128"
            aria-describedby="su-password-error"
          />
          <span class="signup-field-error" id="su-password-error" role="alert" aria-live="polite"></span>
        </div>

        <!-- Password confirm -->
        <div class="signup-field">
          <label class="signup-label" for="su-password-confirm">비밀번호 확인</label>
          <input
            class="signup-input"
            id="su-password-confirm"
            name="password_confirm"
            type="password"
            placeholder="비밀번호 재입력"
            autocomplete="new-password"
            maxlength="128"
            aria-describedby="su-password-confirm-error"
          />
          <span class="signup-field-error" id="su-password-confirm-error" role="alert" aria-live="polite"></span>
        </div>

        <!-- Phone -->
        <div class="signup-field">
          <label class="signup-label" for="su-phone">휴대폰 번호</label>
          <input
            class="signup-input"
            id="su-phone"
            name="phone"
            type="tel"
            placeholder="010-0000-0000"
            autocomplete="tel"
            inputmode="numeric"
            maxlength="13"
            aria-describedby="su-phone-error"
          />
          <span class="signup-field-error" id="su-phone-error" role="alert" aria-live="polite"></span>
        </div>

        <!-- Terms -->
        <div class="signup-terms-row">
          <label class="signup-terms-label">
            <input
              type="checkbox"
              class="signup-terms-checkbox"
              id="su-terms"
              name="terms"
            />
            <span class="signup-terms-text">
              <a href="/app/terms" data-link class="signup-terms-anchor">이용약관</a> 및
              <a href="/app/privacy" data-link class="signup-terms-anchor">개인정보처리방침</a>에 동의합니다
            </span>
          </label>
          <span class="signup-field-error" id="su-terms-error"></span>
        </div>

        <span class="signup-global-error" id="su-global-error"></span>

        <button type="submit" class="signup-cta" id="su-submit">
          가입하기
        </button>

        <p class="signup-login-link">
          이미 계정이 있으신가요?
          <a href="/app/login" data-link class="signup-login-anchor">로그인</a>
        </p>
      </form>
    </div>
  `;

  /* ── References ── */
  const form           = page.querySelector('#signup-form');
  const usernameInput  = page.querySelector('#su-username');
  const passwordInput  = page.querySelector('#su-password');
  const confirmInput   = page.querySelector('#su-password-confirm');
  const phoneInput     = page.querySelector('#su-phone');
  const termsCheck     = page.querySelector('#su-terms');
  const submitBtn      = page.querySelector('#su-submit');
  const backBtn        = page.querySelector('#signup-back');

  const usernameError  = page.querySelector('#su-username-error');
  const passwordError  = page.querySelector('#su-password-error');
  const confirmError   = page.querySelector('#su-password-confirm-error');
  const phoneError     = page.querySelector('#su-phone-error');
  const termsError     = page.querySelector('#su-terms-error');
  const globalError    = page.querySelector('#su-global-error');

  /* ── Back button ── */
  backBtn.addEventListener('click', () => navigate('/app/login'));

  /* ── AUTH-11: Phone auto-format ── */
  phoneInput.addEventListener('input', () => {
    phoneInput.value = formatPhone(phoneInput.value);
  });

  /* ── Helpers ── */
  function clearErrors() {
    [usernameError, passwordError, confirmError, phoneError, termsError, globalError]
      .forEach(el => { el.textContent = ''; });
    [usernameInput, passwordInput, confirmInput, phoneInput]
      .forEach(el => el.classList.remove('is-error'));
    termsCheck.classList.remove('is-error');
  }

  function validate(username, password, confirm, phone, termsOk) {
    let valid = true;

    if (!USERNAME_RE.test(username)) {
      usernameError.textContent = '아이디는 영문·숫자·언더스코어 4~30자여야 합니다.';
      usernameInput.classList.add('is-error');
      valid = false;
    }

    if (password.length < 8) {
      passwordError.textContent = '비밀번호는 8자 이상이어야 합니다.';
      passwordInput.classList.add('is-error');
      valid = false;
    }

    if (password !== confirm) {
      confirmError.textContent = '비밀번호가 일치하지 않습니다.';
      confirmInput.classList.add('is-error');
      valid = false;
    }

    if (!PHONE_RE.test(phone)) {
      phoneError.textContent = '올바른 휴대폰 번호를 입력해 주세요. (예: 010-1234-5678)';
      phoneInput.classList.add('is-error');
      valid = false;
    }

    if (!termsOk) {
      termsError.textContent = '이용약관에 동의해 주세요.';
      termsCheck.classList.add('is-error');
      valid = false;
    }

    return valid;
  }

  /* ── Submit ── */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirm  = confirmInput.value;
    const phone    = phoneInput.value.trim();
    const termsOk  = termsCheck.checked;

    if (!validate(username, password, confirm, phone, termsOk)) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = '가입 중...';

    try {
      const data = await signup({ username, password, phone });
      // Show welcome modal then navigate home
      await showWelcomeModal(data.user.nickname || username);
      await replace('/app/home');
    } catch (err) {
      const status = err.status;
      let msg = err.message || '오류가 발생했습니다. 다시 시도해 주세요.';

      if (status === 409) {
        // Try to identify which field conflicts
        const lowerMsg = msg.toLowerCase();
        if (lowerMsg.includes('phone') || lowerMsg.includes('phone')) {
          msg = '이미 사용 중인 휴대폰 번호입니다.';
          phoneError.textContent = msg;
          phoneInput.classList.add('is-error');
        } else {
          msg = '이미 사용 중인 아이디입니다.';
          usernameError.textContent = msg;
          usernameInput.classList.add('is-error');
        }
      } else if (status === 400) {
        globalError.textContent = msg;
      } else {
        globalError.textContent = msg;
      }

      showToast(msg, { variant: 'error' });
      submitBtn.disabled    = false;
      submitBtn.textContent = '가입하기';
    }
  });

  return page;
}
