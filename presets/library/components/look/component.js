// One look over a beat: a hard edge sweeps the look across the plain shot in the reading direction, the look
// holds, and it sweeps back off at the end.
const WIPE = 0.35;
const clamp = (v) => Math.min(1, Math.max(0, v));

export default {
  draw(p, { t, dur, props }) {
    const look = String(props.look);
    const k = props.wipe ? Math.min(clamp(t / WIPE), clamp((dur - t) / WIPE)) : 1;
    if (k >= 1) { p.footage({ look }); return; }
    const e = k * k * (3 - 2 * k), w = p.W * e, x = p.dir === 'rtl' ? p.W - w : 0;
    p.footage();
    const c = p.ctx;
    c.save();
    c.beginPath(); c.rect(x, 0, w, p.H); c.clip();
    p.footage({ look });
    c.restore();
    const edge = p.dir === 'rtl' ? x : x + w, bar = p.rem * 0.15;
    p.pill({ x: edge - bar / 2, y: 0, w: bar, h: p.H }, { fill: p.brand.colors.accent, radius: 0 });
  },
};
