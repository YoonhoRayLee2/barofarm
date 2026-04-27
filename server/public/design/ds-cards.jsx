// ds-cards.jsx
// Reusable display cards for showing each theme's design tokens & components.
// Every card receives `t` (theme), `p` (resolved palette), `dark`, `radius`, etc.

// ─────────────────────────────────────────────────────────────────────────────
// Common chrome
// ─────────────────────────────────────────────────────────────────────────────

function CardShell({ p, fonts, children, padding = 24, style = {} }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: p.bg,
      color: p.ink,
      fontFamily: fonts.body,
      padding,
      overflow: 'hidden',
      ...style,
    }}>{children}</div>
  );
}

function Eyebrow({ p, fonts, children }) {
  return (
    <div style={{
      fontFamily: fonts.mono,
      fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: p.inkMute, marginBottom: 12,
    }}>{children}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Brand cover (theme intro)
// ─────────────────────────────────────────────────────────────────────────────

function BrandCover({ theme, p, fonts, radius }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: p.bg, color: p.ink,
      fontFamily: fonts.body,
      padding: 32, display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between',
      backgroundImage: `radial-gradient(circle at 80% 20%, ${p.accentSoft}55 0%, transparent 55%)`,
    }}>
      <div>
        <div style={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: '0.12em',
          color: p.inkMute, textTransform: 'uppercase' }}>
          barofarm · direction
        </div>
        <div style={{ marginTop: 18, fontSize: 14, color: p.inkSoft, fontFamily: fonts.mono }}>
          {theme.id === 'soilSun' ? 'A' : theme.id === 'freshField' ? 'B' : 'C'}
        </div>
      </div>

      <div>
        <div style={{
          fontFamily: fonts.display,
          fontSize: 56, fontWeight: 700, lineHeight: 1.0,
          letterSpacing: '-0.03em',
          color: p.ink,
        }}>{theme.ko}</div>
        <div style={{
          marginTop: 6, fontSize: 22, fontWeight: 500,
          color: p.accent, letterSpacing: '-0.01em',
        }}>{theme.name}</div>
        <div style={{ marginTop: 18, fontSize: 14, color: p.inkSoft,
          maxWidth: 360, lineHeight: 1.6 }}>
          {theme.tagline}
        </div>
      </div>

      <div style={{ display:'flex', gap: 8 }}>
        {[p.bg, p.surfaceAlt, p.accent, p.accentSoft, p.ink].map((c, i) => (
          <div key={i} style={{
            width: 36, height: 36, borderRadius: radius,
            background: c, border: `1px solid ${p.line}`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Color palette
// ─────────────────────────────────────────────────────────────────────────────

function Swatch({ name, value, p, fonts, radius, big = false }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{
        height: big ? 80 : 56,
        background: value,
        borderRadius: radius,
        border: `1px solid ${p.line}`,
      }} />
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: p.ink }}>{name}</div>
        <div style={{ fontFamily: fonts.mono, fontSize: 10, color: p.inkMute }}>
          {String(value).toUpperCase()}
        </div>
      </div>
    </div>
  );
}

function ColorCard({ theme, p, fonts, radius }) {
  const groups = [
    { title: 'Surface', items: [
      ['Background', p.bg], ['Background Alt', p.bgAlt],
      ['Surface', p.surface], ['Surface Alt', p.surfaceAlt],
    ]},
    { title: 'Ink', items: [
      ['Ink', p.ink], ['Ink Soft', p.inkSoft],
      ['Ink Mute', p.inkMute], ['Line', p.line],
    ]},
    { title: 'Accent', items: [
      ['Accent', p.accent], ['Accent Soft', p.accentSoft],
    ]},
    { title: 'Semantic', items: [
      ['Live', p.live], ['Success', p.success],
      ['Warning', p.warning], ['Danger', p.danger],
    ]},
  ];

  return (
    <CardShell p={p} fonts={fonts}>
      <Eyebrow p={p} fonts={fonts}>01 · Color palette</Eyebrow>
      <div style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700,
        letterSpacing: '-0.02em', color: p.ink, marginBottom: 20 }}>
        컬러 팔레트
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
        {groups.map(g => (
          <div key={g.title}>
            <div style={{ fontFamily: fonts.mono, fontSize: 10, letterSpacing:'0.08em',
              textTransform:'uppercase', color: p.inkMute, marginBottom: 10 }}>{g.title}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {g.items.map(([n, v]) => (
                <Swatch key={n} name={n} value={v} p={p} fonts={fonts} radius={radius} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Typography
// ─────────────────────────────────────────────────────────────────────────────

function TypeCard({ theme, p, fonts, radius }) {
  const samples = [
    { ...TYPE_SCALE[0], text: '산지직송 경매' },
    { ...TYPE_SCALE[2], text: '오늘 새벽 수확한 옥수수' },
    { ...TYPE_SCALE[3], text: '강원 평창 · 해발 700m' },
    { ...TYPE_SCALE[5], text: '새벽 5시, 김씨네 옥수수밭에서 따온 그대로 박스에 담아 보냅니다. 단단하고 단맛이 진해요.' },
    { ...TYPE_SCALE[7], text: '입찰 12명 · 현재 14,200원' },
    { ...TYPE_SCALE[8], text: 'LIVE · 02:14 LEFT' },
  ];

  return (
    <CardShell p={p} fonts={fonts}>
      <Eyebrow p={p} fonts={fonts}>02 · Typography</Eyebrow>
      <div style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700,
        letterSpacing: '-0.02em', color: p.ink, marginBottom: 6 }}>
        타이포그래피
      </div>
      <div style={{ fontSize: 12, color: p.inkMute, marginBottom: 22, fontFamily: fonts.mono }}>
        Display: {fonts.display.split(',')[0].replace(/'/g,'')}　·　Body: Pretendard
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
        {samples.map((s, i) => (
          <div key={i} style={{ display:'flex', flexDirection:'column', gap:4,
            paddingBottom: 16, borderBottom: `1px solid ${p.line}` }}>
            <div style={{ fontFamily: fonts.mono, fontSize: 10, color: p.inkMute,
              letterSpacing:'0.06em' }}>
              {s.name} · {s.size}/{(s.size * s.lh).toFixed(0)} · {s.weight}
            </div>
            <div style={{
              fontFamily: i === 0 ? fonts.display : fonts.body,
              fontSize: s.size, fontWeight: s.weight, lineHeight: s.lh,
              letterSpacing: s.tracking, color: p.ink,
            }}>{s.text}</div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Spacing & grid
// ─────────────────────────────────────────────────────────────────────────────

function SpacingCard({ p, fonts, radius }) {
  return (
    <CardShell p={p} fonts={fonts}>
      <Eyebrow p={p} fonts={fonts}>03 · Spacing & grid</Eyebrow>
      <div style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700,
        letterSpacing: '-0.02em', color: p.ink, marginBottom: 22 }}>
        스페이싱
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom: 32 }}>
        {[4,8,12,16,24,32,48].map(v => (
          <div key={v} style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:48, fontFamily: fonts.mono, fontSize:11, color:p.inkMute }}>
              {v}px
            </div>
            <div style={{ height: 14, width: v * 4, background: p.accent,
              borderRadius: 2 }} />
            <div style={{ fontFamily: fonts.mono, fontSize:10, color:p.inkMute }}>
              space-{[4,8,12,16,24,32,48].indexOf(v) + 1}
            </div>
          </div>
        ))}
      </div>

      <Eyebrow p={p} fonts={fonts}>4-column grid · 16 gutter</Eyebrow>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 16,
        height: 80, marginTop: 8 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            background: p.surfaceAlt,
            border: `1px dashed ${p.line}`,
            borderRadius: radius,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily: fonts.mono, fontSize: 10, color: p.inkMute,
          }}>col {i+1}</div>
        ))}
      </div>
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Buttons
// ─────────────────────────────────────────────────────────────────────────────

function Btn({ kind, p, fonts, radius, theme, children, size = 'md' }) {
  const padY = size === 'lg' ? 14 : size === 'sm' ? 6 : 10;
  const padX = size === 'lg' ? 22 : size === 'sm' ? 12 : 16;
  const fs   = size === 'lg' ? 16 : size === 'sm' ? 12 : 14;

  const styles = {
    primary:   { background: p.accent, color: p.accentInk, border: 'none' },
    secondary: { background: p.surface, color: p.ink, border: `1px solid ${p.line}` },
    ghost:     { background: 'transparent', color: p.ink, border: 'none' },
    danger:    { background: p.danger, color: '#fff', border: 'none' },
    live:      { background: p.live, color: '#fff', border: 'none' },
  }[kind];

  // Auction Hall = sharp / blocky, Soil & Sun = pill, Fresh Field = soft
  const r = theme.id === 'soilSun' ? 999 : theme.id === 'auctionHall' ? 2 : radius;

  return (
    <button style={{
      ...styles,
      padding: `${padY}px ${padX}px`,
      borderRadius: r,
      fontFamily: fonts.body, fontSize: fs, fontWeight: 600,
      letterSpacing: '-0.01em',
      cursor: 'pointer',
      display:'inline-flex', alignItems:'center', gap: 8,
    }}>{children}</button>
  );
}

function ButtonCard({ theme, p, fonts, radius }) {
  return (
    <CardShell p={p} fonts={fonts}>
      <Eyebrow p={p} fonts={fonts}>04 · Buttons</Eyebrow>
      <div style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700,
        letterSpacing: '-0.02em', color: p.ink, marginBottom: 22 }}>
        버튼
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap: 22 }}>
        <Row label="Primary · 주요 액션" p={p} fonts={fonts}>
          <Btn kind="primary" p={p} fonts={fonts} radius={radius} theme={theme} size="lg">14,500원에 입찰</Btn>
          <Btn kind="primary" p={p} fonts={fonts} radius={radius} theme={theme}>입찰하기</Btn>
          <Btn kind="primary" p={p} fonts={fonts} radius={radius} theme={theme} size="sm">+500원</Btn>
        </Row>

        <Row label="Secondary · 보조" p={p} fonts={fonts}>
          <Btn kind="secondary" p={p} fonts={fonts} radius={radius} theme={theme}>관심상품</Btn>
          <Btn kind="ghost" p={p} fonts={fonts} radius={radius} theme={theme}>나중에</Btn>
        </Row>

        <Row label="Live · 실시간 입찰" p={p} fonts={fonts}>
          <Btn kind="live" p={p} fonts={fonts} radius={radius} theme={theme} size="lg">
            <Pulse color="#fff" /> 라이브 입찰
          </Btn>
          <Btn kind="danger" p={p} fonts={fonts} radius={radius} theme={theme}>경매 마감</Btn>
        </Row>

        <Row label="States" p={p} fonts={fonts}>
          <Btn kind="primary" p={p} fonts={fonts} radius={radius} theme={theme}>Default</Btn>
          <button style={{
            background: p.accent, color: p.accentInk, border:'none',
            padding:'10px 16px', borderRadius: theme.id==='soilSun'?999:theme.id==='auctionHall'?2:radius,
            fontFamily: fonts.body, fontSize:14, fontWeight:600,
            opacity: 0.9, boxShadow: `0 0 0 3px ${p.accent}33`,
          }}>Hover</button>
          <button style={{
            background: p.surfaceAlt, color: p.inkMute, border:'none',
            padding:'10px 16px', borderRadius: theme.id==='soilSun'?999:theme.id==='auctionHall'?2:radius,
            fontFamily: fonts.body, fontSize:14, fontWeight:600,
          }} disabled>Disabled</button>
        </Row>
      </div>
    </CardShell>
  );
}

