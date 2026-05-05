/**
 * Profile Page — T6-PROF (PROF-1~7)
 * Full redesign based on 프로필_구매자.png / 프로필_판매자.png references.
 *
 * Sections:
 *   PROF-1  Hero header (avatar + stats 3-up + edit buttons)
 *   PROF-2  Collector / Dealer tab toggle
 *   PROF-3  Interest pills (mock)
 *   PROF-4  Badge grid 6-up (mock)
 *   PROF-5  Average delivery widget
 *   PROF-6  Collector tab content (icon actions + menu)
 *   PROF-7  Dealer tab content (revenue + menu)
 *
 * @module pages/profile
 */

import { getSecureItem, setSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import * as api from '/app/scripts/api.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';
import { showToast } from '/app/components/toast.js';

/* ── CSS injection ─────────────────────────────────────────── */
const _cssId = 'page-css-profile';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/profile.css';
  document.head.appendChild(link);
}

/* ── Mock data ─────────────────────────────────────────────── */
const MOCK_STATS = { sales: 0, followers: 11, following: 111 };

const MOCK_INTERESTS = ['피규어', '아트토이', '패션 · 빈티지', '굿즈'];

const MOCK_BADGES = [
  { code: 'top_dealer',      label: '탑 딜러',    icon: '🔒', earned: false },
  { code: 'first_purchase',  label: '첫 구매',    icon: '🎁', earned: true  },
  { code: 'first_live',      label: '첫 라이브',  icon: '🔒', earned: false },
  { code: 'sniper',          label: '정조준',     icon: '🎯', earned: true  },
  { code: 'rare_dealer',     label: '레어템 딜러', icon: '🔒', earned: false },
  { code: 'listing_master',  label: '리스팅 경',  icon: '🔒', earned: false },
];

/* ── SVG helpers ───────────────────────────────────────────── */
function svgPersonSilhouette(size = 52) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="12" cy="8" r="4" fill="currentColor"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="currentColor"/>
  </svg>`;
}

function svgMegaphone() {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M19 3L5 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2l14 5V3z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 15.5V19a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

function svgBell() {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function svgGear() {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" stroke-width="1.8"/>
  </svg>`;
}

function svgQuestionCircle() {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="currentColor" stroke-width="1.4"/>
  </svg>`;
}

function svgClock() {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
    <polyline points="12 7 12 12 15 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

function svgPlay() {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <polygon points="5 3 19 12 5 21 5 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function svgPercent() {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="6.5" cy="6.5" r="2.5" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="17.5" cy="17.5" r="2.5" stroke="currentColor" stroke-width="1.8"/>
  </svg>`;
}

/* ── Escape helper ─────────────────────────────────────────── */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Safe navigate with toast fallback ────────────────────── */
function go(path, label) {
  if (path) {
    navigate(path);
  } else {
    showToast(label + ' — 준비 중', { duration: 1800 });
  }
}

/* ── Build: top nickname bar ───────────────────────────────── */
function buildTopbar(nickname) {
  const bar = document.createElement('div');
  bar.className = 'profile-topbar';

  const avatar = document.createElement('div');
  avatar.className = 'profile-topbar__avatar';
  avatar.innerHTML = svgPersonSilhouette(28);

  const name = document.createElement('span');
  name.className = 'profile-topbar__name';
  name.textContent = nickname;

  const actions = document.createElement('div');
  actions.className = 'profile-topbar__actions';

  function iconBtn(svgContent, ariaLabel, onClick) {
    const btn = document.createElement('button');
    btn.className = 'profile-topbar__icon-btn';
    btn.setAttribute('aria-label', ariaLabel);
    btn.innerHTML = svgContent;
    btn.addEventListener('click', onClick);
    return btn;
  }

  actions.appendChild(iconBtn(svgMegaphone(), '공지', () => {
    showToast('공지사항 — 준비 중', { duration: 1800 });
  }));
  actions.appendChild(iconBtn(svgBell(), '알림', () => {
    showToast('알림 — 준비 중', { duration: 1800 });
  }));
  actions.appendChild(iconBtn(svgGear(), '설정', () => {
    navigate('/app/settings');
  }));

  bar.appendChild(avatar);
  bar.appendChild(name);
  bar.appendChild(actions);
  return { el: bar, nameEl: name };
}

