/**
 * Image Lightbox Component — Barofarm
 *
 * Reusable fullscreen image viewer.
 *
 * API:
 *   openLightbox(srcOrArray, startIndex = 0)  // string 또는 string[]
 *   closeLightbox()                            // 안전한 no-op (이미 닫혀 있어도 OK)
 *
 * - body 직속 append, 열려 있을 때만 DOM에 존재.
 * - 닫기: 백드롭 클릭 / ✕ / ESC / 이미지 탭.
 * - 배열이면 좌우 이동(버튼 + ←/→), 단일 문자열이면 네비게이션 숨김.
 * - 배경 스크롤 잠금(open 시 저장, close 시 복원).
 * - ESC/화살표/popstate 리스너는 open 시에만 등록, close 시 제거 → 누수 없음.
 *
 * @module components/lightbox
 */

// Inject CSS once (toast.js / confirm-dialog.js 컨벤션 준수)
const _cssId = 'comp-css-lightbox';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/components/lightbox.css';
  document.head.appendChild(link);
}

/** @type {HTMLElement | null} */
let overlay = null;
/** @type {string[]} */
let images = [];
let index = 0;
let prevBodyOverflow = '';

function render() {
  const imgEl = overlay.querySelector('.lightbox__img');
  const counterEl = overlay.querySelector('.lightbox__counter');
  imgEl.src = images[index];
  overlay.dataset.single = images.length <= 1 ? 'true' : 'false';
  if (counterEl) counterEl.textContent = `${index + 1}/${images.length}`;
}

function go(delta) {
  if (images.length <= 1) return;
  index = (index + delta + images.length) % images.length;
  render();
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    closeLightbox();
  } else if (e.key === 'ArrowLeft') {
    go(-1);
  } else if (e.key === 'ArrowRight') {
    go(1);
  }
}

function onPopstate() {
  // 라우터 URL 변경 시 라이트박스가 남지 않도록 자동 닫기.
  closeLightbox();
}

/**
 * @param {string | string[]} srcOrArray
 * @param {number} startIndex
 */
export function openLightbox(srcOrArray, startIndex = 0) {
  const list = Array.isArray(srcOrArray) ? srcOrArray : [srcOrArray];
  images = list.filter((s) => typeof s === 'string' && s.length > 0);
  if (!images.length) return;
  index = Math.min(Math.max(0, startIndex | 0), images.length - 1);

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <button class="lightbox__btn lightbox__close" type="button" aria-label="닫기">✕</button>
      <button class="lightbox__btn lightbox__nav lightbox__prev" type="button" aria-label="이전 이미지">‹</button>
      <img class="lightbox__img" alt="" />
      <button class="lightbox__btn lightbox__nav lightbox__next" type="button" aria-label="다음 이미지">›</button>
      <span class="lightbox__counter"></span>
    `;

    overlay.addEventListener('click', (e) => {
      const t = e.target;
      if (t === overlay || t.classList.contains('lightbox__img')) {
        closeLightbox();
      }
    });
    overlay.querySelector('.lightbox__close').addEventListener('click', closeLightbox);
    overlay.querySelector('.lightbox__prev').addEventListener('click', (e) => {
      e.stopPropagation();
      go(-1);
    });
    overlay.querySelector('.lightbox__next').addEventListener('click', (e) => {
      e.stopPropagation();
      go(1);
    });
  }

  if (!document.body.contains(overlay)) {
    document.body.appendChild(overlay);
  }

  render();

  // 스크롤 잠금
  prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // 리스너 등록 (열림 상태 한정)
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('popstate', onPopstate);

  // 다음 프레임에 트랜지션 트리거
  requestAnimationFrame(() => {
    if (overlay) overlay.classList.add('is-open');
  });
}

export function closeLightbox() {
  if (!overlay || !document.body.contains(overlay)) return;

  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('popstate', onPopstate);
  document.body.style.overflow = prevBodyOverflow;

  overlay.classList.remove('is-open');
  const el = overlay;
  const onEnd = () => {
    el.removeEventListener('transitionend', onEnd);
    if (el.parentNode && !el.classList.contains('is-open')) {
      el.parentNode.removeChild(el);
    }
  };
  el.addEventListener('transitionend', onEnd);
  // 트랜지션이 발화하지 않는 경우 대비 폴백
  setTimeout(onEnd, 400);
}
