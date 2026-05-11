/**
 * Login Page — Barofarm (AUTH-8)
 * Username + password login via POST /api/auth/login.
 * If a valid token already exists, skips to /app/home.
 *
 * @module pages/login
 */

import { login } from '/app/scripts/api.js';
import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace, navigate } from '/app/scripts/router.js';
import { showToast } from '/app/components/toast.js';

// Inject CSS once
const _cssId = 'page-css-login';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/login.css';
  document.head.appendChild(link);
}

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
  page.className = 'login-page';
  page.dataset.theme = 'light';

  page.innerHTML = `
    <div class="login-card">
      <div class="login-logo-area">
        <div class="login-logo-icon">
          <img src="/app/assets/app-logo.png" alt="NH바로팜" class="login-logo-img" />
        </div>
        <p class="login-subtitle">산지직송 라이브 경매</p>
      </div>

      <form class="login-form" id="login-form" novalidate>
        <div class="login-field">
          <label class="login-label" for="login-username">아이디</label>
          <input
            class="login-input"
            id="login-username"
            name="username"
            type="text"
            placeholder="아이디 입력"
            autocomplete="username"
            inputmode="text"
            maxlength="30"
          />
          <span class="login-field-error" id="login-username-error"></span>
        </div>

        <div class="login-field">
          <label class="login-label" for="login-password">비밀번호</label>
          <input
            class="login-input"
            id="login-password"
            name="password"
            type="password"
            placeholder="비밀번호 입력"
            autocomplete="current-password"
            maxlength="128"
          />
          <span class="login-field-error" id="login-password-error"></span>
        </div>

        <span class="login-global-error" id="login-global-error"></span>

        <button type="submit" class="login-cta" id="login-submit">
          로그인
        </button>

        <p class="login-signup-link">
          아직 계정이 없으신가요?
          <a href="/app/signup" data-link class="login-signup-anchor">회원가입</a>
        </p>
      </form>
    </div>
  `;

  const form           = page.querySelector('#login-form');
  const usernameInput  = page.querySelector('#login-username');
  const passwordInput  = page.querySelector('#login-password');
  const usernameError  = page.querySelector('#login-username-error');
  const passwordError  = page.querySelector('#login-password-error');
  const globalError    = page.querySelector('#login-global-error');
  const submitBtn      = page.querySelector('#login-submit');

  function clearErrors() {
    usernameError.textContent = '';
    passwordError.textContent = '';
    globalError.textContent   = '';
    usernameInput.classList.remove('is-error');
    passwordInput.classList.remove('is-error');
  }

  function validate(username, password) {
    let valid = true;
    if (!username.trim()) {
      usernameError.textContent = '아이디를 입력해 주세요.';
      usernameInput.classList.add('is-error');
      valid = false;
    }
    if (!password) {
      passwordError.textContent = '비밀번호를 입력해 주세요.';
      passwordInput.classList.add('is-error');
      valid = false;
    }
    return valid;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!validate(username, password)) return;

    submitBtn.disabled    = true;
    submitBtn.textContent = '로그인 중...';

    try {
      await login({ username, password });
      await replace('/app/home');
    } catch (err) {
      const status = err.status;
      let msg = '아이디 또는 비밀번호가 올바르지 않습니다.';
      if (status && status !== 401 && status !== 404) {
        msg = err.message || '오류가 발생했습니다. 다시 시도해 주세요.';
      }
      showToast(msg, { variant: 'error' });
      globalError.textContent = msg;
      submitBtn.disabled    = false;
      submitBtn.textContent = '로그인';
    }
  });

  return page;
}