/* ── Build: PROF-1 hero ────────────────────────────────────── */
function buildHero(user) {
  const hero = document.createElement('div');
  hero.className = 'profile-hero';

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'profile-hero__avatar';
  avatarWrap.style.borderRadius = '50%';
  avatarWrap.style.overflow = 'hidden';
  if (user && user.avatarUrl) {
    avatarWrap.innerHTML = `<img src="${esc(user.avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
  } else {
    avatarWrap.innerHTML = svgPersonSilhouette(52);
  }
  hero.appendChild(avatarWrap);

  const statsWrap = document.createElement('div');
  statsWrap.className = 'profile-stats';

  [
    { num: MOCK_STATS.sales,     label: '판매' },
    { num: MOCK_STATS.followers, label: '팔로워' },
    { num: MOCK_STATS.following, label: '팔로잉' },
  ].forEach(({ num, label }) => {
    const stat = document.createElement('div');
    stat.className = 'profile-stat';
    stat.setAttribute('role', 'button');
    stat.setAttribute('tabindex', '0');
    stat.innerHTML = `
      <span class="profile-stat__num">${num}</span>
      <span class="profile-stat__label">${label}</span>
    `;
    stat.addEventListener('click', () => {
      showToast(label + ' 목록 — 준비 중', { duration: 1800 });
    });
    statsWrap.appendChild(stat);
  });

  hero.appendChild(statsWrap);
  return { el: hero, avatarWrap };
}

/* ── Build: edit + badge buttons ──────────────────────────── */
function buildHeroBtns(profileUser, refs) {
  const wrap = document.createElement('div');
  wrap.className = 'profile-hero-btns';

  const editBtn = document.createElement('button');
  editBtn.className = 'profile-hero-btn';
  editBtn.textContent = '프로필 수정';
  editBtn.addEventListener('click', async () => {
    const { openProfileEditSheet } = await import('/app/components/profile-edit-sheet.js');
    openProfileEditSheet(profileUser, async (updatedUser) => {
      // topbar 닉네임 갱신
      if (refs.topbarNameEl && (updatedUser.nickname || updatedUser.displayName)) {
        refs.topbarNameEl.textContent = updatedUser.nickname || updatedUser.displayName;
      }
      // 아바타 갱신
      if (refs.avatarWrap && updatedUser.avatarUrl) {
        refs.avatarWrap.innerHTML = `<img src="${esc(updatedUser.avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
      }
      // secure storage 갱신 + in-memory sync
      Object.assign(profileUser, updatedUser);
      try {
        await setSecureItem('user', JSON.stringify(profileUser));
      } catch (_e) { /* ignore storage errors */ }
    });
  });

  const badgeBtn = document.createElement('button');
  badgeBtn.className = 'profile-hero-btn';
  badgeBtn.textContent = '힛 · 배지 현황';
  badgeBtn.addEventListener('click', () => {
    showToast('힛 · 배지 현황 — 준비 중', { duration: 1800 });
  });

  wrap.appendChild(editBtn);
  wrap.appendChild(badgeBtn);
  return wrap;
}

/* ── Build: PROF-3 interest pills ─────────────────────────── */
function buildInterests() {
  const wrap = document.createElement('div');
  wrap.className = 'profile-interests';

  const row = document.createElement('div');
  row.className = 'profile-interests__row';

  MOCK_INTERESTS.forEach((label, i) => {
    const pill = document.createElement('span');
    pill.className = 'profile-interest-pill' + (i === 0 ? ' is-active' : '');
    pill.textContent = label;
    pill.addEventListener('click', () => {
      row.querySelectorAll('.profile-interest-pill').forEach(p => p.classList.remove('is-active'));
      pill.classList.add('is-active');
    });
    row.appendChild(pill);
  });

  wrap.appendChild(row);
  return wrap;
}

/* ── Build: PROF-4 badges ──────────────────────────────────── */
function buildBadges() {
  const wrap = document.createElement('div');
  wrap.className = 'profile-badges';

  const row = document.createElement('div');
  row.className = 'profile-badges__row';

  MOCK_BADGES.forEach(({ label, icon, earned }) => {
    const card = document.createElement('div');
    card.className = 'badge-card ' + (earned ? 'is-earned' : 'is-locked');

    const circle = document.createElement('div');
    circle.className = 'badge-card__circle';
    circle.textContent = earned ? icon : '🔒';

    const lbl = document.createElement('span');
    lbl.className = 'badge-card__label';
    lbl.textContent = label;

    card.appendChild(circle);
    card.appendChild(lbl);
    card.addEventListener('click', () => {
      if (earned) {
        showToast(label + ' 배지 획득!', { variant: 'success', duration: 1800 });
      } else {
        showToast(label + ' — 아직 잠금 상태입니다', { duration: 1800 });
      }
    });

    row.appendChild(card);
  });

  wrap.appendChild(row);
  return wrap;
}