function Row({ label, p, fonts, children }) {
  return (
    <div>
      <div style={{ fontFamily: fonts.mono, fontSize: 10, color: p.inkMute,
        letterSpacing:'0.06em', textTransform:'uppercase', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        {children}
      </div>
    </div>
  );
}

function Pulse({ color }) {
  return (
    <span style={{ position:'relative', width:8, height:8, display:'inline-block' }}>
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:color,
        animation:'ds-pulse 1.4s ease-out infinite', opacity:0.6 }} />
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:color }} />
      <style>{`@keyframes ds-pulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.4);opacity:0}}`}</style>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Form / Input
// ─────────────────────────────────────────────────────────────────────────────

function FormCard({ theme, p, fonts, radius }) {
  const r = theme.id === 'auctionHall' ? 2 : radius;
  return (
    <CardShell p={p} fonts={fonts}>
      <Eyebrow p={p} fonts={fonts}>05 · Form & input</Eyebrow>
      <div style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700,
        letterSpacing: '-0.02em', color: p.ink, marginBottom: 22 }}>
        폼 & 인풋
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap: 20 }}>
        <Field label="입찰 금액" hint="최소 500원 단위" p={p} fonts={fonts} r={r}>
          <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
            <div style={{
              flex:1, display:'flex', alignItems:'center',
              border:`1px solid ${p.line}`, borderRadius: r,
              background: p.surface, padding:'0 14px', height: 48,
            }}>
              <span style={{ fontSize: 14, color: p.inkMute }}>₩</span>
              <input defaultValue="14,500" style={{
                flex:1, border:'none', outline:'none', background:'transparent',
                color: p.ink, fontFamily: fonts.body, fontSize: 18, fontWeight: 600,
                marginLeft: 8,
              }} />
            </div>
            <button style={{
              background: p.accent, color: p.accentInk, border:'none',
              padding:'0 18px', height: 48, borderRadius: r,
              fontFamily: fonts.body, fontSize: 14, fontWeight: 600,
            }}>입찰</button>
          </div>
        </Field>

        <Field label="배송 메모" p={p} fonts={fonts} r={r}>
          <textarea rows={2} placeholder="문 앞에 두고 가주세요" style={{
            width:'100%', border:`1px solid ${p.line}`, borderRadius: r,
            background: p.surface, color: p.ink,
            padding:'12px 14px', fontFamily: fonts.body, fontSize: 14,
            outline:'none', resize:'none',
          }} />
        </Field>

        <div style={{ display:'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label="자동 재입찰" p={p} fonts={fonts} r={r}>
              <Toggle on={true} p={p} radius={r} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="알림" p={p} fonts={fonts} r={r}>
              <Chips items={['낙찰', '마감 임박', '관심농가']} active={[0,1]} p={p} fonts={fonts} r={r} />
            </Field>
          </div>
        </div>

        <Field label="에러 상태" p={p} fonts={fonts} r={r}>
          <div style={{
            border:`1px solid ${p.danger}`, borderRadius: r,
            background: p.surface, padding:'10px 14px',
            color: p.ink, fontFamily: fonts.body, fontSize: 14,
          }}>10,000</div>
          <div style={{ marginTop: 6, fontSize: 12, color: p.danger }}>
            현재가보다 낮습니다. 14,500원 이상 입찰해주세요.
          </div>
        </Field>
      </div>
    </CardShell>
  );
}

