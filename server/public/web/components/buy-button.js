/**
 * Buy Button Component — FCFS mode
 * 라이브 즉시구매 상품 카드 + 빨간 CTA + 내부 타이머.
 *
 * @module components/buy-button
 */

const _cssId = 'comp-css-buy-button';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/buy-button.css';
  document.head.appendChild(link);
}

/**
 * @param {{
 *   productName?: string,
 *   productSub?: string,
 *   price?: number,
 *   stockTotal: number,
 *   stockSold: number,
 *   thumbUrl?: string,
 *   onBuy: () => void
 * }} options
 */
export function createBuyButton({ productName = '', productSub = '', price = 0, stockTotal, stockSold, thumbUrl = '', onBuy }) {
  const el = document.createElement('div');
  el.className = 'buy-button';
  el.innerHTML = `
    <div class="buy-button__tag-row">
      <span class="buy-button__tag">선착순 구매</span>
      <span class="buy-button__remaining" data-role="remaining">0개 남음</span>
    </div>
    <div class="buy-button__product">
      <div class="buy-button__thumb" data-role="thumb">📦</div>
      <div class="buy-button__product-info">
        <div class="buy-button__product-name" data-role="name"></div>
        <div class="buy-button__product-sub" data-role="sub"></div>
      </div>
      <div class="buy-button__price" data-role="price">0원</div>
    </div>
    <button type="button" class="buy-button__cta" data-role="cta">
      <span class="buy-button__cta-arrow">→</span>
      <span class="buy-button__cta-label" data-role="cta-label">즉시 구매하기</span>
      <span class="buy-button__cta-timer" data-role="cta-timer">--:--</span>
    </button>
  `;

  const remainingEl = el.querySelector('[data-role="remaining"]');
  const thumbEl = el.querySelector('[data-role="thumb"]');
  const nameEl = el.querySelector('[data-role="name"]');
  const subEl = el.querySelector('[data-role="sub"]');
  const priceEl = el.querySelector('[data-role="price"]');
  const ctaEl = el.querySelector('[data-role="cta"]');
  const ctaLabelEl = el.querySelector('[data-role="cta-label"]');
  const ctaTimerEl = el.querySelector('[data-role="cta-timer"]');

  function setProduct({ productName: pn, productSub: ps, price: pr, thumbUrl: th }) {
    if (pn != null) nameEl.textContent = pn;
    if (ps != null) {
      subEl.textContent = ps ? `+ ${ps}` : '';
      subEl.style.display = ps ? '' : 'none';
    }
    if (pr != null) priceEl.textContent = `${Number(pr).toLocaleString()}원`;
    if (th != null && th) {
      thumbEl.textContent = '';
      thumbEl.style.backgroundImage = `url(${th})`;
      thumbEl.classList.add('buy-button__thumb--image');
    }
  }

  function renderStock(total, sold) {
    const remaining = Math.max(0, total - sold);
    remainingEl.textContent = `${remaining}개 남음`;
    remainingEl.classList.toggle('buy-button__remaining--sold-out', remaining === 0);
  }

  function disable(label = '매진') {
    ctaEl.disabled = true;
    ctaLabelEl.textContent = label;
    ctaEl.classList.add('buy-button__cta--disabled');
  }

  function enable() {
    ctaEl.disabled = false;
    ctaLabelEl.textContent = '즉시 구매하기';
    ctaEl.classList.remove('buy-button__cta--disabled');
  }

  function update(total, sold) {
    renderStock(total, sold);
    const remaining = Math.max(0, total - sold);
    if (remaining === 0) disable('매진');
    else enable();
  }

  /** Update internal MM:SS countdown. */
  function tick(seconds) {
    if (seconds == null || seconds < 0) {
      ctaTimerEl.textContent = '--:--';
      ctaTimerEl.classList.remove('buy-button__cta-timer--urgent');
      return;
    }
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    ctaTimerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    ctaTimerEl.classList.toggle('buy-button__cta-timer--urgent', seconds <= 10);
  }

  ctaEl.addEventListener('click', () => {
    if (!ctaEl.disabled && typeof onBuy === 'function') onBuy();
  });

  setProduct({ productName, productSub, price, thumbUrl });
  update(stockTotal, stockSold);

  function destroy() { el.remove(); }

  return { el, update, setProduct, tick, disable, enable, destroy };
}
