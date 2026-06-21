// 가격·텍스트 포맷 유틸
export function formatPrice(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '-';
  return n.toLocaleString('ko-KR') + '원';
}

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 재고 상태 라벨
export function stockLabel(stock) {
  if (stock <= 0) return { text: '품절', cls: 'mall-stock mall-stock--low' };
  if (stock < 20) return { text: `재고 ${stock}개 — 곧 마감`, cls: 'mall-stock mall-stock--low' };
  return { text: `재고 ${stock}개`, cls: 'mall-stock' };
}

// 카테고리 → URL slug (한글 그대로 encode)
export function catHref(category) {
  return `/mall/category/${encodeURIComponent(category)}`;
}

export function productHref(id) {
  return `/mall/product/${encodeURIComponent(id)}`;
}

// 데이터의 imageUrl 경로(`/mall-demo/images/…`)는 서버 정적 마운트(`/mall`)와
// 다르므로 클라이언트 측에서 한 번 정규화한다. 데이터 파일은 그대로 둔다.
export function resolveImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('/mall-demo/')) return url.replace('/mall-demo/', '/mall/');
  return url;
}
