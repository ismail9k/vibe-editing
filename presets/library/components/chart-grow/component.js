// A bar chart that grows in: bars rise one after another, values count up in mono, one bar is orange.
export default {
  draw(p, { t, props, place }) {
    const values = (Array.isArray(props.values) ? props.values : []).map(Number).map((v) => (Number.isFinite(v) ? v : 0));
    const labels = (Array.isArray(props.labels) ? props.labels : []).map(String);
    const n = values.length;
    if (!n) return;
    const box = place({ y: 0.3, w: 0.86 }), pad = p.rem * 1.4, head = props.title ? p.rem * 3.2 : 0;
    const chartH = p.H * 0.26, h = pad * 2 + head + chartH + p.rem * 2.4;
    p.panel({ x: box.left, y: box.y, w: box.w, h }, { progress: p.enter(t, 'default') });
    const rtl = p.dir === 'rtl', inner = box.w - pad * 2;
    if (props.title) p.text(String(props.title), rtl ? box.right - pad : box.left + pad, box.y + pad + p.rem * 1.6, { role: 'display', size: p.rem * 1.7, weight: 700, maxWidth: inner });
    const base = box.y + pad + head + chartH, max = Math.max(...values, 1);
    const gap = p.rem * 0.8, bw = (inner - gap * (n - 1)) / n;
    const hl = Math.round(Number(props.highlight) || 0), lit = hl >= 1 && hl <= n ? hl - 1 : n - 1;
    p.rule(box.left + pad, base, inner, { color: p.theme.border, progress: p.enter(t - 0.1, 'default') });
    values.forEach((v, i) => {
      const k = p.enter(t - 0.35 - i * 0.18, 'heavy');
      const slot = rtl ? n - 1 - i : i, x = box.left + pad + slot * (bw + gap), bh = (chartH - p.rem * 2) * (v / max) * k;
      if (bh > 0.5) p.pill({ x, y: base - bh, w: bw, h: bh }, { fill: i === lit ? p.brand.colors.accent : p.theme.raised, stroke: i === lit ? undefined : p.theme.border, radius: Math.min(p.rem * 0.4, bw / 2) });
      if (k > 0.02) p.text(`${Math.round(v * Math.min(1, k))}${props.unit ?? ''}`, x + bw / 2, base - bh - p.rem * 0.5, { role: 'mono', size: p.rem * 0.95, weight: 600, align: 'center', color: i === lit ? p.theme.text : p.theme.muted });
      if (labels[i]) p.text(labels[i], x + bw / 2, base + p.rem * 1.5, { role: 'body', size: p.rem * 0.85, align: 'center', color: p.theme.muted, maxWidth: bw + gap });
    });
  },
};
