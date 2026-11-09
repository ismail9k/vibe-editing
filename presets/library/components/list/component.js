export default {
  draw(p, { t, props, place }) {
    const items = (Array.isArray(props.items) ? props.items : []).map(String);
    const box = place({ y: 0.38, w: 0.84 }), pad = p.rem * 1.4, row = p.rem * 2.6;
    const head = props.title ? p.rem * 3 : 0;
    const h = pad * 2 + head + items.length * row - p.rem * 0.6;
    p.panel({ x: box.left, y: box.y, w: box.w, h }, { progress: p.enter(t, 'default') });
    const rtl = p.dir === 'rtl', start = rtl ? box.right - pad : box.left + pad, inner = box.w - pad * 2;
    let y = box.y + pad;
    if (props.title) { p.text(String(props.title), start, y + p.rem * 1.6, { role: 'display', size: p.rem * 1.7, weight: 700, maxWidth: inner }); y += head; }
    const stagger = Number(props.stagger) || 0.7;
    const landed = items.filter((_, i) => t >= 0.3 + i * stagger).length;
    items.forEach((item, i) => {
      const k = p.enter(t - 0.3 - i * stagger, 'snappy');
      if (k <= 0) return;
      const ry = y + i * row + (1 - k) * p.rem * 0.8;
      p.ctx.save(); p.ctx.globalAlpha *= Math.min(1, k * 1.5);
      const dot = p.rem * 0.55, current = i === landed - 1;
      p.pill({ x: rtl ? start - dot : start, y: ry + p.rem * 0.55, w: dot, h: dot }, { fill: current ? p.brand.colors.accent : p.theme.muted, radius: p.rem * 0.12 });
      p.text(item, rtl ? start - dot * 2 : start + dot * 2, ry + p.rem * 1.15, { role: 'body', size: p.rem * 1.15, weight: current ? 600 : 400, color: current ? p.theme.text : p.theme.muted, maxWidth: inner - dot * 2 });
      p.ctx.restore();
    });
  },
};
