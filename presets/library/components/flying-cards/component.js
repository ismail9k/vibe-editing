// A deck dealt at the camera: cards fly in from alternating sides, spinning, and settle into a fan low in the
// frame; above them the total counts up as they land.
const clamp = (v) => Math.min(1, Math.max(0, v));

export default {
  draw(p, { t, props }) {
    const cards = (Array.isArray(props.cards) ? props.cards : []).map(String);
    const n = Math.max(1, cards.length), each = Math.max(0.04, Number(props.each) || 0.14), rem = p.rem, c = p.ctx;
    const count = Math.max(0, Number(props.count) || 0), rtl = p.dir === 'rtl';

    // The count runs while the cards are dealt, and lands with the last one.
    const dealt = clamp((t - 0.2) / (n * each + 0.4)), shownN = Math.round(count * (1 - (1 - dealt) ** 3));
    // The number and its label on a panel high in the frame, clear of your face and readable over footage.
    const k0 = p.enter(t, 'heavy'), top = p.H * 0.08, ph = props.label ? rem * 9.4 : rem * 7;
    p.panel({ x: p.W * 0.12, y: top, w: p.W * 0.76, h: ph }, { progress: k0 });
    c.save(); c.globalAlpha *= k0;
    p.text(String(shownN), p.W / 2, top + rem * 6, { role: 'display', size: rem * 6, weight: 900, align: 'center', color: p.brand.colors.accent });
    if (props.label) p.text(String(props.label), p.W / 2, top + rem * 8.2, { size: rem * 1.6, weight: 700, align: 'center', maxWidth: p.W * 0.7 });
    c.restore();

    const w = p.W * 0.44, h = w * 0.62, mid = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const local = t - 0.25 - i * each;
      if (local <= 0) continue;
      const k = p.enter(local, 'snappy'), from = (i % 2 ? 1 : -1) * (rtl ? -1 : 1);
      const off = i - mid, tx = p.W / 2 + off * rem * 1.1, ty = p.H * 0.62 + Math.abs(off) * rem * 0.35, tr = off * 0.09;
      const x = tx + (1 - k) * from * p.W * 0.9, y = ty + (1 - k) * p.H * 0.25, rot = tr + (1 - k) * from * 1.2;
      c.save();
      c.translate(x, y); c.rotate(rot);
      const lit = i === n - 1;
      p.panel({ x: -w / 2, y: -h / 2, w, h }, { variant: lit ? 'feature' : 'default' });
      if (cards[i]) p.text(cards[i], rtl ? w / 2 - rem : -w / 2 + rem, -h / 2 + rem * 1.8, { size: rem * 1.2, weight: 700, maxWidth: w - rem * 2, color: lit ? p.brand.colors.accent : p.theme.text });
      for (let l = 0; l < 3; l++) p.rule(-w / 2 + rem, -h / 2 + rem * (3 + l * 1.1), (w - rem * 2) * (l === 2 ? 0.6 : 1), { color: p.theme.border });
      c.restore();
    }
  },
};
