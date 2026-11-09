// A name tag in the lower third: the green bar slides in from the reading-start edge, the name types onto it,
// the role lands underneath with the accent rule.
export default {
  draw(p, { t, props, place }) {
    const name = String(props.name ?? ''), role = String(props.role ?? '');
    const box = place({ x: 0.5, y: 0.66, w: 0.86 }), rtl = p.dir === 'rtl';
    const size = p.rem * 1.7, padX = p.rem * 1.1, h = size * 1.9;
    const w = Math.min(box.w, p.measure(name, { role: 'display', size, weight: 700 }) + padX * 2 + size * 0.3);
    const k = p.enter(t, 'heavy'), slide = (1 - k) * p.rem * 4 * (rtl ? 1 : -1);
    const x = (rtl ? box.right - w : box.left) + slide;
    p.ctx.save(); p.ctx.globalAlpha *= Math.min(1, k * 2);
    p.pill({ x, y: box.y, w, h }, { fill: p.brand.colors.primary, radius: p.rem * 0.5 });
    p.text(name, rtl ? x + w - padX : x + padX, box.y + h * 0.66, { role: 'display', size, weight: 700, color: p.brand.colors.onPrimary, maxWidth: w - padX * 2,
      progress: Math.max(0, Math.min(1, ((t - 0.25) * 22) / Math.max(1, [...name].length))) });
    p.ctx.restore();
    if (role) {
      const r = p.enter(t - 0.6, 'default');
      if (r <= 0) return;
      p.rule(rtl ? box.right : box.left, box.y + h + p.rem * 0.7, p.rem * 2.4, { progress: r });
      p.ctx.save(); p.ctx.globalAlpha *= Math.min(1, r * 1.5);
      p.text(role, box.start, box.y + h + p.rem * 2.3, { role: 'body', size: p.rem * 1.05, color: p.theme.text, maxWidth: box.w });
      p.ctx.restore();
    }
  },
};
