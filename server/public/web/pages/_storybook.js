/**
 * _storybook.js — Fresh Field Design System Component Catalogue
 * URL: /app/_storybook (direct access only, not linked from nav)
 *
 * Renders all 11 components and a token palette visualisation.
 *
 * @module pages/_storybook
 */

import { createLiveCard } from '/app/components/live-card.js';
import { createTimer } from '/app/components/timer.js';
import { createSlideBid } from '/app/components/slide-bid.js';
import { createBidChips } from '/app/components/bid-chips.js';
import { createBlindBid } from '/app/components/blind-bid.js';
import { createBuyButton } from '/app/components/buy-button.js';
import { createChatOverlay } from '/app/components/chat-overlay.js';
import { showConfirmDialog } from '/app/components/confirm-dialog.js';
import { openFabModal } from '/app/components/fab-modal.js';
import { showToast } from '/app/components/toast.js';
import { createBottomTabBar } from '/app/components/bottom-tab-bar.js';

export default async function storybookPage() {
  const root = document.createElement('div');
  root.className = 'sb';
  root.style.cssText = [
    'font-family: var(--font-body)',
    'color: var(--color-ink)',
    'background: var(--color-bg)',
    'min-height: 100vh',
    'padding: var(--space-4)',
    'padding-bottom: 120px',
    'max-width: 600px',
    'margin: 0 auto',
  ].join(';');

  // ── Inject storybook base styles ──────────────────────────────
  if (!document.getElementById('sb-base-styles')) {
    const style = document.createElement('style');
    style.id = 'sb-base-styles';
    style.textContent = `
      .sb-section {
        margin-bottom: var(--space-7);
      }
      .sb-section-title {
        font-family: var(--font-display);
        font-size: var(--fs-2xl);
        font-weight: 700;
        color: var(--color-ink);
        border-bottom: 2px solid var(--color-accent);
        padding-bottom: var(--space-2);
        margin-bottom: var(--space-5);
      }
      .sb-component-row {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
      }
      .sb-item {
        background: var(--color-surface);
        border: 1px solid var(--color-line);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }
      .sb-item-label {
        font-family: var(--font-body);
        font-size: var(--fs-xs);
        font-weight: 600;
        color: var(--color-ink-mute);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: var(--space-2) var(--space-3);
        background: var(--color-surface-alt);
        border-bottom: 1px solid var(--color-line);
      }
      .sb-item-body {
        padding: var(--space-4);
        position: relative;
      }
      .sb-item-desc {
        font-size: var(--fs-sm);
        color: var(--color-ink-soft);
        margin-top: var(--space-3);
      }

      /* Token palette */
      .sb-palette-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: var(--space-3);
      }
      .sb-chip {
        border-radius: var(--radius-md);
        overflow: hidden;
        border: 1px solid var(--color-line);
      }
      .sb-chip__swatch {
        height: 48px;
      }
      .sb-chip__info {
        background: var(--color-surface-alt);
        padding: var(--space-2) var(--space-2);
      }
      .sb-chip__name {
        font-size: var(--fs-xs);
        font-weight: 600;
        color: var(--color-ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sb-chip__value {
        font-size: var(--fs-xs);
        color: var(--color-ink-mute);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 2px;
      }

      /* Space scale */
      .sb-space-grid {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      .sb-space-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      .sb-space-bar {
        height: 20px;
        background: var(--color-accent);
        border-radius: var(--radius-sm);
        opacity: 0.7;
      }
      .sb-space-label {
        font-size: var(--fs-xs);
        color: var(--color-ink-soft);
        min-width: 70px;
      }

      /* Type scale */
      .sb-type-grid {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .sb-type-row {
        display: flex;
        align-items: baseline;
        gap: var(--space-3);
      }
      .sb-type-meta {
        font-size: var(--fs-xs);
        color: var(--color-ink-mute);
        min-width: 90px;
      }

      /* Chat preview area */
      .sb-chat-area {
        position: relative;
        height: 180px;
        background: var(--color-bg);
        border-radius: var(--radius-md);
        overflow: hidden;
      }

      /* Trigger button */
      .sb-trigger-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-4);
        background: var(--color-surface-alt);
        color: var(--color-ink);
        border: 1px solid var(--color-line);
        border-radius: var(--radius-md);
        font-family: var(--font-body);
        font-size: var(--fs-sm);
        font-weight: 600;
        cursor: pointer;
        transition: background var(--dur-fast) var(--ease-in-out);
      }
      .sb-trigger-btn:hover {
        background: var(--color-accent-tint);
        border-color: var(--color-accent);
      }
    `;
    document.head.appendChild(style);
  }

  // ── Page header ───────────────────────────────────────────────
  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom: var(--space-7)';
  header.innerHTML = `
    <h1 style="font-family:var(--font-display);font-size:var(--fs-3xl);font-weight:700;color:var(--color-accent);margin-bottom:var(--space-2)">
      Fresh Field Storybook
    </h1>
    <p style="font-size:var(--fs-base);color:var(--color-ink-soft);line-height:var(--lh-normal)">
      바로팜 디자인 시스템 컴포넌트 카탈로그 — URL 직접 접근 전용
      <br><span style="font-size:var(--fs-xs);color:var(--color-ink-mute)">/app/_storybook</span>
    </p>
  `;
  root.appendChild(header);

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: Token Palette
  // ═══════════════════════════════════════════════════════════════
  root.appendChild(makeSection('Token Palette', buildTokenPalette()));

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: Cards
  // ═══════════════════════════════════════════════════════════════
  const liveCardDemo = createLiveCard(
    {
      id: 'demo-live-1',
      title: '제주 감귤 직송 경매 라이브',
      sellerId: 'farmer_jeju',
      viewerCount: 142,
      currentAuction: {
        productName: '한라봉 5kg',
        currentPrice: 35000,
      },
    },
    {
      currentUserId: 'me',
      favorited: false,
      onClick: () => showToast('LiveCard 클릭됨', { variant: 'info' }),
      onToggleFavorite: (id, wasFav) => {
        showToast(wasFav ? '관심 해제' : '관심 추가', { variant: 'success' });
      },
    }
  );
  liveCardDemo.style.maxWidth = '340px';

  const liveCardSkeleton = createLiveCard({ id: 'sk-1', title: '...', sellerId: '...', viewerCount: 0 });
  liveCardSkeleton.classList.add('is-skeleton');
  liveCardSkeleton.style.maxWidth = '340px';

  const liveCardMyBroadcast = createLiveCard(
    {
      id: 'demo-mine',
      title: '내 라이브 방송 — 딸기 경매',
      sellerId: 'me',
      viewerCount: 54,
      currentAuction: null,
    },
    { currentUserId: 'me', onClick: () => {} }
  );
  liveCardMyBroadcast.style.maxWidth = '340px';

  root.appendChild(makeSection('Cards', makeRows([
    makeItem('LiveCard — 기본', liveCardDemo, '라이브 방송 카드. 뷰어 수, 현재 경매 가격, 즐겨찾기 버튼 포함.'),
    makeItem('LiveCard — 스켈레톤', liveCardSkeleton, 'is-skeleton 클래스 적용 시 shimmer 애니메이션.'),
    makeItem('LiveCard — 내 방송', liveCardMyBroadcast, '현재 사용자 == sellerId 인 경우 "내 방송" 뱃지 표시.'),
  ])));

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: Bidding Controls
  // ═══════════════════════════════════════════════════════════════
  const { el: timerEl, update: updateTimer } = createTimer({ initialRemaining: 30 });
  // Simulate countdown for demo
  let _remaining = 30;
  const _timerInterval = setInterval(() => {
    _remaining = Math.max(0, _remaining - 1);
    updateTimer(_remaining);
    if (_remaining === 0) clearInterval(_timerInterval);
  }, 1000);

  const { el: slideBidEl } = createSlideBid({
    amount: 35000,
    onConfirm: () => showToast('입찰 확정!', { variant: 'success' }),
  });

  const { el: bidChipsEl } = createBidChips({
    steps: [500, 1000, 2000, 5000, 10000],
    onSelect: (amt) => showToast(`+${amt.toLocaleString()}원 선택`, { variant: 'info' }),
  });

  const { el: blindBidEl } = createBlindBid({
    onSubmit: (price) => showToast(`비공개 입찰: ${price.toLocaleString()}원`, { variant: 'success' }),
  });

  root.appendChild(makeSection('Bidding Controls', makeRows([
    makeItem('Timer', timerEl, '남은 시간 카운트다운. 10초 이하 warn, 3초 이하 danger+shake.'),
    makeItem('Slide-to-Bid', slideBidEl, '핸들을 오른쪽으로 70% 드래그하면 입찰 확정.'),
    makeItem('Bid Chips', bidChipsEl, '입찰 단위 금액 칩 행. 스크롤 가능.'),
    makeItem('Blind Bid', blindBidEl, '비공개 입찰 모드 입력 UI.'),
  ])));

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: Buttons
  // ═══════════════════════════════════════════════════════════════
  const buyButtonEl = createBuyButton({
    productName: '딸기 2kg',
    productSub: '논산 설향',
    price: 18000,
    stockTotal: 30,
    stockSold: 22,
    onBuy: () => showToast('구매 완료!', { variant: 'success' }),
  });
  buyButtonEl.tick(145); // 2:25 remaining

  const buyButtonSoldOut = createBuyButton({
    productName: '사과 5kg (품절)',
    price: 25000,
    stockTotal: 10,
    stockSold: 10,
    onBuy: () => {},
  });

  root.appendChild(makeSection('Buttons', makeRows([
    makeItem('BuyButton — 재고 있음', buyButtonEl, 'FCFS 즉시구매 카드. 재고 잔여/타이머 표시.'),
    makeItem('BuyButton — 매진', buyButtonSoldOut, '재고 소진 시 disabled 상태.'),
  ])));

  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: Overlays & Modals
  // ═══════════════════════════════════════════════════════════════
  const chatAreaEl = document.createElement('div');
  chatAreaEl.className = 'sb-chat-area';
  const chatOverlay = createChatOverlay();
  chatAreaEl.appendChild(chatOverlay.el);

  const pushChatBtn = document.createElement('button');
  pushChatBtn.className = 'sb-trigger-btn';
  pushChatBtn.textContent = '채팅 메시지 추가';
  let _chatIdx = 0;
  const chatMessages = [
    { userId: 'u1', userName: '홍길동', message: '신선해 보여요!' },
    { userId: 'u2', userName: '김철수', message: '얼마예요?' },
    { userId: 'u3', userName: '이영희', message: '입찰했어요 ^^' },
    { userId: 'u4', userName: '박민수', message: '맛있겠다!' },
  ];
  pushChatBtn.addEventListener('click', () => {
    chatOverlay.push(chatMessages[_chatIdx % chatMessages.length]);
    _chatIdx++;
  });

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'sb-trigger-btn';
  confirmBtn.textContent = '확인 다이얼로그 열기';
  confirmBtn.addEventListener('click', async () => {
    const ok = await showConfirmDialog({
      title: '경매 종료',
      message: '현재 경매를 종료하시겠습니까?',
      confirmLabel: '종료',
      cancelLabel: '취소',
      danger: true,
    });
    showToast(ok ? '확인 선택됨' : '취소됨', { variant: ok ? 'success' : 'info' });
  });

  const fabBtn = document.createElement('button');
  fabBtn.className = 'sb-trigger-btn';
  fabBtn.textContent = 'FAB Modal 열기';
  fabBtn.addEventListener('click', () => openFabModal());

  const toastBtnsEl = document.createElement('div');
  toastBtnsEl.style.cssText = 'display:flex;gap:var(--space-2);flex-wrap:wrap';
  ['success', 'error', 'info'].forEach((variant) => {
    const b = document.createElement('button');
    b.className = 'sb-trigger-btn';
    b.textContent = `Toast — ${variant}`;
    b.addEventListener('click', () => showToast(`${variant} 토스트 메시지 예시입니다.`, { variant }));
    toastBtnsEl.appendChild(b);
  });

  root.appendChild(makeSection('Overlays & Modals', makeRows([
    makeItem('Chat Overlay', (() => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-3)';
      wrap.appendChild(chatAreaEl);
      wrap.appendChild(pushChatBtn);
      return wrap;
    })(), '비블로킹 채팅 오버레이. pointer-events:none으로 상호작용 방해 없음.'),
    makeItem('Confirm Dialog', confirmBtn, 'Promise 기반 확인 다이얼로그.'),
    makeItem('FAB Modal (Bottom Sheet)', fabBtn, '하단 시트 모달. 라이브/샘플 경매 옵션 포함.'),
    makeItem('Toast', toastBtnsEl, '슬라이드업 토스트. success/error/info 3가지 variant.'),
  ])));

  // ═══════════════════════════════════════════════════════════════
  // SECTION 6: Navigation
  // ═══════════════════════════════════════════════════════════════
  const tabBarEl = createBottomTabBar({ activeTab: 'home' });
  // Override fixed positioning for storybook display
  tabBarEl.style.cssText = 'position:relative;bottom:auto;left:auto;transform:none;border-radius:var(--radius-lg);overflow:hidden;';

  root.appendChild(makeSection('Navigation', makeRows([
    makeItem('Bottom Tab Bar', tabBarEl, '5탭 하단 내비게이션. FAB 중앙 버튼 포함.'),
  ])));

  // ═══════════════════════════════════════════════════════════════
  // SECTION 7: Spacing Scale
  // ═══════════════════════════════════════════════════════════════
  root.appendChild(makeSection('Spacing Scale', buildSpacingScale()));

  // ═══════════════════════════════════════════════════════════════
  // SECTION 8: Type Scale
  // ═══════════════════════════════════════════════════════════════
  root.appendChild(makeSection('Type Scale', buildTypeScale()));

  return root;
}

