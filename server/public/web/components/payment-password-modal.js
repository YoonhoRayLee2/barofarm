/**
 * Payment Password Modal — 결제 비밀번호 6자리 PIN (설정·검증 겸용)
 *
 * 사용:
 *   import { showPaymentPasswordModal } from '/app/components/payment-password-modal.js';
 *   const result = await showPaymentPasswordModal({
 *     title, subtitle,
 *     ensureSet: true,          // GET /status로 미설정 시 설정 유도, 잠금 시 잠금 안내
 *     onSubmit: async (pin) => { ... 실제 검증 API 호출 ... return result; },
 *   });
 *   // result = onSubmit 반환값, 사용자가 취소하면 null
 *
 * 보안:
 * - PIN 원문은 이 모듈의 지역 변수에만 존재하며 localStorage/세션/분석이벤트/로그에 저장하지 않는다.
 * - 검증은 onSubmit(호출부가 POST /verify · /payment-auth/sessions · /auctions/:id/enter 수행)로 위임한다.
 * - 인증 토큰은 서버가 HttpOnly 쿠키로 관리하므로 프론트는 저장하지 않는다.
 *
 * @module components/payment-password-modal
 */

import { request } from '/app/scripts/api.js';

const _cssId = 'comp-css-payment-password-modal';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/payment-password-modal.css';
  document.head.appendChild(link);
}

const DIGITS = 6;

/** 서버 오류코드 → 사용자 안내 문구 */
const ERROR_MESSAGES = {
  INVALID_PAYMENT_PASSWORD: '결제 비밀번호가 일치하지 않습니다.',
  PAYMENT_PASSWORD_LOCKED: '결제 비밀번호가 잠겼습니다.',
  PAYMENT_PASSWORD_NOT_SET: '결제 비밀번호가 설정되어 있지 않습니다.',
  PAYMENT_PASSWORD_TOO_SIMPLE: '너무 단순한 번호입니다. 다른 번호로 설정해주세요.',
  PAYMENT_PASSWORD_ALREADY_SET: '이미 결제 비밀번호가 설정되어 있습니다.',
  INVALID_PAYMENT_PASSWORD_FORMAT: '6자리 숫자를 입력해주세요.',
  PAYMENT_AUTH_SESSION_EXPIRED: '인증이 만료되었습니다. 다시 시도해주세요.',
  PAYMENT_AUTH_SESSION_REVOKED: '인증이 해제되었습니다. 다시 시도해주세요.',
  HIGH_VALUE_REAUTH_REQUIRED: '고액 거래는 재인증이 필요합니다.',
};

/**
 * @param {{
 *   title?: string,
 *   subtitle?: string,
 *   ensureSet?: boolean,
 *   onSubmit?: (pin: string) => Promise<any>,
 *   allowReset?: boolean,
 * }} [options]
 * @returns {Promise<any|null>}
 */
