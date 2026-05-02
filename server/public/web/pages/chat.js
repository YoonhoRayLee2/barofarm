/**
 * Chat Page — 3-W17
 * Empty state placeholder for chat history.
 *
 * @module pages/chat
 */

import { getSecureItem } from '/app/scripts/native-bridge.js';
import { replace } from '/app/scripts/router.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';

// Inject CSS once
const _cssId = 'page-css-chat';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/chat.css';
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
  page.className = 'chat-page';

  const header = document.createElement('header');
  header.className = 'chat-header';
  header.innerHTML = `<h1 class="chat-header__title">채팅</h1>`;
  page.appendChild(header);

  const empty = document.createElement('div');
  empty.className = 'chat-empty';
  empty.innerHTML = `
    <span class="chat-empty__icon">💬</span>
    <span class="chat-empty__title">채팅 내역이 없습니다</span>
    <span class="chat-empty__desc">
      라이브 방송에 참여하면<br>채팅 내역이 여기에 표시됩니다.
    </span>
  `;
  page.appendChild(empty);

  page.appendChild(createTabSpacer());
  page.appendChild(createBottomTabBar({ activeTab: 'chat' }));

  return page;
}