/* ── Helpers ──────────────────────────────────────────────────── */

function makeSection(title, content) {
  const section = document.createElement('div');
  section.className = 'sb-section';

  const h2 = document.createElement('h2');
  h2.className = 'sb-section-title';
  h2.textContent = title;
  section.appendChild(h2);
  section.appendChild(content);

  return section;
}

function makeRows(items) {
  const row = document.createElement('div');
  row.className = 'sb-component-row';
  items.forEach(i => row.appendChild(i));
  return row;
}

function makeItem(label, content, desc) {
  const item = document.createElement('div');
  item.className = 'sb-item';

  const labelEl = document.createElement('div');
  labelEl.className = 'sb-item-label';
  labelEl.textContent = label;
  item.appendChild(labelEl);

  const body = document.createElement('div');
  body.className = 'sb-item-body';

  if (content instanceof HTMLElement) {
    body.appendChild(content);
  } else {
    body.appendChild(document.createTextNode(String(content)));
  }

  if (desc) {
    const d = document.createElement('p');
    d.className = 'sb-item-desc';
    d.textContent = desc;
    body.appendChild(d);
  }

  item.appendChild(body);
  return item;
}

/* ── Token Palette builder ────────────────────────────────────── */

function buildTokenPalette() {
  const wrap = document.createElement('div');

  // Color chips
  const colorTokens = [
    { name: '--color-bg',            value: '#0E1A12' },
    { name: '--color-bg-alt',        value: '#142220' },
    { name: '--color-surface',       value: '#1A2A22' },
    { name: '--color-surface-alt',   value: '#22372D' },
    { name: '--color-ink',           value: '#EDF1E2' },
    { name: '--color-ink-soft',      value: '#B7C4A6' },
    { name: '--color-ink-mute',      value: '#7E8675' },
    { name: '--color-line',          value: '#28392F' },
    { name: '--color-accent',        value: '#7AA53F' },
    { name: '--color-accent-soft',   value: '#5B7A35' },
    { name: '--color-cta',           value: '#D6473A' },
    { name: '--color-warn',          value: '#D4A017' },
    { name: '--color-danger',        value: '#D6473A' },
    { name: '--color-info',          value: '#5C8BAE' },
    { name: '--color-success',       value: '#7AA53F' },
    { name: '--color-overlay-dim',   value: 'black 55%' },
    { name: '--color-accent-tint',   value: 'accent 12%' },
    { name: '--color-bg-overlay',    value: 'bg 82%' },
    { name: '--color-surface-tint',  value: 'surface 40%' },
    { name: '--color-skeleton-base', value: '#1A2A22' },
    { name: '--color-skeleton-shine','value': '#22372D' },
  ];

  const h3 = document.createElement('h3');
  h3.style.cssText = 'font-size:var(--fs-base);color:var(--color-ink-soft);margin-bottom:var(--space-3);font-weight:600';
  h3.textContent = 'Colours';
  wrap.appendChild(h3);

  const grid = document.createElement('div');
  grid.className = 'sb-palette-grid';
  colorTokens.forEach(({ name, value }) => {
    const chip = document.createElement('div');
    chip.className = 'sb-chip';

    const swatch = document.createElement('div');
    swatch.className = 'sb-chip__swatch';
    swatch.style.background = `var(${name})`;

    const info = document.createElement('div');
    info.className = 'sb-chip__info';
    info.innerHTML = `
      <div class="sb-chip__name">${name}</div>
      <div class="sb-chip__value">${value}</div>
    `;

    chip.appendChild(swatch);
    chip.appendChild(info);
    grid.appendChild(chip);
  });
  wrap.appendChild(grid);

  return wrap;
}