/* ── Build: PROF-5 delivery widget ────────────────────────── */
function buildDelivery() {
  const wrap = document.createElement('div');
  wrap.className = 'profile-delivery';

  const icon = document.createElement('span');
  icon.className = 'profile-delivery__icon';
  icon.textContent = '🚚';

  const text = document.createElement('span');
  text.className = 'profile-delivery__text';
  text.textContent = '평균 배송 시작일 집계중';

  const help = document.createElement('button');
  help.className = 'profile-delivery__help';
  help.setAttribute('aria-label', '도움말');
  help.innerHTML = svgQuestionCircle();
  help.addEventListener('click', () => {
    showToast('배송 시작일은 결제 후 발송까지의 평균 소요일입니다', { duration: 2400 });
  });

  wrap.appendChild(icon);
  wrap.appendChild(text);
  wrap.appendChild(help);
  return wrap;
}

/* ── Build: PROF-6 collector panel ────────────────────────── */
function buildCollectorPanel() {
  const panel = document.createElement('div');
  panel.className = 'profile-panel';
  panel.id = 'panel-buyer';

  /* 3-icon action row */
  const iconRow = document.createElement('div');
  iconRow.className = 'profile-icon-row';

  [
    { svg: svgClock(),   label: '리스팅 경매 현황',  action: () => showToast('리스팅 경매 현황 — 준비 중', { duration: 1800 }) },
    { svg: svgPlay(),    label: '상품 문의 채팅',    action: () => navigate('/app/dm') },
    { svg: svgPercent(), label: '가격 제안 내역',    action: () => showToast('가격 제안 내역 — 준비 중', { duration: 1800 }) },
  ].forEach(({ svg, label, action }) => {
    const btn = document.createElement('button');
    btn.className = 'profile-icon-action';
    btn.innerHTML = svg;
    btn.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
    btn.addEventListener('click', action);
    iconRow.appendChild(btn);
  });

  panel.appendChild(iconRow);

  /* Menu group */
  const menuGroup = document.createElement('div');
  menuGroup.className = 'profile-menu-group';

  [
    { icon: '📋', label: '딜러 위탁 신청하기', path: '/app/consignment/apply' },
    { icon: '🛍️', label: '주문 목록',       path: '/app/profile/orders' },
    { icon: '💳', label: '결제 수단 관리',   path: null },
    { icon: '🏠', label: '배송지 관리',      path: null },
    { icon: '📦', label: '박스 공구 현황',   path: null },
  ].forEach(({ icon, label, path }) => {
    const btn = document.createElement('button');
    btn.className = 'profile-menu-item';
    btn.innerHTML = `
      <span class="profile-menu-item__icon">${icon}</span>
      <span class="profile-menu-item__label">${esc(label)}</span>
    `;
    btn.addEventListener('click', () => go(path, label));
    menuGroup.appendChild(btn);
  });

  panel.appendChild(menuGroup);
  return panel;
}

/* ── Build: PROF-7 dealer panel ───────────────────────────── */
function buildDealerPanel() {
  const panel = document.createElement('div');
  panel.className = 'profile-panel';
  panel.id = 'panel-seller';

  /* Revenue header */
  const revenue = document.createElement('div');
  revenue.className = 'profile-revenue';

  const rlabel = document.createElement('span');
  rlabel.className = 'profile-revenue__label';
  rlabel.textContent = '최근 1년 수익:';

  const ramount = document.createElement('span');
  ramount.className = 'profile-revenue__amount';
  ramount.textContent = '0원';

  revenue.appendChild(rlabel);
  revenue.appendChild(ramount);
  panel.appendChild(revenue);

  /* Menu group */
  const menuGroup = document.createElement('div');
  menuGroup.className = 'profile-menu-group';

  [
    { icon: '📤', label: '미발송 구매자 모아보기',  path: '/app/seller/unshipped' },
    { icon: '📦', label: '판매내역',                path: '/app/seller/sales' },
    { icon: '💬', label: '상품 문의 채팅',           path: '/app/dm' },
    { icon: '🔍', label: '판매 대행 상품 찾기',     path: '/app/consignment/find' },
    { icon: '⏱️', label: '리스팅 경매 시작하기',   path: '/app/live-create' },
    { icon: '💸', label: '받은 가격 제안',          path: null },
    { icon: '✏️', label: '내 상품 수정 · 관리',    path: '/app/my-products' },
  ].forEach(({ icon, label, path }) => {
    const btn = document.createElement('button');
    btn.className = 'profile-menu-item';
    btn.innerHTML = `
      <span class="profile-menu-item__icon">${icon}</span>
      <span class="profile-menu-item__label">${esc(label)}</span>
    `;
    btn.addEventListener('click', () => go(path, label));
    menuGroup.appendChild(btn);
  });

  panel.appendChild(menuGroup);
  return panel;
}

