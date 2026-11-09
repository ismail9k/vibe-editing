// The shot becomes a phone screen: it shrinks onto the brand background, a bezel closes round it, a line types above.
export default {
  draw(p, { t, props }) {
    const c = p.ctx, k = p.enter(t, 'heavy'), scale = Math.min(0.95, Math.max(0.3, Number(props.scale) || 0.62));
    const s = 1 - (1 - scale) * k, w = p.W * s, h = p.H * s, x = (p.W - w) / 2, y = (p.H - h) / 2 + p.H * 0.06 * k;
    p.background(t);
    const bezel = p.rem * 0.7 * k, r = p.rem * 2.2 * k;
    p.pill({ x: x - bezel, y: y - bezel, w: w + bezel * 2, h: h + bezel * 2 }, { fill: p.brand.colors.ink, stroke: p.theme.border, radius: r + bezel });
    c.save();
    c.beginPath(); c.roundRect(x, y, w, h, r); c.clip();
    p.footage({ rect: { x, y, w, h } });
    c.restore();
    if (k > 0.3) p.pill({ x: p.W / 2 - w * 0.14, y: y + p.rem * 0.5, w: w * 0.28, h: p.rem * 0.9 * k }, { fill: p.brand.colors.ink });
    if (props.label) {
      const str = String(props.label), cps = 24, start = 0.45;
      p.text(str, p.W / 2, y - bezel - p.rem * 1.4, { role: 'display', size: p.rem * 1.6, weight: 700, align: 'center', maxWidth: p.W * 0.86,
        progress: Math.max(0, Math.min(1, ((t - start) * cps) / Math.max(1, [...str].length))) });
    }
  },
};
