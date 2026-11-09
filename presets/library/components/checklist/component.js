// A checklist: boxes tick one by one; the newest tick is the shot's accent.
export default {
  draw(p, { t, props, place }) {
    const items = (Array.isArray(props.items) ? props.items : []).map(String);
    const box = place({ y: 0.36, w: 0.84 }), pad = p.rem * 1.4, row = p.rem * 2.8;
    const head = props.title ? p.rem * 3 : 0;
    p.panel({ x: box.left, y: box.y, w: box.w, h: pad * 2 + head + items.length * row - p.rem * 0.8 }, { progress: p.enter(t, 'default') });
    const rtl = p.dir === 'rtl', start = rtl ? box.right - pad : box.left + pad, inner = box.w - pad * 2;
    let y = box.y + pad;
    if (props.title) { p.text(String(props.title), start, y + p.rem * 1.6, { role: 'display', size: p.rem * 1.7, weight: 700, maxWidth: inner }); y += head; }
    const stagger = Number(props.stagger) || 0.8, s = p.rem * 1.3;
    const ticked = items.filter((_, i) => t >= 0.5 + i * stagger).length;
    items.forEach((item, i) => {
      const ry = y + i * row, bx = rtl ? start - s : start;
      p.pill({ x: bx, y: ry, w: s, h: s }, { stroke: p.theme.border, radius: p.rem * 0.25 });
      const k = p.enter(t - 0.5 - i * stagger, 'snappy');
      if (k > 0) {
        const newest = i === ticked - 1;
        p.line([[bx + s * 0.2, ry + s * 0.52], [bx + s * 0.42, ry + s * 0.74], [bx + s * 0.82, ry + s * 0.26]],
          { color: newest ? p.brand.colors.accent : p.theme.primaryText, width: p.rem * 0.2, progress: Math.min(1, k * 1.4) });
      }
      p.text(item, rtl ? start - s * 1.7 : start + s * 1.7, ry + s * 0.78, { role: 'body', size: p.rem * 1.15, weight: i < ticked ? 600 : 400, color: i < ticked ? p.theme.text : p.theme.muted, maxWidth: inner - s * 1.7 });
    });
  },
};
