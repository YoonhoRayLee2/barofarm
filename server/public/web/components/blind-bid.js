/**
 * Blind Bid Component
 * - 참여자 수 실시간 표시
 * - 입찰 후 즉시 재입찰 가능 (잠금 없음)
 * - n번째 입찰 금액 > n-1번째 입찰 금액 검증
 *
 * @module components/blind-bid
 */

const _cssId = 'comp-css-blind-bid';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/blind-bid.css';
  document.head.appendChild(link);
}

/**
 * @param {{ onSubmit: (price: number) => void }} options
 */
export function createBlindBid({ onSubmit }) {
  const el = document.createElement('div');
  el.className = 'blind-bid';

  el.innerHTML = `
    <div class="blind-bid__header">
      <span class="blind-bid__label">🔒 비공개 입찰</span>
      <span class="blind-bid__count" id="bb-count">참여자 <strong>0</strong>명</span>
    </div>
    <div class="blind-bid__last" id="bb-last" style="display:none">
      직전 입찰: <span id="bb-last-price">0</span>원 — 더 높은 금액으로 재입찰 가능
    </div>
    <div class="blind-bid__row">
      <input
        class="blind-bid__input"
        id="bb-price-input"
        type="number"
        min="0"
        step="100"
        placeholder="입찰가 입력"
        autocomplete="off"
        inputmode="numeric"
      />
      <button class="blind-bid__btn" id="bb-submit-btn">입찰</button>
    </div>
    <div class="blind-bid__msg" id="bb-msg"></div>
  `;

  const inputEl  = el.querySelector('#bb-price-input');
  const submitBtn = el.querySelector('#bb-submit-btn');
  const msgEl    = el.querySelector('#bb-msg');
  const countEl  = el.querySelector('#bb-count strong');
  const lastRow  = el.querySelector('#bb-last');
  const lastPriceEl = el.querySelector('#bb-last-price');

  let myLastPrice = 0;  // 내가 마지막에 제출한 금액
  let _ackTimer = null;

  function showMsg(text, isError = false) {
    msgEl.textContent = text;
    msgEl.className = 'blind-bid__msg' + (isError ? ' blind-bid__msg--error' : ' blind-bid__msg--ok');
    clearTimeout(_ackTimer);
    _ackTimer = setTimeout(() => { msgEl.textContent = ''; msgEl.className = 'blind-bid__msg'; }, 3000);
  }

  submitBtn.addEventListener('click', () => {
    const price = parseInt(inputEl.value, 10);
    if (isNaN(price) || price <= 0) {
      showMsg('금액을 입력해 주세요', true);
      return;
    }
    if (price <= myLastPrice) {
      showMsg(`직전 입찰(${myLastPrice.toLocaleString()}원)보다 높은 금액이어야 합니다`, true);
      return;
    }
    if (typeof onSubmit === 'function') onSubmit(price);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) submitBtn.click();
  });

  /** 서버 ack 수신 시 — 입력 잠금 없이 피드백만 */
  function ack(price) {
    if (price && price > 0) {
      myLastPrice = price;
      lastPriceEl.textContent = myLastPrice.toLocaleString();
      lastRow.style.display = '';
    }
    inputEl.value = '';
    showMsg(`${myLastPrice.toLocaleString()}원 입찰 완료`);
    // iOS WebView에서 programmatic clear 후 포커스 복원
    requestAnimationFrame(() => inputEl.focus());
  }

  /** 룸 브로드캐스트 참여자 수 갱신 */
  function updateCount(n) {
    if (countEl) countEl.textContent = String(n);
  }

  /**
   * 경매 종료 결과 모달
   * @param {object} auction
   * @param {() => Promise<Array>} getBlindBids
   */
  function showResult(auction, getBlindBids) {
    inputEl.disabled = true;
    submitBtn.disabled = true;

    const modal = document.createElement('div');
    modal.className = 'blind-bid-result';
    modal.dataset.theme = 'light';
    const winnerDisplay = escapeHtml(auction.winnerName || auction.winner || auction.winnerId || '-');
    const priceDisplay  = (auction.price || auction.finalPrice || auction.currentPrice || 0).toLocaleString();
    const isVoid = auction.void === true || (!auction.winner && !auction.winnerId);

    modal.innerHTML = `
      <div class="blind-bid-result__card">
        <div class="blind-bid-result__title">${isVoid ? '유찰' : '블라인드 경매 종료'}</div>
        ${isVoid ? `
          <div class="blind-bid-result__void">입찰자가 없어 유찰되었습니다</div>
        ` : `
          <div class="blind-bid-result__winner">낙찰자: <strong>${winnerDisplay}</strong></div>
          <div class="blind-bid-result__price">낙찰가: <strong>${priceDisplay}원</strong></div>
        `}
        <button class="blind-bid-result__toggle" id="bbr-toggle">입찰 내역 보기</button>
        <div class="blind-bid-result__bids" id="bbr-bids" style="display:none"></div>
        <button class="blind-bid-result__close" id="bbr-close">닫기</button>
      </div>
    `;

    const toggleBtn = modal.querySelector('#bbr-toggle');
    const bidsDiv   = modal.querySelector('#bbr-bids');
    const closeBtn  = modal.querySelector('#bbr-close');
    let bidsLoaded  = false;

    toggleBtn.addEventListener('click', async () => {
      if (bidsDiv.style.display === 'none') {
        bidsDiv.style.display = '';
        toggleBtn.textContent = '입찰 내역 닫기';
        if (!bidsLoaded) {
          bidsDiv.innerHTML = '<div class="blind-bid-result__loading">불러오는 중...</div>';
          try {
            const rawBids = await getBlindBids();
            const bids = Array.isArray(rawBids) ? rawBids : [];
            bidsLoaded = true;
            if (bids.length === 0) {
              bidsDiv.innerHTML = '<div class="blind-bid-result__empty">입찰 내역 없음</div>';
            } else {
              const rows = bids.map((b, i) =>
                `<tr class="${i === 0 ? 'bbr-winner-row' : ''}">
                  <td class="bbr-rank">${i + 1}</td>
                  <td class="bbr-name">${escapeHtml(b.userName || b.userId || '-')}</td>
                  <td class="bbr-price">${(b.price || 0).toLocaleString()}원</td>
                </tr>`
              ).join('');
              bidsDiv.innerHTML = `
                <table class="blind-bid-result__table">
                  <thead><tr><th>순위</th><th>입찰자</th><th>금액</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              `;
            }
          } catch (err) {
            bidsDiv.innerHTML = `<div class="blind-bid-result__error">조회 실패: ${escapeHtml(err.message)}</div>`;
          }
        }
      } else {
        bidsDiv.style.display = 'none';
        toggleBtn.textContent = '입찰 내역 보기';
      }
    });

    closeBtn.addEventListener('click', () => modal.remove());
    document.body.appendChild(modal);
  }

  function reset() {
    myLastPrice = 0;
    inputEl.disabled = false;
    submitBtn.disabled = false;
    inputEl.value = '';
    lastRow.style.display = 'none';
    msgEl.textContent = '';
    msgEl.className = 'blind-bid__msg';
  }

  function destroy() {
    clearTimeout(_ackTimer);
    el.remove();
  }

  return { el, ack, updateCount, showResult, reset, destroy };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
