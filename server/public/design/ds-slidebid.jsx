// ds-slidebid.jsx
// Slide-to-bid component — three variants, one per theme tone.
// drag the thumb to the right to confirm the bid.

function SlideBid({ theme, p, fonts, radius,
                   amount = '14,500', label = '오른쪽으로 밀어서 입찰',
                   onConfirm, height = 60, variant }) {
  const [x, setX] = React.useState(0);
  const [confirmed, setConfirmed] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const trackRef = React.useRef(null);
  const thumbW = height; // square-ish thumb

  // pick variant per theme if not given
  const v = variant || (theme.id === 'soilSun' ? 'pill'
                       : theme.id === 'freshField' ? 'soft'
                       : 'sharp');

  const r = v === 'pill'  ? height / 2
          : v === 'sharp' ? 2
          : radius;

  const onPointerDown = (e) => {
    if (confirmed) return;
    setDragging(true);
    e.target.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const max = rect.width - thumbW;
    const nx = Math.max(0, Math.min(max, e.clientX - rect.left - thumbW / 2));
    setX(nx);
    if (nx >= max - 2) {
      setConfirmed(true);
      setDragging(false);
      onConfirm?.();
      setTimeout(() => { setConfirmed(false); setX(0); }, 1600);
    }
  };
  const onPointerUp = () => {
    setDragging(false);
    if (!confirmed) setX(0);
  };

  const trackW = trackRef.current?.getBoundingClientRect().width || 1;
  const progress = x / Math.max(1, trackW - thumbW);

  // background fills as user drags
  const fillColor = confirmed ? p.success : p.accent;

  return (
    <div
      ref={trackRef}
      style={{
        position:'relative', width:'100%', height,
        background: p.surfaceAlt,
        border: `1px solid ${p.line}`,
        borderRadius: r,
        overflow:'hidden', userSelect:'none', touchAction:'none',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* progress fill */}
      <div style={{
        position:'absolute', inset:0,
        background: fillColor,
        width: `${x + thumbW}px`,
        transition: dragging ? 'none' : 'width .25s cubic-bezier(.2,.7,.3,1), background .2s',
        opacity: 0.95,
      }} />

      {/* label */}
      <div style={{
        position:'absolute', inset:0,
        display:'flex', alignItems:'center', justifyContent:'center', gap: 14,
        fontFamily: fonts.body, fontSize: 15, fontWeight: 600,
        letterSpacing:'-0.01em',
        color: progress > 0.4 ? '#fff' : p.ink,
        transition: 'color .15s',
        pointerEvents:'none',
      }}>
        {confirmed ? (
          <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
            <Check /> 입찰 완료 · {amount}원
          </span>
        ) : (
          <>
            <span style={{ opacity: 1 - progress * 1.6 }}>
              {label}
            </span>
            <span style={{
              fontFamily: fonts.mono, fontSize: 13, fontWeight: 700,
              opacity: 1 - progress * 1.4,
            }}>
              {amount}원
            </span>
          </>
        )}
      </div>

      {/* arrows hint */}
      {!confirmed && (
        <div style={{
          position:'absolute', right: 16, top:'50%', transform:'translateY(-50%)',
          color: progress > 0.4 ? 'rgba(255,255,255,.7)' : p.inkMute,
          fontSize: 18, fontFamily: fonts.mono, letterSpacing: '-2px',
          opacity: 1 - progress * 1.5,
          pointerEvents:'none',
        }}>››»</div>
      )}

      {/* thumb */}
      <div
        onPointerDown={onPointerDown}
        style={{
          position:'absolute', top: 4, left: 4 + x,
          width: thumbW - 8, height: height - 8,
          borderRadius: v === 'sharp' ? 1 : v === 'pill' ? 999 : Math.max(0, r - 4),
          background: confirmed ? p.success : '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,.22)',
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor: confirmed ? 'default' : 'grab',
          transition: dragging ? 'none' : 'left .25s cubic-bezier(.2,.7,.3,1), background .2s',
        }}
      >
        {confirmed
          ? <Check color={p.accentInk} />
          : <Arrow color={p.accent} />}
      </div>
    </div>
  );
}

function Arrow({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h12M11 5l5 5-5 5" stroke={color} strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Check({ color = '#fff' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M4 10.5l4 4 8-9" stroke={color} strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Card showing all three variants of slide-to-bid
function SlideBidCard({ theme, p, fonts, radius }) {
  return (
    <CardShell p={p} fonts={fonts}>
      <Eyebrow p={p} fonts={fonts}>09 · Slide to bid</Eyebrow>
      <div style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700,
        letterSpacing: '-0.02em', color: p.ink, marginBottom: 6 }}>
        밀어서 입찰
      </div>
      <div style={{ fontSize: 13, color: p.inkSoft, marginBottom: 24, lineHeight: 1.5 }}>
        실수 입찰 방지 + 라이브 긴장감.<br/>
        오른쪽으로 끝까지 밀어주세요.
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap: 24 }}>
        <div>
          <div style={{ fontFamily: fonts.mono, fontSize: 10, color: p.inkMute,
            letterSpacing:'0.06em', textTransform:'uppercase', marginBottom: 10 }}>
            Default · 테마 매칭
          </div>
          <SlideBid theme={theme} p={p} fonts={fonts} radius={radius}
            label="밀어서 입찰" amount="14,500" />
        </div>

        <div>
          <div style={{ fontFamily: fonts.mono, fontSize: 10, color: p.inkMute,
            letterSpacing:'0.06em', textTransform:'uppercase', marginBottom: 10 }}>
            Compact · 작은 사이즈
          </div>
          <SlideBid theme={theme} p={p} fonts={fonts} radius={radius}
            label="밀어서 +500원" amount="15,000" height={48} />
        </div>

        <div>
          <div style={{ fontFamily: fonts.mono, fontSize: 10, color: p.inkMute,
            letterSpacing:'0.06em', textTransform:'uppercase', marginBottom: 10 }}>
            Big · 결정적 액션 (즉시낙찰)
          </div>
          <SlideBid theme={theme} p={p} fonts={fonts} radius={radius}
            label="밀어서 즉시낙찰" amount="18,000" height={72} />
        </div>

        <div style={{
          marginTop: 8, padding: 14,
          background: p.surface, border: `1px solid ${p.line}`,
          borderLeft: `3px solid ${p.accent}`,
          borderRadius: radius,
          fontSize: 12, color: p.inkSoft, lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 600, color: p.ink, marginBottom: 4 }}>
            왜 슬라이드?
          </div>
          라이브 경매는 1초가 중요해서 오타·오탭이 잦아요. 밀어서 입찰은 의도를
          한 번 더 확인하면서도 손가락 한 번의 동작으로 끝나서 빠릅니다.
        </div>
      </div>
    </CardShell>
  );
}

window.SlideBid = SlideBid;
window.SlideBidCard = SlideBidCard;