/* ── Build: PROF-2 tabs ────────────────────────────────────── */
function buildTabs(collectorPanel, dealerPanel) {
  const tabBar = document.createElement('div');
  tabBar.className = 'profile-tabs';

  const tabs = [
    { id: 'buyer',  label: '구매자', panel: collectorPanel },
    { id: 'seller', label: '판매자', panel: dealerPanel    },
  ];

  function activate(tab) {
    tabs.forEach(t => {
      t.tabEl.classList.toggle('is-active', t === tab);
      t.panel.classList.toggle('is-active', t === tab);
    });
  }

  tabs.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'profile-tab';
    btn.textContent = t.label;
    btn.addEventListener('click', () => activate(t));
    t.tabEl = btn;
    tabBar.appendChild(btn);
  });

  /* default: collector active */
  activate(tabs[0]);

  return tabBar;
}

/* ── Build: LIVE floating bubble ──────────────────────────── */
function buildLiveBubble() {
  const bubble = document.createElement('div');
  bubble.className = 'profile-live-bubble';
  bubble.setAttribute('role', 'button');
  bubble.setAttribute('aria-label', '라이브 셀러 보기');
  bubble.setAttribute('tabindex', '0');

  const badge = document.createElement('span');
  badge.className = 'profile-live-bubble__badge';
  badge.textContent = 'LIVE';
  bubble.appendChild(badge);

  bubble.addEventListener('click', () => {
    showToast('라이브 셀러를 둘러보세요', { duration: 2000 });
  });
  return bubble;
}

/* ── Main export ───────────────────────────────────────────── */
export default async function load() {
  /* Auth guard */
  const stored = await getSecureItem('user');
  if (!stored) {
    await replace('/app/login');
    return document.createElement('div');
  }

  let user = null;
  try {
    user = JSON.parse(stored);
  } catch {
    await replace('/app/login');
    return document.createElement('div');
  }

  /* Fetch latest profile from server (delivery, nicknameChangedAt, etc.) */
  let freshProfile = null;
  try {
    freshProfile = await api.getUser(user.id);
  } catch {
    /* fallback to stored */
  }
  const profileUser = { ...user, ...(freshProfile || {}) };

  const nickname = profileUser.nickname || profileUser.displayName || profileUser.name || '사용자';

  /* Root page element */
  const page = document.createElement('div');
  page.className = 'profile-page';

  /* 1. Top nickname bar */
  const topbar = buildTopbar(nickname);
  page.appendChild(topbar.el);

  /* 2. PROF-1 Hero */
  const hero = buildHero(profileUser);
  page.appendChild(hero.el);
  page.appendChild(buildHeroBtns(profileUser, {
    topbarNameEl: topbar.nameEl,
    avatarWrap: hero.avatarWrap,
  }));

  /* 3. PROF-3 Interest pills */
  page.appendChild(buildInterests());

  /* 4. PROF-4 Badges */
  page.appendChild(buildBadges());

  /* 5. PROF-5 Delivery widget */
  page.appendChild(buildDelivery());

  /* 6+7. PROF-2 Tab toggle + PROF-6/7 panels */
  const collectorPanel = buildCollectorPanel();
  const dealerPanel    = buildDealerPanel();
  const tabBar         = buildTabs(collectorPanel, dealerPanel);

  page.appendChild(tabBar);
  page.appendChild(collectorPanel);
  page.appendChild(dealerPanel);

  /* 8. LIVE floating bubble */
  page.appendChild(buildLiveBubble());

  /* 9. Bottom tab bar */
  page.appendChild(createTabSpacer());
  page.appendChild(createBottomTabBar({ activeTab: 'profile' }));

  return page;
}
