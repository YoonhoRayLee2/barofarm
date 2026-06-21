// 하단 푸터 (데모 안내)
export function renderFooter() {
  const host = document.getElementById('mall-footer');
  if (!host) return;
  if (host.dataset.rendered === '1') return;
  host.innerHTML = `
    <div class="mall-footer-inner">
      <div><strong>바로팜몰</strong> · 신선한 농수축산물 직거래</div>
      <div>고객센터 1588-0000 · 평일 09:00 ~ 18:00</div>
      <p class="mall-footer-disclaim">
        본 페이지는 바로팜 사내 경진대회를 위한 데모이며,
        실제 상거래·결제·배송이 이루어지지 않습니다.
        모든 상품·이미지는 시연 목적의 가상 데이터입니다.
      </p>
    </div>
  `;
  host.dataset.rendered = '1';
}
