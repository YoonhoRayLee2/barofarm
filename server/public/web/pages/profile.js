/**
 * Profile Page — T6-PROF (PROF-1~7)
 * Full redesign based on 프로필_구매자.png / 프로필_판매자.png references.
 *
 * Sections:
 *   PROF-1  Hero header (avatar + stats 3-up + edit buttons)
 *   PROF-2  Collector / Dealer tab toggle
 *   PROF-3  Interest pills
 *   PROF-4  Badge grid 6-up (활동 배지 — public-profile badges 기반)
 *   PROF-5  Average delivery widget
 *   PROF-6  Collector tab content (icon actions + menu)
 *   PROF-7  Dealer tab content (revenue + menu)
 *
 * @module pages/profile
 */

import { getSecureItem, setSecureItem } from '/app/scripts/native-bridge.js';
import { navigate, replace } from '/app/scripts/router.js';
import * as api from '/app/scripts/api.js';
import { personIconSVG } from '/app/scripts/person-icon.js';
import { createBottomTabBar, createTabSpacer } from '/app/components/bottom-tab-bar.js';
import { showToast } from '/app/components/toast.js';
import { createLiveCard } from '/app/components/live-card.js';
import { avatar as bfAvatar, avatarHue } from '/app/components/brand-assets.js';

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

const BAROFARM_CATEGORIES = ['과일', '채소', '수산', '축산', '곡물', '기타'];

const CAT_META = {
  '과일': { glyph: 'apple', hue: '#E5564A' },
  '채소': { glyph: 'leaf',  hue: '#4FA84F' },
  '축산': { glyph: 'meat',  hue: '#C84B5C' },
  '수산': { glyph: 'fish',  hue: '#4A8FBF' },
  '곡물': { glyph: 'grain', hue: '#D6A84A' },
  '기타': { glyph: 'cart',  hue: '#7BC470' },
};

function getCatGlyphSVG(kind, color, size = 32) {
  const g = {
    cart:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M5 8h4l3 13h13l3-9H10" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13" cy="26" r="2" fill="${color}"/><circle cx="23" cy="26" r="2" fill="${color}"/></svg>`,
    apple: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M16 9c0-2 1.5-3.5 3.5-3.5M16 9c-3-2-7-1-8.5 1.5-2 3-1 8 2 11 1.5 1.5 3 2 4.5 2 1 0 1.5-.5 2-.5s1 .5 2 .5c1.5 0 3-.5 4.5-2 3-3 4-8 2-11C21 7 19 6 16 9z" fill="${color}"/></svg>`,
    leaf:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M6 22c0-9 7-16 20-16-1 13-9 20-16 20-1.5 0-3-.5-4-1.5z" fill="${color}"/></svg>`,
    meat:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M9 8c4-3 11-3 14 0 3 3 3 9 0 12-2 2-5 2.5-7 4-2 1.5-5 1-6.5-1-1.5-2-1-4 .5-5C8 16 6 11 9 8z" fill="${color}"/></svg>`,
    fish:  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M4 16c4-6 10-8 16-6 3 1 5 3 6 4l4-4v12l-4-4c-1 1-3 3-6 4-6 2-12 0-16-6z" fill="${color}"/></svg>`,
    grain: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M16 4v24" stroke="${color}" stroke-width="2" stroke-linecap="round"/><path d="M16 8c-3-1-6 0-7 3 3 1 6 0 7-3zM16 8c3-1 6 0 7 3-3 1-6 0-7-3zM16 14c-3-1-6 0-7 3 3 1 6 0 7-3zM16 14c3-1 6 0 7 3-3 1-6 0-7-3zM16 20c-3-1-6 0-7 3 3 1 6 0 7-3zM16 20c3-1 6 0 7 3-3 1-6 0-7-3z" fill="${color}"/></svg>`,
  };
  return g[kind] ?? g.cart;
}

/* ── SVG helpers ───────────────────────────────────────────── */
function svgPersonSilhouette(size = 52) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="12" cy="8" r="4" fill="currentColor"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="currentColor"/>
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

function svgPlay() {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <polygon points="5 3 19 12 5 21 5 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
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
  avatar.style.background = avatarHue(nickname || '바로팜');
  avatar.style.overflow = 'hidden';
  avatar.innerHTML = `<span style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--font-body);font-weight:var(--fw-extrabold);font-size:var(--fs-base)">${String(nickname || '바').trim().charAt(0).toUpperCase()}</span>`;

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

  actions.appendChild(iconBtn(svgGear(), '설정', () => {
    navigate('/app/settings');
  }));

  bar.appendChild(avatar);
  bar.appendChild(name);
  bar.appendChild(actions);
  return { el: bar, nameEl: name };
}

