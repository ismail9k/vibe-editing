// The closing shot: two rows of tiles, your shot in each look, slide in from the top and the bottom; between
// them the call to action types in, the keyword in quotes and in the accent.
const clamp = (v) => Math.min(1, Math.max(0, v));

export default {
  draw(p, { t, props }) {
    const looks = (Array.isArray(props.looks) ? props.looks : []).map(String);
    const c = p.ctx, rem = p.rem, rtl = p.dir === 'rtl';
    p.background(t);

    const rows = [looks.slice(0, Math.ceil(looks.length / 2)), looks.slice(Math.ceil(looks.length / 2))];
    const per = Math.max(1, rows[0].length), margin = p.W * 0.05, gap = rem * 0.4;
    const tw = (p.W - margin * 2 - gap * (per - 1)) / per, th = (tw * 16) / 9;
    rows.forEach((row, r) => {
      const y0 = r === 0 ? p.H * 0.12 : p.H * 0.88 - th;
      row.forEach((look, i) => {
        const k = p.enter(t - i * 0.06 - r * 0.1, 'snappy');
        const y = y0 + (1 - k) * (r === 0 ? -1 : 1) * (th + p.H * 0.12);
        const x = rtl ? p.W - margin - (i + 1) * tw - i * gap : margin + i * (tw + gap);
        const rect = { x, y, w: tw, h: th };
        c.save();
        c.beginPath(); c.roundRect(x, y, tw, th, rem * 0.35); c.clip();
        p.footage({ look, rect });
        c.restore();
        p.pill(rect, { stroke: p.theme.border, radius: rem * 0.35 });
      });
    });

    // The call to action: "Comment «STYLE»", then the second line.
    const text = String(props.text ?? ''), kw = props.keyword ? `«${props.keyword}»` : '', line = String(props.line ?? '');
    const cps = 20, t0 = 0.4, o = { role: 'display', size: rem * 2.6, weight: 800 };
    const wT = text ? p.measure(text, o) : 0, wK = kw ? p.measure(kw, o) : 0, space = text && kw ? rem * 0.6 : 0;
    const s = rtl ? -1 : 1, x0 = p.W / 2 - (s * (wT + space + wK)) / 2, y = p.H / 2 + rem * 0.6;
    const nT = [...text].length, nK = [...kw].length, nL = [...line].length;
    // Each part types after the one before it, and is drawn only once it has started (no early carets).
    const k1 = ((t - t0) * cps) / Math.max(1, nT), k2 = ((t - t0 - nT / cps) * cps) / Math.max(1, nK), k3 = ((t - t0 - (nT + nK) / cps) * cps) / Math.max(1, nL);
    if (text && k1 > 0) p.text(text, x0, y, { ...o, progress: clamp(k1) });
    if (kw && k2 > 0) p.text(kw, x0 + s * (wT + space), y, { ...o, color: p.brand.colors.accent, progress: clamp(k2) });
    if (line && k3 > 0) p.text(line, p.W / 2, y + rem * 2.6, { size: rem * 1.4, weight: 600, align: 'center', maxWidth: p.W * 0.86, progress: clamp(k3) });
  },
};
