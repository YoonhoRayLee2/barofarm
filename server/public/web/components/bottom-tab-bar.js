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

const SVG_HOME     = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1v-9z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
const SVG_PRODUCTS = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 8h14l-1 12a1 1 0 01-1 1H7a1 1 0 01-1-1L5 8z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8V6a3 3 0 016 0v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const SVG_CHAT     = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2h-7l-4 4v-4H6a2 2 0 01-2-2V6z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
const SVG_USER     = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="9" r="3.5" stroke="currentColor" stroke-width="2"/><path d="M5 20c1-3.5 4-5.5 7-5.5s6 2 7 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

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