/* ── Build: PROF-1 hero ────────────────────────────────────── */
function buildHero(user, stats) {
  const hero = document.createElement('div');
  hero.className = 'profile-hero';

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'profile-hero__avatar';
  avatarWrap.style.borderRadius = '50%';
  avatarWrap.style.overflow = 'hidden';
  if (user && user.avatarUrl) {
    avatarWrap.innerHTML = `<img src="${esc(user.avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
  } else {
    const nm = (user && (user.nickname || user.username || user.name)) || '바로팜';
    avatarWrap.style.background = avatarHue(nm);
    avatarWrap.innerHTML = `<span style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--font-body);font-weight:var(--fw-extrabold);font-size:30px">${esc(String(nm).trim().charAt(0).toUpperCase())}</span>`;
  }
  hero.appendChild(avatarWrap);

  const statsWrap = document.createElement('div');
  statsWrap.className = 'profile-stats';

  [
    { num: stats.sales,     label: '판매',   action: () => navigate('/app/seller/sales') },
    { num: stats.followers, label: '팔로워', action: () => openUserListSheet('팔로워', user, 'followers') },
    { num: stats.following, label: '팔로잉', action: () => openUserListSheet('팔로잉', user, 'following') },
  ].forEach(({ num, label, action }) => {
    const stat = document.createElement('div');
    stat.className = 'profile-stat';
    stat.setAttribute('role', 'button');
    stat.setAttribute('tabindex', '0');
    stat.innerHTML = `
      <span class="profile-stat__num">${num}</span>
      <span class="profile-stat__label">${label}</span>
    `;
    stat.addEventListener('click', action);
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

  wrap.appendChild(editBtn);
  return wrap;
}

/* ── Build: PROF-3 interest category circles ──────────────── */
function buildInterests(interests) {
  const wrap = document.createElement('div');
  wrap.className = 'profile-interests';

  const heading = document.createElement('div');
  heading.className = 'profile-interests__heading';
  heading.textContent = '관심 카테고리';
  wrap.appendChild(heading);

  const row = document.createElement('div');
  row.className = 'profile-interests__row';

  const list = Array.isArray(interests) ? interests
    : (interests ? String(interests).split(',').map(s => s.trim()).filter(Boolean) : []);

  if (list.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'profile-interest-empty';
    empty.textContent = '관심 카테고리를 설정해보세요';
    row.appendChild(empty);
  } else {
    list.forEach((label) => {
      const meta = CAT_META[label] ?? { glyph: 'cart', hue: '#7BC470' };
      const btn = document.createElement('div');
      btn.className = 'profile-cat-circle';
      btn.style.setProperty('--cat-hue', meta.hue);
      btn.innerHTML = `
        <div class="profile-cat-circle__inner">${getCatGlyphSVG(meta.glyph, meta.hue, 28)}</div>
        <span class="profile-cat-circle__label">${label}</span>
      `;
      row.appendChild(btn);
    });
  }

  wrap.appendChild(row);
  return wrap;
}

/* ── Build: PROF-4 badge grid (6-up) ──────────────────────── */
function buildBadges(badges) {
  const wrap = document.createElement('div');
  wrap.className = 'profile-badges';

  const heading = document.createElement('div');
  heading.className = 'profile-badges__heading';
  heading.textContent = '활동 배지';
  wrap.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'profile-badges__grid';

  const list = Array.isArray(badges) ? badges : [];
  list.forEach((b) => {
    const earned = !!b.earned;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'profile-badge' + (earned ? '' : ' profile-badge--locked');
    item.setAttribute('aria-label', `${b.label} 배지 조건 보기`);
    item.innerHTML = `
      <div class="profile-badge__emoji">${earned ? esc(b.emoji) : '🔒'}</div>
      <span class="profile-badge__label">${esc(b.label)}</span>
    `;
    item.addEventListener('click', () => showBadgeHelp(b));
    grid.appendChild(item);
  });

  wrap.appendChild(grid);

  const note = document.createElement('p');
  note.className = 'profile-badges__note';
  note.textContent = '배지를 누르면 획득 조건을 볼 수 있어요.';
  wrap.appendChild(note);

  return wrap;
}

/* ── 배지 조건 안내 시트 ──────────────────────────────────── */
function showBadgeHelp(badge) {
  const earned = !!badge.earned;
  const overlay = document.createElement('div');
  overlay.className = 'tier-help-overlay';
  overlay.innerHTML = `
    <div class="tier-help-sheet">
      <div class="tier-help-handle"></div>
      <div class="badge-help-emoji">${earned ? esc(badge.emoji) : '🔒'}</div>
      <h3 class="tier-help-title">${esc(badge.label)}</h3>
      <p class="badge-help-hint">${esc(badge.hint || '')}</p>
      ${badge.progress
        ? `<div class="badge-help-progress">진행도 <strong>${esc(badge.progress)}</strong></div>`
        : ''}
      <div class="badge-help-status ${earned ? 'is-earned' : ''}">
        ${earned ? '✓ 획득 완료' : '아직 획득 전이에요'}
      </div>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-open')));
}

/* ── 관심카테고리 설정 시트 ───────────────────────────────── */
function openInterestSheet(currentInterests, onSave) {
  const overlay = document.createElement('div');
  overlay.className = 'pi-overlay';
  overlay.dataset.theme = 'light';

  const sheet = document.createElement('div');
  sheet.className = 'pi-sheet';

  const selected = new Set(Array.isArray(currentInterests) ? currentInterests : []);

  sheet.innerHTML = `
    <div class="pi-sheet__header">
      <span class="pi-sheet__title">관심 카테고리</span>
      <button class="pi-sheet__close" aria-label="닫기">✕</button>
    </div>
    <p class="pi-sheet__desc">1개 이상 선택해주세요</p>
    <div class="pi-sheet__grid" id="pi-grid"></div>
    <button class="pi-sheet__save" id="pi-save">저장하기</button>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const grid = sheet.querySelector('#pi-grid');
  const saveBtn = sheet.querySelector('#pi-save');

  BAROFARM_CATEGORIES.forEach((cat) => {
    const meta = CAT_META[cat] ?? { glyph: 'cart', hue: '#7BC470' };
    const btn = document.createElement('button');
    btn.className = 'pi-cat-btn' + (selected.has(cat) ? ' is-selected' : '');
    btn.style.setProperty('--cat-hue', meta.hue);
    btn.innerHTML = `
      <div class="pi-cat-btn__circle">${getCatGlyphSVG(meta.glyph, selected.has(cat) ? '#fff' : meta.hue, 32)}</div>
      <span class="pi-cat-btn__label">${cat}</span>
    `;
    btn.addEventListener('click', () => {
      if (selected.has(cat)) {
        selected.delete(cat);
        btn.classList.remove('is-selected');
        btn.querySelector('.pi-cat-btn__circle').innerHTML = getCatGlyphSVG(meta.glyph, meta.hue, 32);
      } else {
        selected.add(cat);
        btn.classList.add('is-selected');
        btn.querySelector('.pi-cat-btn__circle').innerHTML = getCatGlyphSVG(meta.glyph, '#fff', 32);
      }
      saveBtn.disabled = selected.size === 0;
    });
    grid.appendChild(btn);
  });

  saveBtn.disabled = selected.size === 0;

  const close = () => {
    overlay.classList.remove('is-visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  sheet.querySelector('.pi-sheet__close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  saveBtn.addEventListener('click', async () => {
    if (selected.size === 0) { showToast('1개 이상 선택해주세요'); return; }
    saveBtn.disabled = true;
    await onSave([...selected]);
    close();
  });

  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-visible')));
}

/* ── 팔로워/팔로잉 목록 시트 ─────────────────────────────── */
async function openUserListSheet(title, user, type) {
  const overlay = document.createElement('div');
  overlay.className = 'pi-overlay';
  overlay.dataset.theme = 'light';

  const sheet = document.createElement('div');
  sheet.className = 'pi-sheet ul-sheet';
  sheet.innerHTML = `
    <div class="pi-sheet__header">
      <span class="pi-sheet__title">${esc(title)}</span>
      <button class="pi-sheet__close" aria-label="닫기">✕</button>
    </div>
    <div class="ul-list" id="ul-list">
      <div class="ul-loading">불러오는 중…</div>
    </div>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.remove('is-visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };
  sheet.querySelector('.pi-sheet__close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-visible')));

  const listEl = sheet.querySelector('#ul-list');
  try {
    const items = await fetch(`/api/users/${encodeURIComponent(user.id)}/${type}`)
      .then(r => r.json());

    if (!items.length) {
      listEl.innerHTML = `<div class="ul-empty">${title === '팔로워' ? '아직 팔로워가 없습니다' : '팔로우한 사용자가 없습니다'}</div>`;
      return;
    }

    listEl.innerHTML = '';
    items.forEach((u) => {
      const row = document.createElement('div');
      row.className = 'ul-row';
      row.innerHTML = `
        <div class="ul-avatar">${u.avatarUrl
          ? `<img src="${esc(u.avatarUrl)}" alt="" />`
          : personIconSVG(22)}
        </div>
        <span class="ul-name">${esc(u.nickname || '사용자')}</span>
      `;
      listEl.appendChild(row);
    });
  } catch {
    listEl.innerHTML = '<div class="ul-empty">목록을 불러오지 못했습니다</div>';
  }
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

/* ── Build: tier card (collector panel top) ───────────────── */
/* ── Tier help bottom sheet ────────────────────────────────── */
function showTierHelp(type) {
  const isBuyer = type === 'buyer';
  const title   = isBuyer ? '구매자 등급 안내' : '판매자 등급 안내';
  const rows = isBuyer
    ? [
        { emoji: '🌱', label: '새싹',   range: '0 ~ 9.9만원',     benefit: '할인 없음' },
        { emoji: '🌿', label: '농부',   range: '10만 ~ 49.9만원', benefit: '0.5% 할인' },
        { emoji: '🌾', label: '명예농부', range: '50만 ~ 199.9만원', benefit: '1.0% 할인' },
        { emoji: '🏆', label: '마스터',  range: '200만원 이상',    benefit: '1.5% 할인' },
      ]
    : [
        { emoji: '🌱', label: '새싹',   range: '0 ~ 49.9만원',    benefit: '수수료 4.9%' },
        { emoji: '🌿', label: '농부',   range: '50만 ~ 199.9만원', benefit: '수수료 3.9%' },
        { emoji: '🌾', label: '명예농부', range: '200만 ~ 499.9만원', benefit: '수수료 3.0%' },
        { emoji: '🏆', label: '마스터',  range: '500만원 이상',    benefit: '수수료 2.0%' },
      ];

  const overlay = document.createElement('div');
  overlay.className = 'tier-help-overlay';
  overlay.innerHTML = `
    <div class="tier-help-sheet">
      <div class="tier-help-handle"></div>
      <h3 class="tier-help-title">${esc(title)}</h3>
      <table class="tier-help-table">
        <thead>
          <tr>
            <th>등급</th>
            <th>${isBuyer ? '3개월 구매' : '3개월 판매'}</th>
            <th>${isBuyer ? '혜택' : '수수료'}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><span class="tier-help-badge">${r.emoji} ${esc(r.label)}</span></td>
              <td>${esc(r.range)}</td>
              <td class="tier-help-benefit">${esc(r.benefit)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="tier-help-note">최근 3개월 합산 기준으로 자동 산정됩니다.</p>
    </div>
  `;

  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-open')));
}

/* ── 정산계좌 1원 인증 시트 ──────────────────────────────── */
async function _authHeader() {
  try {
    const token = await api.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function showBankVerifySheet(userId, onVerified) {
  const BANKS = ['NH농협은행','국민은행','신한은행','하나은행','우리은행','기업은행','카카오뱅크','토스뱅크'];

  const overlay = document.createElement('div');
  overlay.className = 'bank-sheet-overlay';

  function renderStep1() {
    overlay.innerHTML = `
      <div class="bank-sheet">
        <div class="bank-sheet__handle"></div>
        <h3 class="bank-sheet__title">정산계좌 인증</h3>
        <div>
          <p class="bank-sheet__label">은행</p>
          <select id="bv-bank">
            <option value="">은행 선택</option>
            ${BANKS.map(b => `<option value="${b}">${b}</option>`).join('')}
          </select>
        </div>
        <div>
          <p class="bank-sheet__label">예금주명</p>
          <input type="text" id="bv-holder" placeholder="홍길동" />
        </div>
        <div>
          <p class="bank-sheet__label">계좌번호</p>
          <input type="text" id="bv-account" placeholder="- 없이 입력" inputmode="numeric" />
        </div>
        <button class="bank-sheet__btn" id="bv-req-btn">1원 인증 요청</button>
      </div>
    `;
    overlay.querySelector('#bv-req-btn').addEventListener('click', async () => {
      const bankName      = overlay.querySelector('#bv-bank').value;
      const holderName    = overlay.querySelector('#bv-holder').value.trim();
      const accountNumber = overlay.querySelector('#bv-account').value.replace(/-/g, '').trim();
      if (!bankName || !holderName || !accountNumber) {
        showToast('모든 항목을 입력해주세요'); return;
      }
      const btn = overlay.querySelector('#bv-req-btn');
      btn.disabled = true;
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(userId)}/bank/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await _authHeader()) },
          body: JSON.stringify({ bankName, accountNumber, holderName }),
        });
        if (!res.ok) {
          let e = {};
          try { e = await res.json(); } catch {}
          showToast(e.error || '요청 실패'); btn.disabled = false; return;
        }
        renderStep2(bankName);
      } catch { showToast('네트워크 오류'); btn.disabled = false; }
    });
  }

  function renderStep2(bankName) {
    overlay.innerHTML = `
      <div class="bank-sheet">
        <div class="bank-sheet__handle"></div>
        <h3 class="bank-sheet__title">인증번호 입력</h3>
        <p class="bank-sheet__desc">방금 송금된 1원의<br>입금자명 숫자 4자리를 입력해주세요</p>
        <input type="text" id="bv-code" placeholder="0000" maxlength="4" inputmode="numeric" style="text-align:center;font-size:24px;font-weight:var(--fw-extrabold);letter-spacing:8px" />
        <button class="bank-sheet__btn" id="bv-confirm-btn">인증 확인</button>
      </div>
    `;
    overlay.querySelector('#bv-confirm-btn').addEventListener('click', async () => {
      const code = overlay.querySelector('#bv-code').value.trim();
      if (code.length !== 4) { showToast('4자리 숫자를 입력해주세요'); return; }
      const btn = overlay.querySelector('#bv-confirm-btn');
      btn.disabled = true;
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(userId)}/bank/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await _authHeader()) },
          body: JSON.stringify({ code }),
        });
        let data = {};
        try { data = await res.json(); } catch {}
        if (!res.ok) { showToast(data.error || '인증 실패'); btn.disabled = false; return; }
        overlay.remove();
        showToast(data.isNhMember ? '🏦 NH농협 조합원 인증 완료!' : '✅ 계좌 인증 완료!', { variant: 'success', duration: 2500 });
        onVerified?.({ isNhMember: data.isNhMember, bankName });
      } catch { showToast('네트워크 오류'); btn.disabled = false; }
    });
  }

  renderStep1();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-open')));
}

function buildTierCard() {
  const wrap = document.createElement('section');
  wrap.className = 'profile-tier';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="profile-tier__top">
      <div class="profile-tier__name">
        <span class="profile-tier__emoji" data-field="emoji">🌱</span>
        <span class="profile-tier__label" data-field="label">—</span>
      </div>
      <button class="profile-tier__help" data-tier-help="buyer" aria-label="등급 안내">ⓘ</button>
      <div class="profile-tier__progress" data-field="progress">
        <span class="profile-tier__progress-label">
          <span data-field="next-label">다음 등급까지</span>
          <span data-field="next-pct">0%</span>
        </span>
        <div class="profile-tier__bar">
          <div class="profile-tier__bar-fill" data-field="bar-fill"></div>
        </div>
      </div>
      <div class="profile-tier__master" data-field="master" hidden>최고 등급 달성 🏆</div>
    </div>
    <div class="profile-tier__row">
      <span class="profile-tier__row-label">최근 3개월 구매</span>
      <span class="profile-tier__row-value" data-field="spend">—</span>
    </div>
    <div class="profile-tier__row">
      <span class="profile-tier__row-label">내 혜택</span>
      <span class="profile-tier__row-value" data-field="benefit">—</span>
    </div>
  `;
  return wrap;
}

async function loadTierCard(userId, wrap) {
  try {
    const t = await api.getUserTier(userId);
    if (!t || !t.tier) return;
    wrap.dataset.tier = t.tier;
    wrap.querySelector('[data-field="emoji"]').textContent = t.emoji || '🌱';
    wrap.querySelector('[data-field="label"]').textContent = t.label || '—';

    const isMaster = t.tier === 'master' || !t.nextTier;
    const progressWrap = wrap.querySelector('[data-field="progress"]');
    const masterWrap   = wrap.querySelector('[data-field="master"]');
    if (isMaster) {
      progressWrap.hidden = true;
      masterWrap.hidden = false;
    } else {
      progressWrap.hidden = false;
      masterWrap.hidden = true;
      const pct = Math.max(0, Math.min(100, Number(t.progressPct || 0)));
      wrap.querySelector('[data-field="next-pct"]').textContent = `${Math.round(pct)}%`;
      wrap.querySelector('[data-field="bar-fill"]').style.width = `${pct}%`;
    }

    wrap.querySelector('[data-field="spend"]').textContent =
      `${Number(t.totalSpend || 0).toLocaleString('ko-KR')}원`;

    const discount = Number(t.buyerDiscountRate || 0);
    wrap.querySelector('[data-field="benefit"]').textContent =
      discount > 0 ? `구매 ${(discount * 100).toFixed(1)}% 자동 할인` : '기본 등급';

    wrap.hidden = false;
  } catch { /* hide on error */ }
}

function showCarbonHelp() {
  const overlay = document.createElement('div');
  overlay.className = 'tier-help-overlay';
  overlay.innerHTML = `
    <div class="tier-help-sheet">
      <div class="tier-help-handle"></div>
      <h3 class="tier-help-title">🌍 절감량은 어떻게 계산되나요?</h3>
      <p class="tier-help-note" style="margin-bottom:16px">일반 마트 농산물은 <b>농장 → 도매시장 → 마트 → 우리집</b>까지 여러 번 트럭으로 옮겨집니다. 바로팜 산지직송은 <b>농장 → 우리집</b>으로 곧장 와서 그만큼 트럭 이동이 줄고, 줄어든 거리만큼 배기가스(CO₂)도 줄어듭니다.</p>

      <div class="carbon-help-steps">
        <div class="carbon-help-step">
          <span class="carbon-help-step__num">1</span>
          <div class="carbon-help-step__body">
            <b>이동 거리를 비교해요</b>
            <span>판매 농장과 우리집 배송지 사이 거리를, 일반 마트 유통 경로(약 800km)와 비교합니다.</span>
          </div>
        </div>
        <div class="carbon-help-step">
          <span class="carbon-help-step__num">2</span>
          <div class="carbon-help-step__body">
            <b>줄어든 거리를 구해요</b>
            <span>마트 경로보다 짧아진 만큼이 '절감 거리'예요. 농장이 가까울수록 더 많이 절감됩니다.</span>
          </div>
        </div>
        <div class="carbon-help-step">
          <span class="carbon-help-step__num">3</span>
          <div class="carbon-help-step__body">
            <b>CO₂로 환산해요</b>
            <span>줄어든 거리 × 상품 무게(평균 3kg) × 배출 계수(1km·1kg당 0.166g)로 절감된 CO₂를 계산합니다.</span>
          </div>
        </div>
      </div>

      <div class="carbon-help-example">
        <span class="carbon-help-example__label">예시</span>
        <span class="carbon-help-example__text">우리집과 가까운 농장에서 받으면 마트 경로보다 <b>약 500km</b>를 덜 달린 셈 → CO₂ <b>약 250g</b> 절감</span>
      </div>

      <p class="tier-help-note" style="margin-top:14px">* 직선 거리 기반 추정치예요. 실제 배출량과는 차이가 있을 수 있습니다.</p>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-open')));
}

/* ── Build: carbon stats card (collector panel top) ───────── */
function buildCarbonStats() {
  const wrap = document.createElement('section');
  wrap.className = 'profile-carbon';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="profile-carbon__hero">
      <div class="profile-carbon__head">
        <span class="profile-carbon__title">🌍 나의 탄소발자국 절감</span>
        <button class="profile-carbon__help" data-carbon-help aria-label="탄소발자국 절감량 계산 방법">?</button>
      </div>
      <div class="profile-carbon__big">
        <span class="profile-carbon__big-value" data-field="km">—</span>
        <span class="profile-carbon__big-unit">단축</span>
      </div>
      <p class="profile-carbon__trip" data-field="avg">—</p>
    </div>
    <div class="profile-carbon__foot">
      <div class="profile-carbon__stat">
        <span class="profile-carbon__stat-label">CO₂ 절감</span>
        <span class="profile-carbon__stat-value" data-field="co2">—</span>
      </div>
      <div class="profile-carbon__divider"></div>
      <div class="profile-carbon__stat">
        <span class="profile-carbon__stat-label">산지직송</span>
        <span class="profile-carbon__stat-value" data-field="orders">—</span>
      </div>
    </div>
    <button class="profile-carbon__forest-btn" data-forest-btn>🌳 내 숲 보기</button>
  `;
  wrap.querySelector('[data-forest-btn]').addEventListener('click', () => {
    import('/app/scripts/router.js').then(m => m.navigate('/app/my-forest'));
  });
  return wrap;
}

async function loadCarbonStats(userId, wrap) {
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(userId)}/carbon-summary`);
    if (!res.ok) return;
    const s = await res.json();
    if (!s || !s.orderCount) return;
    const km = Number(s.totalSavedKm || 0);
    const co2 = Number(s.totalSavedCo2g || 0);
    const trips = Math.max(1, Math.round(km / 325));
    wrap.querySelector('[data-field="km"]').innerHTML =
      `${km.toLocaleString('ko-KR')}<small>km</small>`;
    wrap.querySelector('[data-field="co2"]').textContent =
      `${co2.toLocaleString('ko-KR')}g`;
    wrap.querySelector('[data-field="avg"]').textContent =
      `🚗 승용차로 서울↔부산 약 ${trips}회 안 달린 셈이에요`;
    wrap.querySelector('[data-field="orders"]').textContent =
      `주문 ${s.orderCount}건`;
    wrap.hidden = false;
  } catch { /* hide on error */ }
}

/* ── Build: PROF-6 collector panel ────────────────────────── */
function buildCollectorPanel(profileUser, scrollEl, isMe) {
  const panel = document.createElement('div');
  panel.className = 'profile-panel';
  panel.id = 'panel-buyer';

  /* 3-icon action row */
  const iconRow = document.createElement('div');
  iconRow.className = 'profile-icon-row';

  [
    { svg: svgPlay(),    label: '상품 문의 채팅',    action: () => navigate('/app/dm') },
  ].forEach(({ svg, label, action }) => {
    const btn = document.createElement('button');
    btn.className = 'profile-icon-action';
    btn.innerHTML = svg;
    const badge = document.createElement('span');
    badge.className = 'profile-icon-action__badge';
    badge.setAttribute('aria-hidden', 'true');
    btn.appendChild(badge);
    btn.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
    btn.addEventListener('click', action);
    iconRow.appendChild(btn);
  });

  if (isMe) {
    (async () => {
      try {
        const res = await fetch(`/api/chat-rooms/unread-total?userId=${encodeURIComponent(profileUser.id)}&type=dm`);
        if (!res.ok) return;
        const { total } = await res.json();
        const count = Number(total) || 0;
        const badgeEl = iconRow.querySelector('.profile-icon-action__badge');
        if (badgeEl && count > 0) {
          badgeEl.textContent = count > 99 ? '99+' : String(count);
          badgeEl.classList.add('is-visible');
        }
      } catch { /* non-critical */ }
    })();
  }

  panel.appendChild(iconRow);

  /* Menu group */
  const menuGroup = document.createElement('div');
  menuGroup.className = 'profile-menu-group';

  [
    { icon: '❤️', label: '위시리스트',        path: '/app/wishlist' },
    { icon: '⭐', label: '관심카테고리 설정', path: '__interests__' },
    { icon: '📋', label: '딜러 위탁 신청하기', path: '/app/consignment/apply' },
    { icon: '🛍️', label: '주문 목록',       path: '/app/profile/orders' },
    { icon: '🛒', label: '공동구매 참여 현황', path: '/app/group-deals?mine=true' },
    { icon: '🏠', label: '배송지 관리',      path: '/app/delivery-addresses' },
    { icon: '💳', label: '결제수단 관리',    path: '/app/payment-methods' },
    { icon: '🚪', label: '로그아웃',        path: '__logout__' },
  ].forEach(({ icon, label, path }) => {
    const btn = document.createElement('button');
    btn.className = 'profile-menu-item';
    btn.innerHTML = `
      <span class="profile-menu-item__icon">${icon}</span>
      <span class="profile-menu-item__label">${esc(label)}</span>
    `;
    btn.addEventListener('click', () => {
      if (path === '__interests__') {
        openInterestSheet(profileUser.interests || [], async (newInterests) => {
          try {
            await api.updateProfile(profileUser.id, { interests: newInterests.join(',') });
            profileUser.interests = newInterests;
            try { await setSecureItem('user', JSON.stringify(profileUser)); } catch (_e) { /* ignore */ }
            const interestsEl = scrollEl.querySelector('.profile-interests');
            if (interestsEl) interestsEl.replaceWith(buildInterests(newInterests));
            showToast('관심 카테고리가 저장됐습니다', { variant: 'success', duration: 2000 });
          } catch {
            showToast('저장에 실패했습니다');
          }
        });
      } else if (path === '__logout__') {
        Promise.all([
          setSecureItem('user', ''),
          setSecureItem('barofarm_token', ''),
        ]).then(() => {
          showToast('로그아웃되었습니다', { variant: 'success', duration: 1500 });
          return replace('/app/login');
        }).catch(() => {
          showToast('로그아웃에 실패했습니다');
        });
      } else {
        go(path, label);
      }
    });
    menuGroup.appendChild(btn);
  });

  panel.appendChild(menuGroup);

  /* Tier card — own profile only */
  if (isMe) {
    const tierCard = buildTierCard();
    panel.appendChild(tierCard);
    loadTierCard(profileUser.id, tierCard);
  }

  /* Carbon stats */
  const carbonCard = buildCarbonStats();
  panel.appendChild(carbonCard);
  loadCarbonStats(profileUser.id, carbonCard);

  /* Delivery widget (buyer-only) */
  panel.appendChild(buildDelivery());

  return panel;
}

/* ── Build: PROF-7 dealer panel ───────────────────────────── */
function buildDealerPanel(profileUser, isMe) {
  const panel = document.createElement('div');
  panel.className = 'profile-panel';
  panel.id = 'panel-seller';

  /* Seller tier / fee card */
  const feeCard = document.createElement('div');
  feeCard.className = 'profile-tier profile-tier--seller';
  feeCard.dataset.tier = 'sprout';
  feeCard.innerHTML = `
    <div class="profile-tier__top">
      <div class="profile-tier__name">
        <span class="profile-tier__emoji" data-field="s-emoji">🌱</span>
        <span class="profile-tier__label" data-field="s-label">—</span>
      </div>
      <button class="profile-tier__help" data-tier-help="seller" aria-label="등급 안내">ⓘ</button>
      <div class="profile-tier__progress" data-field="s-progress">
        <span class="profile-tier__progress-label">
          <span>다음 등급까지</span>
          <span data-field="s-next-pct">0%</span>
        </span>
        <div class="profile-tier__bar">
          <div class="profile-tier__bar-fill" data-field="s-bar-fill"></div>
        </div>
      </div>
      <div class="profile-tier__master" data-field="s-master" hidden>최저 수수료 달성 🏆</div>
    </div>
    <div class="profile-tier__row">
      <span class="profile-tier__row-label">최근 3개월 판매</span>
      <span class="profile-tier__row-value" data-field="s-sales">—</span>
    </div>
    <div class="profile-tier__row">
      <span class="profile-tier__row-label">현재 수수료율</span>
      <span class="profile-tier__row-value" data-field="s-fee">—</span>
    </div>
  `;
  /* Load seller-side tier info */
  (async () => {
    try {
      const t = await api.getSellerTier(profileUser.id);
      if (!t?.tier) return;
      feeCard.dataset.tier = t.tier;
      feeCard.querySelector('[data-field="s-emoji"]').textContent = t.emoji || '🌱';
      feeCard.querySelector('[data-field="s-label"]').textContent = t.label || '—';

      const isMaster = !t.nextTier;
      const progressWrap = feeCard.querySelector('[data-field="s-progress"]');
      const masterWrap   = feeCard.querySelector('[data-field="s-master"]');
      if (isMaster) {
        progressWrap.hidden = true;
        masterWrap.hidden = false;
      } else {
        progressWrap.hidden = false;
        masterWrap.hidden = true;
        const pct = Math.max(0, Math.min(100, Number(t.progressPct || 0)));
        feeCard.querySelector('[data-field="s-next-pct"]').textContent = `${Math.round(pct)}%`;
        feeCard.querySelector('[data-field="s-bar-fill"]').style.width = `${pct}%`;
      }

      feeCard.querySelector('[data-field="s-sales"]').textContent =
        `${Number(t.totalSales || 0).toLocaleString('ko-KR')}원`;

      const feeRate = Number(t.sellerFeeRate || 0);
      feeCard.querySelector('[data-field="s-fee"]').textContent =
        `${(feeRate * 100).toFixed(1)}%`;
    } catch {}
  })();

  /* Settlement account / NH badge card (본인 프로필일 때만) */
  if (isMe) {
    const bankCard = document.createElement('div');
    const isVerified = !!profileUser.bankVerifiedAt;
    const isNh = !!profileUser.isNhMember;

    bankCard.className = `profile-bank-card profile-bank-card--${isVerified ? 'verified' : 'unverified'}`;
    bankCard.innerHTML = isVerified
      ? `${isNh ? '<span class="nh-badge">🏦 조합원 인증</span>' : '<span class="profile-bank-card__label">✅ 계좌 인증 완료</span>'}
         <span class="profile-bank-card__account">${esc(profileUser.bankName || '')} ${esc(profileUser.bankAccount || '')}</span>`
      : `<span class="profile-bank-card__label">정산계좌 미등록</span>
         <button class="profile-bank-card__cta" id="bank-verify-cta">계좌 인증하기</button>`;

    if (!isVerified) {
      bankCard.querySelector('#bank-verify-cta').addEventListener('click', () => {
        showBankVerifySheet(profileUser.id, ({ isNhMember, bankName }) => {
          bankCard.className = 'profile-bank-card profile-bank-card--verified';
          bankCard.innerHTML = isNhMember
            ? `<span class="nh-badge">🏦 조합원 인증</span><span class="profile-bank-card__account">${esc(bankName)} ****????</span>`
            : `<span class="profile-bank-card__label">✅ 계좌 인증 완료</span><span class="profile-bank-card__account">${esc(bankName)}</span>`;
          // hero/topbar 뱃지 갱신
          const heroBadge = document.querySelector('.profile-hero__nh-badge');
          if (heroBadge && isNhMember) heroBadge.hidden = false;
        });
      });
    }
    panel.appendChild(bankCard);
  }

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

  /* 조합원 인증마크 — 판매자 탭에서만, 계좌 인증 완료 시에만 */
  const isVerified = profileUser.isNhMember === true && !!profileUser.bankVerifiedAt;
  if (isVerified) {
    const badge = document.createElement('div');
    badge.className = 'profile-seller-nh-badge';
    badge.innerHTML = '<span class="nh-badge">🏦 NH농협 조합원 인증</span><span class="profile-seller-nh-badge__desc">인증된 농협 조합원 판매자입니다</span>';
    panel.appendChild(badge);
  }

  /* Menu group */
  const menuGroup = document.createElement('div');
  menuGroup.className = 'profile-menu-group';

  [
    { icon: '📤', label: '미발송 구매자 모아보기',  path: '/app/seller/unshipped' },
    { icon: '➕', label: '공동판매 등록',             path: '/app/group-deals/create' },
    { icon: '🤝', label: '공동판매 관리',           path: '/app/group-deals?mine=true' },
    { icon: '🚚', label: '배송비 정책',             path: '/app/seller/shipping-policy' },
    { icon: '📦', label: '판매내역',                path: '/app/seller/sales' },
    { icon: '💬', label: '상품 문의 채팅',           path: '/app/dm' },
    { icon: '🔍', label: '판매 대행 상품 찾기',     path: '/app/consignment/find' },
    { icon: '⏱️', label: '리스팅 경매 시작하기',   path: '/app/live-create' },
    { icon: '✏️', label: '내 상품 수정 · 관리',    path: '/app/my-products' },
    { icon: '🚪', label: '로그아웃',                path: '__logout__' },
  ].forEach(({ icon, label, path }) => {
    const btn = document.createElement('button');
    btn.className = 'profile-menu-item';
    btn.innerHTML = `
      <span class="profile-menu-item__icon">${icon}</span>
      <span class="profile-menu-item__label">${esc(label)}</span>
    `;
    btn.addEventListener('click', () => {
      if (path === '__logout__') {
        Promise.all([
          setSecureItem('user', ''),
          setSecureItem('barofarm_token', ''),
        ]).then(() => {
          showToast('로그아웃되었습니다', { variant: 'success', duration: 1500 });
          return replace('/app/login');
        }).catch(() => {
          showToast('로그아웃에 실패했습니다');
        });
      } else {
        go(path, label);
      }
    });
    menuGroup.appendChild(btn);
  });

  panel.appendChild(menuGroup);
  panel.appendChild(feeCard);
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
function buildLiveBubble(currentUser) {
  const bubble = document.createElement('div');
  bubble.className = 'profile-live-bubble';
  bubble.setAttribute('role', 'button');
  bubble.setAttribute('aria-label', '지금 경매 보기');
  bubble.setAttribute('tabindex', '0');

  const badge = document.createElement('span');
  badge.className = 'profile-live-bubble__badge';
  badge.textContent = 'LIVE';
  bubble.appendChild(badge);

  bubble.addEventListener('click', () => openLiveListModal(currentUser));
  return bubble;
}

/* ── 지금 경매 모달 ─────────────────────────────────────────── */
function openLiveListModal(currentUser) {
  const overlay = document.createElement('div');
  overlay.className = 'llm-overlay';
  overlay.dataset.theme = 'light';

  const sheet = document.createElement('div');
  sheet.className = 'llm-sheet';
  sheet.innerHTML = `
    <div class="llm-header">
      <span class="llm-title">지금 경매</span>
      <button class="llm-close" aria-label="닫기">✕</button>
    </div>
    <div class="llm-list" id="llm-list"></div>
  `;
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const listEl = sheet.querySelector('#llm-list');

  const close = () => {
    overlay.classList.remove('is-visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  };

  sheet.querySelector('.llm-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // 스켈레톤 렌더
  const skelGrid = document.createElement('div');
  skelGrid.className = 'llm-grid';
  for (let i = 0; i < 4; i++) {
    const card = createLiveCard({ id: `skel-${i}`, title: ' ', sellerId: ' ', viewerCount: 0, currentAuction: null });
    card.classList.add('is-skeleton');
    card.removeAttribute('role');
    card.removeAttribute('tabindex');
    skelGrid.appendChild(card);
  }
  listEl.innerHTML = '';
  listEl.appendChild(skelGrid);

  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-visible')));

  api.getLives().then((lives) => {
    const live = (lives || []).filter((l) => !l.status || l.status === 'live');
    listEl.innerHTML = '';

    if (!live.length) {
      listEl.innerHTML = `
        <div class="llm-empty">
          <svg viewBox="0 0 80 80" fill="none" class="llm-empty__svg">
            <rect x="12" y="22" width="56" height="36" rx="6" stroke="currentColor" stroke-width="2.5" fill="none" opacity="0.3"/>
            <circle cx="40" cy="40" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.5"/>
            <circle cx="40" cy="40" r="5" fill="currentColor" opacity="0.4"/>
          </svg>
          <span>진행 중인 라이브가 없습니다</span>
        </div>`;
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'llm-grid';
    live.forEach((l) => {
      const card = createLiveCard(l, {
        currentUserId: currentUser ? String(currentUser.id) : null,
        onClick: (live) => {
          close();
          if (currentUser && live.sellerId === String(currentUser.id)) {
            navigate(`/app/live-seller/${live.id}`);
          } else {
            navigate(`/app/live-buyer/${live.id}`);
          }
        },
      });
      grid.appendChild(card);
    });
    listEl.appendChild(grid);
  }).catch(() => {
    listEl.innerHTML = `<div class="llm-empty"><span>목록을 불러오지 못했습니다</span></div>`;
  });
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

  // 판매/팔로워/팔로잉 실수치 조회
  let profileStats = { sales: 0, followers: 0, following: 0 };
  let profileBadges = [];
  try {
    const s = await api.getPublicProfile(profileUser.id, profileUser.id);
    profileStats = { sales: s.salesCount ?? 0, followers: s.followerCount ?? 0, following: s.followingCount ?? 0 };
    profileBadges = Array.isArray(s.badges) ? s.badges : [];
  } catch { /* 실패 시 0으로 유지 */ }

  const nickname = profileUser.nickname || profileUser.displayName || profileUser.name || '사용자';

  /* Root page element */
  const page = document.createElement('div');
  page.className = 'profile-page';
  page.dataset.theme = 'light';

  /* 1. Top nickname bar (sticky) */
  const topbar = buildTopbar(nickname);
  page.appendChild(topbar.el);

  /* Scroll wrapper — contains all content between topbar and tab bar */
  const scrollEl = document.createElement('div');
  scrollEl.className = 'profile-scroll';

  /* 2. PROF-1 Hero */
  const hero = buildHero(profileUser, profileStats);
  scrollEl.appendChild(hero.el);
  scrollEl.appendChild(buildHeroBtns(profileUser, {
    topbarNameEl: topbar.nameEl,
    avatarWrap: hero.avatarWrap,
  }));

  /* 2-b. Stats card (낙찰/경매중/찜/포인트) */
  const statsCard = document.createElement('div');
  statsCard.className = 'profile-stats-card';
  statsCard.innerHTML = `
    <div class="profile-stat"><div class="profile-stat__num" id="ps-won">—</div><div class="profile-stat__label">낙찰</div></div>
    <div class="profile-stat profile-stat--divider"><div class="profile-stat__num" id="ps-bidding">—</div><div class="profile-stat__label">경매중</div></div>
    <div class="profile-stat profile-stat--divider"><div class="profile-stat__num" id="ps-fav">—</div><div class="profile-stat__label">찜</div></div>
    <div class="profile-stat profile-stat--divider"><div class="profile-stat__num" id="ps-pts">0P</div><div class="profile-stat__label">포인트</div></div>
  `;
  scrollEl.appendChild(statsCard);

  // 비동기 조회 (실패 시 — 유지)
  ;(async () => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(profileUser.id)}/bids`);
      if (!res.ok) return;
      const bids = await res.json();
      const list = Array.isArray(bids) ? bids : (Array.isArray(bids?.bids) ? bids.bids : []);
      const wonEl = statsCard.querySelector('#ps-won');
      const biddingEl = statsCard.querySelector('#ps-bidding');
      if (wonEl) wonEl.textContent = String(list.filter(b => b.status === 'won' || b.status === '낙찰').length);
      if (biddingEl) biddingEl.textContent = String(list.filter(b => b.status === 'active' || b.status === 'live' || b.status === '진행중').length);
    } catch { /* — 유지 */ }

    try {
      const favEl = statsCard.querySelector('#ps-fav');
      if (favEl && profileUser.favoritesCount != null) favEl.textContent = String(profileUser.favoritesCount);
    } catch { /* — 유지 */ }
  })();

  /* 3. PROF-3 Interest pills */
  const interests = Array.isArray(profileUser.interests)
    ? profileUser.interests
    : (profileUser.interests ? String(profileUser.interests).split(',').filter(Boolean) : []);
  scrollEl.appendChild(buildInterests(interests));

  /* 4. PROF-4 Badge grid (6-up) */
  scrollEl.appendChild(buildBadges(profileBadges));

  /* 6+7. PROF-2 Tab toggle + PROF-6/7 panels */
  const isMe = String(profileUser.id) === String(user.id);
  const collectorPanel = buildCollectorPanel(profileUser, scrollEl, isMe);
  const dealerPanel    = buildDealerPanel(profileUser, isMe);
  const tabBar         = buildTabs(collectorPanel, dealerPanel);

  scrollEl.appendChild(tabBar);
  scrollEl.appendChild(collectorPanel);
  scrollEl.appendChild(dealerPanel);

  /* 8. LIVE floating bubble */
  scrollEl.appendChild(buildLiveBubble(user));

  /* Tab spacer inside scroll area so content isn't hidden behind tab bar */
  scrollEl.appendChild(createTabSpacer());

  page.appendChild(scrollEl);

  /* Help button delegation */
  page.addEventListener('click', e => {
    if (e.target.closest('[data-tier-help]'))   showTierHelp(e.target.closest('[data-tier-help]').dataset.tierHelp);
    if (e.target.closest('[data-carbon-help]')) showCarbonHelp();
  });

  /* 9. Bottom tab bar */
  page.appendChild(createBottomTabBar({ activeTab: 'profile' }));

  return page;
}