function Field({ label, hint, children, p, fonts }) {
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: p.ink }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: p.inkMute, fontFamily: fonts.mono }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, p, radius }) {
  return (
    <div style={{
      width: 44, height: 26, borderRadius: 999,
      background: on ? p.accent : p.line,
      position:'relative', cursor:'pointer',
      transition:'background .2s',
    }}>
      <div style={{
        position:'absolute', top: 3, left: on ? 21 : 3,
        width: 20, height: 20, borderRadius:'50%', background:'#fff',
        transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)',
      }} />
    </div>
  );
}

function Chips({ items, active, p, fonts, r }) {
  return (
    <div style={{ display:'flex', gap: 6, flexWrap:'wrap' }}>
      {items.map((it, i) => {
        const on = active.includes(i);
        return (
          <div key={it} style={{
            padding:'6px 12px',
            background: on ? p.accent : p.surface,
            color: on ? p.accentInk : p.ink,
            border: on ? 'none' : `1px solid ${p.line}`,
            borderRadius: 999,
            fontSize: 12, fontWeight: 500,
            fontFamily: fonts.body,
            cursor:'pointer',
          }}>{it}</div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Navigation
// ─────────────────────────────────────────────────────────────────────────────

function NavCard({ theme, p, fonts, radius }) {
  return (
    <CardShell p={p} fonts={fonts}>
      <Eyebrow p={p} fonts={fonts}>06 · Navigation</Eyebrow>
      <div style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700,
        letterSpacing: '-0.02em', color: p.ink, marginBottom: 22 }}>
        내비게이션
      </div>

      {/* Top nav (web) */}
      <Eyebrow p={p} fonts={fonts}>Top nav · web</Eyebrow>
      <div style={{
        background: p.surface, borderRadius: radius,
        border:`1px solid ${p.line}`, padding:'14px 20px',
        display:'flex', alignItems:'center', gap: 24,
        marginBottom: 24,
      }}>
        <div style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 700,
          letterSpacing:'-0.02em', color: p.ink }}>
          barofarm
        </div>
        <div style={{ display:'flex', gap: 18, fontSize: 13, color: p.inkSoft, flex: 1 }}>
          <div style={{ color: p.accent, fontWeight: 600 }}>지금 경매</div>
          <div>예고 경매</div>
          <div>산지 농가</div>
          <div>구매내역</div>
        </div>
        <div style={{ fontSize: 12, color: p.inkMute, fontFamily: fonts.mono }}>박OO 농부님</div>
      </div>

      {/* Tabs */}
      <Eyebrow p={p} fonts={fonts}>Tabs</Eyebrow>
      <div style={{
        display:'flex', gap: 0, borderBottom: `1px solid ${p.line}`,
        marginBottom: 24,
      }}>
        {['전체', '과일', '채소', '곡물', '축산'].map((t, i) => (
          <div key={t} style={{
            padding:'12px 16px',
            fontSize: 13,
            fontWeight: i === 0 ? 600 : 400,
            color: i === 0 ? p.ink : p.inkMute,
            borderBottom: i === 0 ? `2px solid ${p.accent}` : '2px solid transparent',
            marginBottom: -1,
            cursor:'pointer',
          }}>{t}</div>
        ))}
      </div>

      {/* Bottom nav (mobile) */}
      <Eyebrow p={p} fonts={fonts}>Tab bar · mobile</Eyebrow>
      <div style={{
        background: p.surface, borderRadius: radius,
        border:`1px solid ${p.line}`,
        padding:'10px 14px',
        display:'flex', justifyContent:'space-around',
      }}>
        {[
          { label:'홈', icon:'●', on:true },
          { label:'경매', icon:'◆' },
          { label:'관심', icon:'♡' },
          { label:'내정보', icon:'○' },
        ].map(it => (
          <div key={it.label} style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap: 3,
            color: it.on ? p.accent : p.inkMute,
          }}>
            <div style={{ fontSize: 18, lineHeight: 1 }}>{it.icon}</div>
            <div style={{ fontSize: 10, fontWeight: it.on ? 600 : 400 }}>{it.label}</div>
          </div>
        ))}
      </div>

      {/* Breadcrumb */}
      <div style={{ marginTop: 24, fontSize: 12, color: p.inkMute, fontFamily: fonts.mono }}>
        홈 / 채소 / <span style={{ color: p.ink }}>강원 평창 옥수수 10kg</span>
      </div>
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Live auction component (signature piece)
// ─────────────────────────────────────────────────────────────────────────────

function AuctionCard({ theme, p, fonts, radius }) {
  return (
    <CardShell p={p} fonts={fonts} padding={24}>
      <Eyebrow p={p} fonts={fonts}>07 · Signature · live auction</Eyebrow>
      <div style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700,
        letterSpacing: '-0.02em', color: p.ink, marginBottom: 22 }}>
        라이브 경매 카드
      </div>

      <div style={{
        background: p.surface, borderRadius: radius * 1.4,
        border: `1px solid ${p.line}`,
        overflow:'hidden',
      }}>
        {/* image placeholder */}
        <div style={{
          aspectRatio: '16/9',
          background: `repeating-linear-gradient(135deg, ${p.surfaceAlt}, ${p.surfaceAlt} 8px, ${p.bgAlt} 8px, ${p.bgAlt} 16px)`,
          position:'relative',
          display:'flex', alignItems:'flex-end', padding: 16,
        }}>
          <div style={{
            position:'absolute', top: 14, left: 14,
            display:'flex', alignItems:'center', gap: 6,
            background: p.live, color:'#fff',
            padding:'5px 10px', borderRadius: 4,
            fontFamily: fonts.mono, fontSize: 11, fontWeight: 600,
            letterSpacing:'0.08em',
          }}>
            <Pulse color="#fff" /> LIVE
          </div>
          <div style={{
            position:'absolute', top: 14, right: 14,
            background: 'rgba(0,0,0,0.55)', color:'#fff',
            padding:'5px 10px', borderRadius: 4,
            fontFamily: fonts.mono, fontSize: 11, fontWeight: 500,
          }}>
            01:42
          </div>
          <div style={{
            fontFamily: fonts.mono, fontSize: 10, color: p.inkMute,
            background: p.bg, padding:'3px 8px', borderRadius: 3,
          }}>product photo</div>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: p.ink, letterSpacing:'-0.01em' }}>
              강원 평창 찰옥수수 10kg
            </div>
            <div style={{ fontSize: 11, color: p.inkMute, fontFamily: fonts.mono }}>
              김OO 농부님
            </div>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: p.inkSoft }}>
            오늘 새벽 5시 수확 · 해발 700m
          </div>

          <div style={{ marginTop: 14, display:'flex', alignItems:'baseline', gap: 8 }}>
            <div style={{ fontFamily: fonts.display, fontSize: 32, fontWeight: 700,
              color: p.ink, letterSpacing:'-0.02em', lineHeight: 1 }}>
              14,500
            </div>
            <div style={{ fontSize: 14, color: p.inkSoft }}>원</div>
            <div style={{ marginLeft:'auto', fontSize: 12, color: p.success, fontWeight: 600 }}>
              ↑ +500원
            </div>
          </div>
          <div style={{ fontSize: 11, color: p.inkMute, fontFamily: fonts.mono, marginTop: 4 }}>
            12명 입찰 중 · 즉시낙찰 18,000원
          </div>

          <div style={{
            marginTop: 16, display:'flex', gap: 8,
          }}>
            <button style={{
              flex: 1, background: p.accent, color: p.accentInk, border:'none',
              padding:'14px 0', borderRadius: theme.id==='soilSun'?999:theme.id==='auctionHall'?2:radius,
              fontFamily: fonts.body, fontSize: 15, fontWeight: 700,
            }}>+500원 입찰</button>
            <button style={{
              background: p.surfaceAlt, color: p.ink, border:`1px solid ${p.line}`,
              padding:'14px 18px',
              borderRadius: theme.id==='soilSun'?999:theme.id==='auctionHall'?2:radius,
              fontFamily: fonts.body, fontSize: 14, fontWeight: 500,
            }}>♡</button>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Voice & tone