export function showPaymentPasswordModal(options = {}) {
  const {
    title = '결제 비밀번호',
    subtitle = '결제 비밀번호 6자리를 입력해주세요',
    ensureSet = true,
    onSubmit = null,
    allowReset = true,
  } = options;

  return new Promise((resolve) => {
    let pin = '';
    let setupFirst = '';
    /** 'verify' | 'setup-new' | 'setup-confirm' | 'locked' */
    let mode = 'verify';
    let busy = false;

    const backdrop = document.createElement('div');
    backdrop.className = 'ppm-backdrop';
    backdrop.dataset.theme = 'light';
    backdrop.innerHTML = `
      <div class="ppm-sheet" role="dialog" aria-modal="true" aria-label="결제 비밀번호 입력">
        <button class="ppm-close" type="button" aria-label="닫기">✕</button>
        <div class="ppm-head">
          <h2 class="ppm-title"></h2>
          <p class="ppm-subtitle"></p>
        </div>
        <div class="ppm-dots" aria-hidden="true"></div>
        <p class="ppm-error" role="alert"></p>
        <div class="ppm-keypad"></div>
        <button class="ppm-reset" type="button">비밀번호를 잊으셨나요?</button>
      </div>
    `;
    document.body.appendChild(backdrop);

    const titleEl = backdrop.querySelector('.ppm-title');
    const subEl = backdrop.querySelector('.ppm-subtitle');
    const dotsEl = backdrop.querySelector('.ppm-dots');
    const errEl = backdrop.querySelector('.ppm-error');
    const keypadEl = backdrop.querySelector('.ppm-keypad');
    const resetBtn = backdrop.querySelector('.ppm-reset');
    resetBtn.style.display = allowReset ? '' : 'none';

    for (let i = 0; i < DIGITS; i++) {
      const d = document.createElement('span');
      d.className = 'ppm-dot';
      dotsEl.appendChild(d);
    }

    // Keypad: 1-9, (blank), 0, delete
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
    keys.forEach((k) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      if (k === '') {
        btn.className = 'ppm-key ppm-key--empty';
        btn.disabled = true;
      } else if (k === 'del') {
        btn.className = 'ppm-key ppm-key--del';
        btn.textContent = '⌫';
        btn.setAttribute('aria-label', '지우기');
        btn.addEventListener('click', popDigit);
      } else {
        btn.className = 'ppm-key';
        btn.textContent = k;
        btn.addEventListener('click', () => pushDigit(k));
      }
      keypadEl.appendChild(btn);
    });

    function renderDots() {
      const kids = dotsEl.children;
      for (let i = 0; i < DIGITS; i++) kids[i].classList.toggle('is-filled', i < pin.length);
    }
    function setError(msg) {
      errEl.textContent = msg || '';
      errEl.classList.toggle('is-visible', !!msg);
    }
    function setHeader(t, s) {
      titleEl.textContent = t;
      subEl.textContent = s;
    }

    function pushDigit(d) {
      if (busy || mode === 'locked' || pin.length >= DIGITS) return;
      setError('');
      pin += d;
      renderDots();
      if (pin.length === DIGITS) setTimeout(handleComplete, 120);
    }
    function popDigit() {
      if (busy || mode === 'locked') return;
      pin = pin.slice(0, -1);
      renderDots();
    }

    async function handleComplete() {
      if (mode === 'verify') {
        await doVerify();
      } else if (mode === 'setup-new') {
        setupFirst = pin;
        pin = '';
        renderDots();
        mode = 'setup-confirm';
        setHeader('결제 비밀번호 설정', '다시 한 번 입력해주세요');
      } else if (mode === 'setup-confirm') {
        if (pin !== setupFirst) {
          pin = '';
          setupFirst = '';
          renderDots();
          mode = 'setup-new';
          setHeader('결제 비밀번호 설정', '새 비밀번호 6자리를 입력해주세요');
          setError('비밀번호가 일치하지 않습니다. 다시 설정해주세요.');
          return;
        }
        await doCreate();
      }
    }

    async function doVerify() {
      if (!onSubmit) {
        close({ ok: true });
        return;
      }
      busy = true;
      try {
        const result = await onSubmit(pin);
        close(result ?? { ok: true });
      } catch (err) {
        handleApiError(err);
      } finally {
        busy = false;
      }
    }

    async function doCreate() {
      busy = true;
      try {
        await request('/api/payment-credentials', {
          method: 'POST',
          body: JSON.stringify({ password: pin }),
        });
        if (onSubmit) {
          const result = await onSubmit(pin);
          close(result ?? { ok: true, created: true });
        } else {
          close({ created: true });
        }
      } catch (err) {
        const code = errCode(err);
        // 설정 단계 오류(단순번호 등)는 처음부터 다시 입력
        pin = '';
        setupFirst = '';
        renderDots();
        mode = 'setup-new';
        setHeader('결제 비밀번호 설정', '새 비밀번호 6자리를 입력해주세요');
        setError(ERROR_MESSAGES[code] || (err && err.message) || '설정에 실패했습니다.');
      } finally {
        busy = false;
      }
    }

    function errCode(err) {
      return (err && (err.code || err.message)) || '';
    }

    function handleApiError(err) {
      const code = errCode(err);
      if (code === 'PAYMENT_PASSWORD_LOCKED') {
        showLocked(err.body && err.body.lockedUntil);
        return;
      }
      if (code === 'PAYMENT_PASSWORD_NOT_SET') {
        enterSetup();
        return;
      }
      pin = '';
      renderDots();
      if (code === 'INVALID_PAYMENT_PASSWORD') {
        setError(ERROR_MESSAGES[code] + ' 여러 번 실패하면 일정 시간 잠깁니다.');
      } else {
        setError(ERROR_MESSAGES[code] || (err && err.message) || '처리에 실패했습니다.');
      }
    }

    function showLocked(lockedUntil) {
      mode = 'locked';
      pin = '';
      renderDots();
      keypadEl.style.display = 'none';
      let when = '';
      if (lockedUntil) {
        try {
          const d = new Date(lockedUntil);
          when = ` ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')} 이후 다시 시도할 수 있습니다.`;
        } catch { /* ignore */ }
      }
      setHeader('결제 비밀번호가 잠겼습니다', `비밀번호를 여러 번 틀렸습니다.${when}`);
      setError('');
    }

    function enterSetup() {
      mode = 'setup-new';
      pin = '';
      setupFirst = '';
      renderDots();
      keypadEl.style.display = '';
      setHeader('결제 비밀번호 설정', '새 비밀번호 6자리를 입력해주세요');
      setError('');
    }

    function enterVerify() {
      mode = 'verify';
      pin = '';
      renderDots();
      keypadEl.style.display = '';
      setHeader(title, subtitle);
      setError('');
    }

    resetBtn.addEventListener('click', async () => {
      const loginPassword = window.prompt('로그인 비밀번호를 입력하면 결제 비밀번호가 초기화됩니다.');
      if (!loginPassword) return;
      try {
        await request('/api/payment-credentials/reset', {
          method: 'POST',
          body: JSON.stringify({ loginPassword }),
        });
        enterSetup();
      } catch (err) {
        setError(ERROR_MESSAGES[errCode(err)] || '초기화에 실패했습니다. 로그인 비밀번호를 확인해주세요.');
      }
    });

    function onKey(e) {
      if (e.key === 'Escape') {
        close(null);
        return;
      }
      if (mode === 'locked') return;
      if (/^[0-9]$/.test(e.key)) pushDigit(e.key);
      else if (e.key === 'Backspace') popDigit();
    }
    document.addEventListener('keydown', onKey);

    function close(result) {
      document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('is-visible');
      backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
      setTimeout(() => { if (backdrop.isConnected) backdrop.remove(); }, 400);
      resolve(result);
    }

    backdrop.querySelector('.ppm-close').addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });

    setHeader(title, subtitle);
    requestAnimationFrame(() => requestAnimationFrame(() => backdrop.classList.add('is-visible')));

    (async () => {
      if (!ensureSet) {
        enterVerify();
        return;
      }
      try {
        const status = await request('/api/payment-credentials/status', { method: 'GET' });
        if (status.isLocked) { showLocked(status.lockedUntil); return; }
        if (!status.isSet) { enterSetup(); return; }
        enterVerify();
      } catch {
        // status 조회 실패 시 검증 모드로 진행(onSubmit이 NOT_SET을 반환하면 그때 설정 유도)
        enterVerify();
      }
    })();
  });
}
