/**
 * brand-assets.js — NH바로팜 brand asset generators (ESM)
 * Drop-in for the web app: import what you need and inject the returned
 * markup into empty image/avatar/placeholder slots. SVG-based, token-friendly.
 *
 * @module components/brand-assets
 */

/* Category → gradient / glyph / korean label */
const CAT_GRAD = {
  과일: ['#FFC9B0', '#FF8A65'], 채소: ['#C7E8AC', '#7BB85A'], 축산: ['#F2B6C0', '#D1708A'],
  수산: ['#AEDAEC', '#5B9BC4'], 곡물: ['#F0DBA0', '#C99A4F'], 가공: ['#DCCDB2', '#A8814E'],
  기타: ['#D7D2C2', '#9EA88A'],
};
const CAT_GLYPH = {
  과일: `<path d="M16 9c0-2 1.5-3.5 3.5-3.5M16 9c-3-2-7-1-8.5 1.5-2 3-1 8 2 11 1.5 1.5 3 2 4.5 2 1 0 1.5-.5 2-.5s1 .5 2 .5c1.5 0 3-.5 4.5-2 3-3 4-8 2-11C21 7 19 6 16 9z" fill="currentColor"/>`,
  채소: `<path d="M6 22c0-9 7-16 20-16-1 13-9 20-16 20-1.5 0-3-.5-4-1.5z" fill="currentColor"/>`,
  축산: `<path d="M9 8c4-3 11-3 14 0 3 3 3 9 0 12-2 2-5 2.5-7 4-2 1.5-5 1-6.5-1-1.5-2-1-4 .5-5C8 16 6 11 9 8z" fill="currentColor"/>`,
  수산: `<path d="M4 16c4-6 10-8 16-6 3 1 5 3 6 4l4-4v12l-4-4c-1 1-3 3-6 4-6 2-12 0-16-6z" fill="currentColor"/>`,
  곡물: `<path d="M16 4v24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 8c-3-1-6 0-7 3 3 1 6 0 7-3zm0 0c3-1 6 0 7 3-3 1-6 0-7-3zm0 6c-3-1-6 0-7 3 3 1 6 0 7-3zm0 0c3-1 6 0 7 3-3 1-6 0-7-3z" fill="currentColor"/>`,
  가공: `<rect x="9" y="11" width="14" height="13" rx="2.5" stroke="currentColor" stroke-width="2.2"/><path d="M12 11V9a4 4 0 018 0v2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
};
const CAT_COLOR = { 과일: '#E5564A', 채소: '#4FA84F', 축산: '#C84B5C', 수산: '#4A8FBF', 곡물: '#D6A84A', 가공: '#A8814E', 기타: '#7A6450' };

let _uid = 0;
const uid = () => 'bf' + (++_uid);

/**
 * Responsive branded thumbnail fallback (fills its container).
 * @param {string} category  한글 카테고리명
 * @param {{watermark?: boolean, label?: string}} [opts]
 * @returns {string} SVG markup
 */
export function thumbFallback(category = '기타', opts = {}) {
  const [a, b] = CAT_GRAD[category] || CAT_GRAD.기타;
  const glyph = CAT_GLYPH[category] || '';
  const id = uid();
  const wm = opts.watermark === false ? '' :
    `<text x="308" y="190" text-anchor="end" font-family="Pretendard,sans-serif" font-weight="800" font-size="13" fill="#fff" opacity="0.85">바로팜</text>`;
  return `<svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" fill="none" role="img" aria-label="${category} 이미지 준비중">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="320" y2="200" gradientUnits="userSpaceOnUse">
      <stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="320" height="200" fill="url(#${id})"/>
    <g transform="translate(128 68) scale(2)" style="color:#fff" opacity="0.5">${glyph}</g>
    ${wm}</svg>`;
}

/** Category icon (currentColor-driven). */
export function catIcon(category, size = 32, color) {
  const glyph = CAT_GLYPH[category] || '';
  const col = color || CAT_COLOR[category] || '#2D8A3E';
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" style="color:${col}">${glyph}</svg>`;
}

/* Deterministic avatar tint from name */
const AV_HUES = ['#5B8A3A', '#C06A3A', '#9C5A6C', '#3D6C9E', '#C99A3A', '#5A8A8A', '#7E5C9E', '#B0563A'];
export function avatarHue(name) {
  let h = 0; const s = String(name || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_HUES[h % AV_HUES.length];
}

/** Initial-on-tint avatar. Returns a <span> element string. */
export function avatar(name, size = 48) {
  const bg = avatarHue(name);
  const ch = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  const fs = Math.round(size * 0.42);
  return `<span class="bf-avatar" style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-family:'Pretendard',sans-serif;font-weight:800;font-size:${fs}px;flex:0 0 auto;user-select:none">${ch}</span>`;
}

/** Illustrated silhouette fallback (no name available). */
export function avatarPlaceholder(size = 48, bg = '#3D6C9E') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 50 50" role="img" aria-label="사용자">
    <circle cx="25" cy="25" r="25" fill="${bg}"/>
    <circle cx="25" cy="20" r="7.5" fill="#fff" opacity=".92"/>
    <path d="M11 41c2.5-7.5 8.5-11 14-11s11.5 3.5 14 11" fill="#fff" opacity=".92"/></svg>`;
}

/** Brand sprout mark (single tone). */
export function mark(size = 32, color = '#2D8A3E') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" role="img" aria-label="바로팜">
    <path d="M24 43 V26" stroke="${color}" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M24 31 C22 22.5 15.5 18 8 18 C8 26.5 14.5 32 24 31 Z" fill="${color}"/>
    <path d="M24.5 28 C26.5 18 33.5 12.5 42 12.5 C42 22.5 34.5 29 24.5 28 Z" fill="${color}"/>
    <circle cx="24" cy="24.5" r="2.4" fill="${color}"/></svg>`;
}
