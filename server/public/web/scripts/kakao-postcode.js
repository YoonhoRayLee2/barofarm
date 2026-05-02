/**
 * Kakao 우편번호 서비스 래퍼 — 인앱 모달 embed 방식
 * WebView 호환: position:absolute on #app-root, 애니메이션 후 embed 호출.
 *
 * @module scripts/kakao-postcode
 */

const SCRIPT_URL = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

let _loading = null;

function loadScript() {
  if (window.daum?.Postcode) return Promise.resolve();
  if (_loading) return _loading;
  _loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.onload  = () => { _loading = null; resolve(); };
    s.onerror = () => { _loading = null; reject(new Error('카카오 주소 스크립트 로드 실패')); };
    document.head.appendChild(s);
  });
  return _loading;
}

/**
 * 인앱 모달 안에 카카오 우편번호 검색 UI를 embed하고,
 * 주소 선택 시 callback을 호출한 뒤 모달을 닫는다.
 *
 * @param {(result: { zipcode: string, address: string, buildingName: string }) => void} callback
 */
export async function openKakaoPostcode(callback) {
  await loadScript();

  // ── 백드롭 — body에 fixed로 마운트해 프로필 시트(z-index:1000) 위에 표시 ──
  const backdrop = document.createElement('div');
  backdrop.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:1500',
    'background:rgba(0,0,0,0.65)',
    'display:flex', 'align-items:flex-end', 'justify-content:center',
    'opacity:0', 'transition:opacity 0.2s ease',
  ].join(';');

  // ── 모달 패널 ───────────────────────────────────────────────
  const modal = document.createElement('div');
  modal.style.cssText = [
    'width:100%', 'max-width:480px',
    'background:var(--color-bg,#0e1a12)',
    'border-radius:var(--radius-lg,16px) var(--radius-lg,16px) 0 0',
    'overflow:hidden',
    'display:flex', 'flex-direction:column',
    // 처음엔 아래로 숨김
    'transform:translateY(100%)',
    'transition:transform 0.28s cubic-bezier(0.32,0.72,0,1)',
  ].join(';');

  // 헤더
  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex', 'align-items:center', 'justify-content:space-between',
    'padding:16px 16px 12px',
    'border-bottom:1px solid var(--color-line,rgba(255,255,255,0.08))',
    'flex-shrink:0',
  ].join(';');
  header.innerHTML = `
    <span style="font-family:var(--font-display,sans-serif);font-size:16px;font-weight:700;color:var(--color-ink,#f0f4ee)">
      주소 검색
    </span>
    <button id="_kp_close" aria-label="닫기" style="
      background:none;border:none;padding:6px;cursor:pointer;
      color:var(--color-ink-soft,#8a9a86);line-height:0;
    ">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;

  // Kakao iframe이 주입될 컨테이너 — 명시적 height 필수
  const embedWrap = document.createElement('div');
  embedWrap.style.cssText = 'width:100%;height:450px;overflow:hidden;';

  modal.appendChild(header);
  modal.appendChild(embedWrap);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  function closeModal() {
    backdrop.style.opacity = '0';
    modal.style.transform = 'translateY(100%)';
    modal.addEventListener('transitionend', () => backdrop.remove(), { once: true });
  }

  header.querySelector('#_kp_close').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

  // ── 슬라이드업 완료 후 embed (컨테이너가 화면에 있어야 Kakao가 높이를 잡음) ──
  requestAnimationFrame(() => {
    // 백드롭 fade-in + 모달 슬라이드업 시작
    backdrop.style.opacity = '1';
    modal.style.transform = 'translateY(0)';

    // 트랜지션(280ms) 완료 후 embed 호출
    modal.addEventListener('transitionend', () => {
      new window.daum.Postcode({
        width:  '100%',
        height: '100%',
        oncomplete(data) {
          callback({
            zipcode:      data.zonecode || '',
            address:      data.roadAddress || data.autoRoadAddress || data.jibunAddress || '',
            buildingName: data.buildingName || '',
          });
          closeModal();
        },
        onresize(size) {
          embedWrap.style.height = Math.max(300, size.height) + 'px';
        },
      }).embed(embedWrap, { autoClose: false });
    }, { once: true });
  });
}