/* ── Spacing scale builder ────────────────────────────────────── */

function buildSpacingScale() {
  const tokens = [
    { name: '--space-0', px: '0' },
    { name: '--space-1', px: '4px' },
    { name: '--space-2', px: '8px' },
    { name: '--space-3', px: '12px' },
    { name: '--space-4', px: '16px' },
    { name: '--space-5', px: '24px' },
    { name: '--space-6', px: '32px' },
    { name: '--space-7', px: '48px' },
  ];

  const grid = document.createElement('div');
  grid.className = 'sb-space-grid';

  tokens.forEach(({ name, px }) => {
    const row = document.createElement('div');
    row.className = 'sb-space-row';

    const label = document.createElement('span');
    label.className = 'sb-space-label';
    label.textContent = `${name} (${px})`;

    const bar = document.createElement('div');
    bar.className = 'sb-space-bar';
    bar.style.width = px === '0' ? '2px' : `var(${name})`;
    bar.style.minWidth = '2px';

    row.appendChild(label);
    row.appendChild(bar);
    grid.appendChild(row);
  });

  return grid;
}

/* ── Type scale builder ──────────────────────────────────────── */

function buildTypeScale() {
  const tokens = [
    { name: '--fs-xs',   px: '11px', sample: 'Aa 가나다 — xs' },
    { name: '--fs-sm',   px: '12px', sample: 'Aa 가나다 — sm' },
    { name: '--fs-base', px: '14px', sample: 'Aa 가나다 — base' },
    { name: '--fs-lg',   px: '16px', sample: 'Aa 가나다 — lg' },
    { name: '--fs-xl',   px: '18px', sample: 'Aa 가나다 — xl' },
    { name: '--fs-2xl',  px: '22px', sample: 'Aa 가나다 — 2xl' },
    { name: '--fs-3xl',  px: '28px', sample: 'Aa 가나다 — 3xl' },
  ];

  const grid = document.createElement('div');
  grid.className = 'sb-type-grid';

  tokens.forEach(({ name, px, sample }) => {
    const row = document.createElement('div');
    row.className = 'sb-type-row';

    const meta = document.createElement('span');
    meta.className = 'sb-type-meta';
    meta.textContent = `${name} (${px})`;

    const text = document.createElement('span');
    text.style.cssText = `font-size:var(${name});color:var(--color-ink);line-height:1.2`;
    text.textContent = sample;

    row.appendChild(meta);
    row.appendChild(text);
    grid.appendChild(row);
  });

  return grid;
}
