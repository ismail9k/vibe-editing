// A callout: an orange dot on the spot, a leader line elbowing up and out, the label typed at its end.
export default {
  draw(p, { t, props }) {
    const px = Math.min(1, Math.max(0, Number(props.tx ?? 0.5))) * p.W, py = Math.min(1, Math.max(0, Number(props.ty ?? 0.5))) * p.H;
    const leftward = (props.side === 'end') === (p.dir === 'rtl');
    const s = leftward ? -1 : 1, text = String(props.text ?? '');
    const k = p.enter(t, 'snappy'), r = p.rem * 0.45;
    p.pill({ x: px - r * k, y: py - r * k, w: r * 2 * k, h: r * 2 * k }, { fill: p.brand.colors.accent, stroke: p.theme.text });
    const ex = px + s * p.rem * 3, ey = py - p.rem * 3, tx = Math.min(p.W - p.rem, Math.max(p.rem, ex + s * p.rem * 4));
    p.line([[px, py], [ex, ey], [tx, ey]], { color: p.theme.text, width: p.rem * 0.12, progress: p.enter(t - 0.15, 'default') });
    if (t > 0.5) {
      const label = { role: 'display', size: p.rem * 1.4, weight: 700 };
      const w = p.measure(text, label) + p.rem * 1.6, lx = Math.min(p.W - w - p.rem * 0.5, Math.max(p.rem * 0.5, s > 0 ? tx : tx - w));
      p.panel({ x: lx, y: ey - p.rem * 1.5, w, h: p.rem * 3 }, { progress: p.enter(t - 0.5, 'default') });
      p.text(text, p.dir === 'rtl' ? lx + w - p.rem * 0.8 : lx + p.rem * 0.8, ey + p.rem * 0.5, { ...label,
        progress: Math.max(0, Math.min(1, ((t - 0.6) * 24) / Math.max(1, [...text].length))) });
    }
  },
};
