export function formatPrice(price) {
  if (price == null) return '—';
  return Number(price).toLocaleString('ko-KR') + '원';
}
export function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(iso); }
}
export function formatYmd(iso) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  } catch { return String(iso); }
}
// 월·일·시·분만 (연도 없음) — e.g. "5월 16일 14:30"
export function formatDateShort(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(iso); }
}
// 월·일만 — e.g. "5월 16일"
export function formatDateDay(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  } catch { return String(iso); }
}
// 숫자만 (단위 없음) — e.g. "12,000"
export function formatPriceRaw(price) {
  const n = Number(price);
  return isNaN(n) ? '0' : n.toLocaleString('ko-KR');
}
