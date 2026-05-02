/**
 * BottomTabBar Component — Barofarm
 * Renders the 5-tab bottom navigation bar.
 * The center [+] button triggers FAB modal.
 *
 * @module components/bottom-tab-bar
 */

import { navigate } from '/app/scripts/router.js';
import { openFabModal } from '/app/components/fab-modal.js';

// Inject CSS once
const _cssId = 'component-css-bottom-tab-bar';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/bottom-tab-bar.css';
  document.head.appendChild(link);
}

const SVG_HOME     = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1V11z"/></svg>`;
const SVG_PRODUCTS = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`;
const SVG_CHAT     = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11a8 8 0 01-12 7l-5 1 1-4a8 8 0 1116-4z"/></svg>`;
const SVG_USER     = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>`;

const TABS = [
  { id: 'home',     path: '/app/home',              icon: SVG_HOME,     label: '홈'     },
  { id: 'products', path: '/app/home?tab=products', icon: SVG_PRODUCTS, label: '일반판매' },
  { id: 'fab',      path: null,                     icon: null,         label: ''       },
  { id: 'chat',     path: '/app/chat',              icon: SVG_CHAT,     label: '채팅'   },
  { id: 'profile',  path: '/app/profile',           icon: SVG_USER,     label: '내정보'  },
];

/**
 * Create the bottom tab bar element.
 * @param {{ activeTab?: string }} [opts]  activeTab: 'home' | 'products' | 'chat' | 'profile'
 * @returns {HTMLElement}
 */
export function createBottomTabBar(opts = {}) {
  const { activeTab } = opts;

  const bar = document.createElement('nav');
  bar.className = 'bottom-tab-bar';
  bar.setAttribute('aria-label', '하단 메뉴');

  TABS.forEach((tab) => {
    if (tab.id === 'fab') {
      const wrapper = document.createElement('div');
      wrapper.className = 'tab-item tab-item--fab';

      const btn = document.createElement('button');
      btn.className = 'tab-fab-btn';
      btn.setAttribute('aria-label', '새 방송 / 경매 만들기');
      btn.innerHTML = '<span class="tab-fab-plus">+</span>';
      btn.addEventListener('click', () => openFabModal());

      wrapper.appendChild(btn);
      bar.appendChild(wrapper);
    } else {
      const btn = document.createElement('button');
      btn.className = 'tab-item' + (tab.id === activeTab ? ' is-active' : '');
      btn.setAttribute('aria-label', tab.label);
      btn.innerHTML = `
        <span class="tab-item__icon">${tab.icon}</span>
        <span class="tab-item__label">${tab.label}</span>
      `;
      btn.addEventListener('click', () => navigate(tab.path));
      bar.appendChild(btn);
    }
  });

  return bar;
}

/**
 * Create a spacer div to prevent content from hiding behind the fixed tab bar.
 * @returns {HTMLElement}
 */
export function createTabSpacer() {
  const div = document.createElement('div');
  div.className = 'bottom-tab-spacer';
  return div;
}
