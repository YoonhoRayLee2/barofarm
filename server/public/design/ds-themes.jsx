// ds-themes.jsx
// 3 directions for barofarm design system

const THEMES = {
  // A — Soil & Sun: 따뜻한 베이지 + 테라코타. 정성스러운 농가 느낌.
  soilSun: {
    id: 'soilSun',
    name: 'Soil & Sun',
    ko: '흙과 햇빛',
    tagline: '정성스레 길러낸 — 따뜻한 산지의 온도',
    light: {
      bg:        '#FAF6EE',
      bgAlt:     '#F1EADB',
      surface:   '#FFFFFF',
      surfaceAlt:'#F6EFDF',
      ink:       '#2A1F12',
      inkSoft:   '#5A4A36',
      inkMute:   '#8C7A60',
      line:      '#E4D9C0',
      accent:    '#C25A2C',     // terracotta
      accentSoft:'#F0C9B0',
      accentInk: '#FFFFFF',
      success:   '#5C7A2E',
      warning:   '#C28A1E',
      danger:    '#A33A1F',
      live:      '#C25A2C',
    },
    dark: {
      bg:        '#1B140C',
      bgAlt:     '#241A0F',
      surface:   '#2A1F12',
      surfaceAlt:'#34281A',
      ink:       '#F4ECDA',
      inkSoft:   '#C9B594',
      inkMute:   '#8A7A5C',
      line:      '#3D2F1E',
      accent:    '#E47C4E',
      accentSoft:'#5C2E18',
      accentInk: '#1B140C',
      success:   '#9CB46A',
      warning:   '#E0B266',
      danger:    '#E47C4E',
      live:      '#E47C4E',
    },
    fonts: {
      display: "'Gowun Dodum', 'Pretendard', sans-serif",
      body:    "'Pretendard', -apple-system, system-ui, sans-serif",
      mono:    "'IBM Plex Mono', monospace",
    },
    radius: 14,
    voice: {
      title: '정성을 담은 말',
      lines: [
        '오늘 새벽, 김씨네 밭에서 따왔어요.',
        '지금 7명이 이 옥수수에 마음을 두고 있어요.',
        '경매 마감까지 2분, 천천히 결정하셔도 돼요.',
      ],
      avoid: ['초특가', '폭탄세일', '지금 안 사면 손해'],
    },
  },

  // B — Fresh Field: 크림 + 올리브 그린. 자연주의, 깔끔한 모던.
  freshField: {
    id: 'freshField',
    name: 'Fresh Field',
    ko: '싱그러운 들판',
    tagline: '들판에서 식탁까지 — 가장 짧은 거리',
    light: {
      bg:        '#F4F2EA',
      bgAlt:     '#EAE7D8',
      surface:   '#FFFFFF',
      surfaceAlt:'#EFEDDF',
      ink:       '#1F2417',
      inkSoft:   '#475040',
      inkMute:   '#7E8675',
      line:      '#DCDCC9',
      accent:    '#5B7A35',     // olive green
      accentSoft:'#C9D8A8',
      accentInk: '#FFFFFF',
      success:   '#5B7A35',
      warning:   '#B58A2B',
      danger:    '#B23A2C',
      live:      '#B23A2C',
    },
    dark: {
      bg:        '#11140D',
      bgAlt:     '#171B12',
      surface:   '#1F2417',
      surfaceAlt:'#272E1D',
      ink:       '#EEF0E4',
      inkSoft:   '#B8BFA6',
      inkMute:   '#7E8675',
      line:      '#2E3525',
      accent:    '#A8C766',
      accentSoft:'#2E3D17',
      accentInk: '#11140D',
      success:   '#A8C766',
      warning:   '#D9B560',
      danger:    '#E47A66',
      live:      '#E47A66',
    },
    fonts: {
      display: "'Pretendard', sans-serif",
      body:    "'Pretendard', -apple-system, system-ui, sans-serif",
      mono:    "'JetBrains Mono', monospace",
    },
    radius: 8,
    voice: {
      title: '담백한 말',
      lines: [
        '오늘 수확 · 강원 평창 · 해발 700m',
        '입찰 12명 · 현재 14,200원',
        '내일 오전 도착 예정',
      ],
      avoid: ['초특가', '꿀잼', '겁나 신선'],
    },
  },

  // C — Auction Hall: 차콜 + 머스타드. 라이브 경매에 어울리는 강한 대비.
  auctionHall: {
    id: 'auctionHall',
    name: 'Auction Hall',
    ko: '경매장',
    tagline: '실시간 입찰 — 산지의 가격이 살아 움직인다',
    light: {
      bg:        '#F2EFE8',
      bgAlt:     '#E5E1D5',
      surface:   '#FFFFFF',
      surfaceAlt:'#1B1A17',
      ink:       '#1B1A17',
      inkSoft:   '#3D3A33',
      inkMute:   '#807B6E',
      line:      '#D4CFC0',
      accent:    '#D4A017',     // mustard
      accentSoft:'#F2DD93',
      accentInk: '#1B1A17',
      success:   '#4F7A2E',
      warning:   '#D4A017',
      danger:    '#C8341A',
      live:      '#C8341A',
    },
    dark: {
      bg:        '#0E0D0B',
      bgAlt:     '#161513',
      surface:   '#1B1A17',
      surfaceAlt:'#26241F',
      ink:       '#F2EFE8',
      inkSoft:   '#BFB8A6',
      inkMute:   '#807B6E',
      line:      '#2F2C26',
      accent:    '#E8B83A',
      accentSoft:'#3D3015',
      accentInk: '#0E0D0B',
      success:   '#A0C36A',
      warning:   '#E8B83A',
      danger:    '#E85E47',
      live:      '#E85E47',
    },
    fonts: {
      display: "'Pretendard', sans-serif",
      body:    "'Pretendard', -apple-system, system-ui, sans-serif",
      mono:    "'JetBrains Mono', 'IBM Plex Mono', monospace",
    },
    radius: 4,
    voice: {
      title: '간결한 말',
      lines: [
        'LIVE · 강원 평창 옥수수 · 12명 입찰 중',
        '현재가 14,200원 · 즉시낙찰 18,000원',
        '01:42 남음',
      ],
      avoid: ['따뜻한 농부의 미소', '정성껏 길렀어요 (라이브에선 빠르게)'],
    },
  },
};

