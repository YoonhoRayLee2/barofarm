/**
 * Timer Component — 3-W22
 * Countdown display with color/animation transitions.
 *
 * @module components/timer
 */

// Inject CSS once
const _cssId = 'comp-css-timer';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/timer.css';
  document.head.appendChild(link);
}

/**
 * Create a countdown timer display element.
 *
 * @param {{ initialRemaining?: number }} options
 * @returns {{ el: HTMLElement, update(remaining: number): void, destroy(): void }}
 */
export function createTimer({ initialRemaining = 30 } = {}) {
  const el = document.createElement('div');
  el.className = 'timer';
  el.innerHTML = `
    <span class="timer__number">--</span>
    <span class="timer__label">초</span>
  `;

  const numEl = el.querySelector('.timer__number');
  const labelEl = el.querySelector('.timer__label');

  /**
   * Update the displayed remaining time and apply appropriate state class.
   * @param {number} remaining - seconds remaining
   */
  function update(remaining) {
    const secs = Math.max(0, Math.round(remaining));
    if (secs >= 60) {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      numEl.textContent = `${m}분 ${String(s).padStart(2, '0')}`;
      labelEl.textContent = '초';
    } else {
      numEl.textContent = String(secs).padStart(2, '0');
      labelEl.textContent = '초';
    }

    el.classList.remove('timer--warn', 'timer--danger');
    if (secs <= 5) {
      el.classList.add('timer--danger');
    } else if (secs <= 10) {
      el.classList.add('timer--warn');
    }
  }

  /** Remove the element and stop animations. */
  function destroy() {
    el.remove();
  }

  // Set initial display
  update(initialRemaining);

  return { el, update, destroy };
}
