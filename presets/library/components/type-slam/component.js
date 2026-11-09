// Kinetic type: each word drops in from huge (as if thrown at the lens), lands with a short jolt, and either
// replaces the last word or stacks under it.
const clamp = (v) => Math.min(1, Math.max(0, v));

export default {
  draw(p, { t, props }) {
    const words = (Array.isArray(props.words) ? props.words : []).map(String).filter((w) => w.trim());
    if (!words.length) return;
    const each = Math.max(0.15, Number(props.each) || 0.6), rem = p.rem, c = p.ctx;
    const cur = Math.min(words.length - 1, Math.floor(t / each)), accent = Math.round(Number(props.accent) || 0) - 1;
    if (props.backdrop === 'full') p.background(t);
    else if (props.backdrop === 'dim') { c.save(); c.globalAlpha *= 0.6; p.pill({ x: 0, y: 0, w: p.W, h: p.H }, { fill: p.theme.bg, radius: 0 }); c.restore(); }

    const o = (w) => ({ role: 'display', weight: 900, size: p.fit(w, { role: 'display', weight: 900, size: rem * 6, maxWidth: p.W * 0.86 }) });
    const shown = props.stack ? words.slice(0, cur + 1) : [words[cur]];
    const sizes = shown.map((w) => o(w).size), lh = 1.02, total = sizes.reduce((s, v) => s + v * lh, 0);
    let y = p.H / 2 - total / 2;
    shown.forEach((w, j) => {
      const i = props.stack ? j : cur, local = t - i * each, size = sizes[j];
      y += size * lh;
      if (local < 0) return;
      // In from 3× with a fast spring; the jolt after landing dies out in a quarter second.
      const land = p.enter(local, 'snappy'), s = 1 + 2.2 * (1 - land);
      const jolt = Math.max(0, 1 - local / 0.25) * (local > 0.08 ? 1 : 0), r = p.rng(`slam${i}`);
      const dx = (r() - 0.5) * rem * 0.8 * jolt, dy = (r() - 0.5) * rem * 0.8 * jolt;
      c.save();
      c.globalAlpha *= clamp(local / 0.05);
      c.translate(p.W / 2 + dx, y - size * 0.35 + dy); c.scale(s, s);
      p.text(w, 0, 0, { ...o(w), size, align: 'center', baseline: 'middle', color: i === accent ? p.brand.colors.accent : p.theme.text });
      c.restore();
    });
  },
};
