/**
 * Bid Chips Component — 3-W22
 * Horizontal chip row for selecting bid increment amounts.
 *
 * @module components/bid-chips
 */

// Inject CSS once
const _cssId = 'comp-css-bid-chips';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/bid-chips.css';
  document.head.appendChild(link);
}

/**
 * @param {{ steps?: number[], onSelect: (amount: number) => void }} options
 * @returns {{ el: HTMLElement, destroy(): void }}
 */
export function createBidChips({ steps = [500, 1000, 2000, 5000], onSelect } = {}) {
  const el = document.createElement('div');
  el.className = 'bid-chips';

  steps.forEach((amount) => {
    const chip = document.createElement('button');
    chip.className = 'bid-chip';
    chip.textContent = formatLabel(amount);
    chip.setAttribute('aria-label', `${amount.toLocaleString()}원 추가`);

    chip.addEventListener('click', () => {
      // Briefly highlight
      chip.classList.add('is-selected');
      setTimeout(() => chip.classList.remove('is-selected'), 300);
      if (typeof onSelect === 'function') onSelect(amount);
    });

    el.appendChild(chip);
  });

  function destroy() {
    el.remove();
  }

  return { el, destroy };
}

/**
 * Format a chip label: use K suffix for thousands.
 * @param {number} amount
 * @returns {string}
 */
function formatLabel(amount) {
  if (amount >= 1000 && amount % 1000 === 0) {
    return `+${amount / 1000}K`;
  }
  return `+${amount.toLocaleString()}`;
}