// ─────────────────────────────────────────────────────────────────────────────

function VoiceCard({ theme, p, fonts, radius }) {
  return (
    <CardShell p={p} fonts={fonts}>
      <Eyebrow p={p} fonts={fonts}>08 · Voice & tone</Eyebrow>
      <div style={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700,
        letterSpacing: '-0.02em', color: p.ink, marginBottom: 8 }}>
        보이스 & 톤
      </div>
      <div style={{ fontSize: 13, color: p.inkSoft, marginBottom: 22 }}>
        {theme.voice.title}
      </div>

      <div style={{
        background: p.surface, border: `1px solid ${p.line}`,
        borderLeft: `3px solid ${p.accent}`,
        borderRadius: radius, padding: 18, marginBottom: 18,
      }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 10, letterSpacing:'0.08em',
          color: p.success, textTransform:'uppercase', marginBottom: 10 }}>
          ✓ 이렇게 써요
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
          {theme.voice.lines.map((l, i) => (
            <div key={i} style={{ fontSize: 15, color: p.ink, lineHeight: 1.5 }}>
              "{l}"
            </div>
          ))}
        </div>
      </div>

      <div style={{
        background: p.surface, border: `1px solid ${p.line}`,
        borderLeft: `3px solid ${p.danger}`,
        borderRadius: radius, padding: 18, marginBottom: 22,
      }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 10, letterSpacing:'0.08em',
          color: p.danger, textTransform:'uppercase', marginBottom: 10 }}>
          ✕ 피해요
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
          {theme.voice.avoid.map((l, i) => (
            <div key={i} style={{ fontSize: 14, color: p.inkMute,
              textDecoration:'line-through' }}>
              {l}
            </div>
          ))}
        </div>
      </div>

      <div>
        <Eyebrow p={p} fonts={fonts}>Principles</Eyebrow>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12 }}>
          {[
            ['산지의 언어로', '농부가 직접 쓴 듯이'],
            ['숫자는 정확히', '입찰가, 수확일, 거리'],
            ['재촉하지 않기', '경매는 충분한 시간'],
            ['투명하게', '농가 이름·재배 방식 공개'],
          ].map(([t, s]) => (
            <div key={t} style={{
              padding: 12, background: p.surface,
              border: `1px solid ${p.line}`, borderRadius: radius,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: p.ink }}>{t}</div>
              <div style={{ fontSize: 11, color: p.inkMute, marginTop: 3 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </CardShell>
  );
}

// Export
Object.assign(window, {
  CardShell, Eyebrow,
  BrandCover, ColorCard, TypeCard, SpacingCard,
  ButtonCard, FormCard, NavCard, AuctionCard, VoiceCard,
});
