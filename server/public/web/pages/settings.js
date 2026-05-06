/**
 * Settings Page — 3-W17
 * App settings: notifications, FCM token, terms, version info.
 *
 * @module pages/settings
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { getFcmToken } from '/app/scripts/native-bridge.js';
import { replace, navigate } from '/app/scripts/router.js';

// Inject CSS once
const _cssId = 'page-css-settings';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/settings.css';
  document.head.appendChild(link);
}

/**
 * @returns {Promise<HTMLElement>}
 */
export default async function load() {
  // Auth guard
  const stored = await getSecureItem('user');
  if (!stored) {
    await replace('/app/login');
    return document.createElement('div');
  }

  const page = document.createElement('div');
  page.className = 'settings-page';
  page.dataset.theme = 'light';

  // Header with back button
  const header = document.createElement('header');
  header.className = 'settings-header';
  header.innerHTML = `
    <button class="settings-header__back" aria-label="뒤로 가기">‹</button>
    <h1 class="settings-header__title">설정</h1>
  `;
  header.querySelector('.settings-header__back').addEventListener('click', () => {
    window.history.back();
  });
  page.appendChild(header);

  // Notifications section
  const notifSection = document.createElement('div');
  notifSection.className = 'settings-section';
  notifSection.innerHTML = `
    <div class="settings-section-label">알림</div>
    <div class="settings-item">
      <div class="settings-item__label-area">
        <span class="settings-item__label">알림 설정</span>
        <span class="settings-item__value">시스템 설정에서 변경하세요</span>
      </div>
    </div>
  `;
  page.appendChild(notifSection);

  // FCM token section
  const tokenSection = document.createElement('div');
  tokenSection.className = 'settings-section';
  tokenSection.innerHTML = `<div class="settings-section-label">개발자 정보</div>`;

  const tokenArea = document.createElement('div');
  tokenArea.className = 'settings-token-area';
  tokenArea.innerHTML = `
    <div class="settings-token-label">푸시 토큰 (FCM)</div>
    <div class="settings-token-box" id="settings-fcm-token">로딩 중...</div>
  `;
  tokenSection.appendChild(tokenArea);
  page.appendChild(tokenSection);

  // Load FCM token asynchronously
  getFcmToken().then((token) => {
    const el = page.querySelector('#settings-fcm-token');
    if (el) {
      el.textContent = token || 'web-fallback (Flutter 앱에서만 발급됨)';
    }
  }).catch(() => {
    const el = page.querySelector('#settings-fcm-token');
    if (el) el.textContent = '불러오기 실패';
  });

  // Legal section
  const legalSection = document.createElement('div');
  legalSection.className = 'settings-section';
  legalSection.innerHTML = `
    <div class="settings-section-label">약관 및 정보</div>
    <button class="settings-item settings-item--btn" id="settings-terms-btn">
      <div class="settings-item__label-area">
        <span class="settings-item__label">이용약관</span>
      </div>
      <span class="settings-item__chevron">›</span>
    </button>
    <button class="settings-item settings-item--btn" id="settings-privacy-btn">
      <div class="settings-item__label-area">
        <span class="settings-item__label">개인정보처리방침</span>
      </div>
      <span class="settings-item__chevron">›</span>
    </button>
    <div class="settings-item">
      <div class="settings-item__label-area">
        <span class="settings-item__label">버전 정보</span>
        <span class="settings-item__value">0.1.0 (MVP)</span>
      </div>
    </div>
  `;
  page.appendChild(legalSection);

  legalSection.querySelector('#settings-terms-btn').addEventListener('click', () => navigate('/app/terms'));
  legalSection.querySelector('#settings-privacy-btn').addEventListener('click', () => navigate('/app/privacy'));

  return page;
}
