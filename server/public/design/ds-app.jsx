// ds-app.jsx — main app: 3 themes × design system cards in design canvas

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "primaryColor_soilSun":   "#C25A2C",
  "primaryColor_freshField":"#5B7A35",
  "primaryColor_auctionHall":"#D4A017",
  "fontDisplay": "default",
  "radius": 0,
  "density": "regular",
  "dark": false,
  "showThemes": "all"
}/*EDITMODE-END*/;

const FONT_OPTIONS = {
  default: null, // each theme uses its own
  pretendard: "'Pretendard', sans-serif",
  gowun:      "'Gowun Dodum', 'Pretendard', sans-serif",
  serif:      "'Noto Serif KR', serif",
  inter:      "'Inter', sans-serif",
};

function DSApp() {
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Density → padding multiplier
  const densityScale = tw.density === 'compact' ? 0.85
                     : tw.density === 'comfy' ? 1.15 : 1;

  // Build resolved theme list with tweaks applied
  const themes = ['soilSun', 'freshField', 'auctionHall'].map(id => {
    const base = THEMES[id];
    const baseFonts = base.fonts;
    const overrideFont = tw.fontDisplay !== 'default' ? FONT_OPTIONS[tw.fontDisplay] : null;
    const fonts = {
      ...baseFonts,
      display: overrideFont || baseFonts.display,
      body:    overrideFont || baseFonts.body,
    };
    const accentOverride = tw[`primaryColor_${id}`];
    const palette = paletteFor(base, tw.dark);
    if (accentOverride) palette.accent = accentOverride;
    const radius = base.radius + (tw.radius * 4); // 0 default, slider -2..+3 etc.
    return { theme: base, p: palette, fonts, radius: Math.max(0, radius), densityScale };
  });

  const visibleThemes = tw.showThemes === 'all' ? themes
                       : themes.filter(t => t.theme.id === tw.showThemes);

  // Card dimensions
  const W = 460, H = 640;
  const WIDE = 720;

  return (
    <>
      <DesignCanvas>
        {visibleThemes.map(({ theme, p, fonts, radius }) => (
          <DCSection key={theme.id} id={theme.id} title={`${theme.name} · ${theme.ko}`}
            subtitle={theme.tagline}>
            <DCArtboard id={`${theme.id}-cover`} label="00 · Cover" width={W} height={H}>
              <BrandCover theme={theme} p={p} fonts={fonts} radius={radius} />
            </DCArtboard>
            <DCArtboard id={`${theme.id}-color`} label="01 · Color" width={WIDE} height={H}>
              <ColorCard theme={theme} p={p} fonts={fonts} radius={radius} />
            </DCArtboard>
            <DCArtboard id={`${theme.id}-type`} label="02 · Type" width={W} height={H}>
              <TypeCard theme={theme} p={p} fonts={fonts} radius={radius} />
            </DCArtboard>
            <DCArtboard id={`${theme.id}-spacing`} label="03 · Spacing" width={W} height={H}>
              <SpacingCard theme={theme} p={p} fonts={fonts} radius={radius} />
            </DCArtboard>
            <DCArtboard id={`${theme.id}-buttons`} label="04 · Buttons" width={W} height={H}>
              <ButtonCard theme={theme} p={p} fonts={fonts} radius={radius} />
            </DCArtboard>
            <DCArtboard id={`${theme.id}-form`} label="05 · Form" width={W} height={H}>
              <FormCard theme={theme} p={p} fonts={fonts} radius={radius} />
            </DCArtboard>
            <DCArtboard id={`${theme.id}-nav`} label="06 · Navigation" width={W} height={H}>
              <NavCard theme={theme} p={p} fonts={fonts} radius={radius} />
            </DCArtboard>
            <DCArtboard id={`${theme.id}-auction`} label="07 · Live auction" width={W} height={H}>
              <AuctionCard theme={theme} p={p} fonts={fonts} radius={radius} />
            </DCArtboard>
            <DCArtboard id={`${theme.id}-slidebid`} label="08 · Slide to bid" width={W} height={H}>
              <SlideBidCard theme={theme} p={p} fonts={fonts} radius={radius} />
            </DCArtboard>
            <DCArtboard id={`${theme.id}-voice`} label="09 · Voice & tone" width={W} height={H}>
              <VoiceCard theme={theme} p={p} fonts={fonts} radius={radius} />
            </DCArtboard>
          </DCSection>
        ))}
      </DesignCanvas>

      <TweaksPanel>
        <TweakSection label="View" />
        <TweakSelect label="Show themes" value={tw.showThemes}
          options={[
            { value: 'all', label: 'All 3 directions' },
            { value: 'soilSun', label: 'A · Soil & Sun' },
            { value: 'freshField', label: 'B · Fresh Field' },
            { value: 'auctionHall', label: 'C · Auction Hall' },
          ]}
          onChange={v => setTweak('showThemes', v)} />
        <TweakToggle label="Dark mode" value={tw.dark}
          onChange={v => setTweak('dark', v)} />

        <TweakSection label="Typography" />
        <TweakSelect label="Display font" value={tw.fontDisplay}
          options={[
            { value: 'default', label: '테마 기본' },
            { value: 'pretendard', label: 'Pretendard' },
            { value: 'gowun', label: 'Gowun Dodum' },
            { value: 'serif', label: 'Noto Serif KR' },
            { value: 'inter', label: 'Inter' },
          ]}
          onChange={v => setTweak('fontDisplay', v)} />

        <TweakSection label="Shape" />
        <TweakSlider label="Radius offset" value={tw.radius} min={-2} max={4} step={1} unit="·"
          onChange={v => setTweak('radius', v)} />
        <TweakRadio label="Density" value={tw.density}
          options={['compact', 'regular', 'comfy']}
          onChange={v => setTweak('density', v)} />

        <TweakSection label="Accent · per theme" />
        <TweakColor label="A · Soil & Sun" value={tw.primaryColor_soilSun}
          onChange={v => setTweak('primaryColor_soilSun', v)} />
        <TweakColor label="B · Fresh Field" value={tw.primaryColor_freshField}
          onChange={v => setTweak('primaryColor_freshField', v)} />
        <TweakColor label="C · Auction Hall" value={tw.primaryColor_auctionHall}
          onChange={v => setTweak('primaryColor_auctionHall', v)} />
      </TweaksPanel>
    </>
  );
}

window.DSApp = DSApp;