// Spacing scale (consistent across themes)
const SPACING = [0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80];
const TYPE_SCALE = [
  { name: 'Display L', size: 56, weight: 700, lh: 1.05, tracking: '-0.02em' },
  { name: 'Display M', size: 40, weight: 700, lh: 1.1,  tracking: '-0.02em' },
  { name: 'Heading L', size: 28, weight: 700, lh: 1.2,  tracking: '-0.01em' },
  { name: 'Heading M', size: 22, weight: 600, lh: 1.25, tracking: '-0.01em' },
  { name: 'Heading S', size: 18, weight: 600, lh: 1.3,  tracking: '0' },
  { name: 'Body L',    size: 16, weight: 400, lh: 1.55, tracking: '0' },
  { name: 'Body M',    size: 14, weight: 400, lh: 1.55, tracking: '0' },
  { name: 'Caption',   size: 12, weight: 500, lh: 1.4,  tracking: '0.02em' },
  { name: 'Label',     size: 11, weight: 600, lh: 1.2,  tracking: '0.08em' },
];

// Helper: get effective palette (with tweaks applied)
function paletteFor(theme, dark, overrides = {}) {
  const base = dark ? theme.dark : theme.light;
  return { ...base, ...overrides };
}

window.THEMES = THEMES;
window.SPACING = SPACING;
window.TYPE_SCALE = TYPE_SCALE;
window.paletteFor = paletteFor;
