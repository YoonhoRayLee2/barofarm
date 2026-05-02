/**
 * Slide-to-Bid Component — 3-W22
 * Drag the handle right ≥70% to confirm a bid.
 *
 * @module components/slide-bid
 */

// Inject CSS once
const _cssId = 'comp-css-slide-bid';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/slide-bid.css';
  document.head.appendChild(link);
}

/**
 * @param {{ amount: number, onConfirm: () => void }} options
 * @returns {{ el: HTMLElement, reset(): void, destroy(): void }}
 */
export function createSlideBid({ amount, onConfirm }) {
  const el = document.createElement('div');
  el.className = 'slide-bid';
  el.innerHTML = `
    <div class="slide-bid__fill"></div>
    <div class="slide-bid__label">${amount.toLocaleString()}원 입찰 &rsaquo;&rsaquo;</div>
    <div class="slide-bid__handle" aria-label="밀어서 입찰">›</div>
  `;

  const fill = el.querySelector('.slide-bid__fill');
  const handle = el.querySelector('.slide-bid__handle');

  let isDragging = false;
  let startX = 0;
  let handleLeft = 4; // px from left edge
  let locked = false;

  function getTrackWidth() {
    return el.offsetWidth - 4 - 4 - 44; // padding both sides + handle width
  }

  function setHandlePosition(px) {
    const track = getTrackWidth();
    const clamped = Math.max(0, Math.min(px, track));
    handle.style.left = `${clamped + 4}px`;
    const pct = track > 0 ? (clamped / track) * 100 : 0;
    fill.style.width = `${pct + (44 / el.offsetWidth) * 100}%`;
    return { clamped, pct };
  }

  function onPointerDown(e) {
    if (locked) return;
    isDragging = true;
    startX = e.clientX - handleLeft;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!isDragging || locked) return;
    const delta = e.clientX - startX;
    const { clamped, pct } = setHandlePosition(delta);
    handleLeft = clamped;

    if (pct >= 70) {
      isDragging = false;
      locked = true;
      el.classList.add('slide-bid--confirmed');
      if (typeof onConfirm === 'function') onConfirm();
      // Unlock after short delay so user sees confirmation
      setTimeout(() => {
        reset();
      }, 600);
    }
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    // Spring back
    handleLeft = 0;
    setHandlePosition(0);
    handle.style.transition = 'left 0.25s cubic-bezier(0.25,0.46,0.45,0.94)';
    setTimeout(() => { handle.style.transition = ''; }, 260);
  }

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);

  /** Reset handle to start position and unlock. */
  function reset() {
    locked = false;
    isDragging = false;
    handleLeft = 0;
    el.classList.remove('slide-bid--confirmed', 'slide-bid--locked');
    handle.style.transition = 'left 0.25s cubic-bezier(0.25,0.46,0.45,0.94)';
    setHandlePosition(0);
    setTimeout(() => { handle.style.transition = ''; }, 260);
  }

  function destroy() {
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerUp);
    handle.removeEventListener('pointercancel', onPointerUp);
    el.remove();
  }

  function setAmount(newAmount) {
    const labelEl = el.querySelector('.slide-bid__label');
    if (labelEl) labelEl.innerHTML = `${newAmount.toLocaleString()}원 입찰 &rsaquo;&rsaquo;`;
  }

  return { el, reset, setAmount, destroy };
}
