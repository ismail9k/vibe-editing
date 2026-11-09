// A pull quote in a card: a big opening mark in the accent, the quote typed in display type, the source under a rule.
export default {
  draw(p, { t, props, place }) {
    const text = String(props.text ?? ''), by = String(props.by ?? '');
    const box = place({ y: 0.3, w: 0.86 }), pad = p.rem * 1.6, inner = box.w - pad * 2, rtl = p.dir === 'rtl';
    const start = rtl ? box.right - pad : box.left + pad, size = p.rem * 2;
    // Count lines with the style's own measure, so a style that changes the face (serif, mono) still fits the card.
    let lines = 1, cur = '';
    for (const word of text.split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && p.measure(next, { role: 'display', size, weight: 700 }) > inner) { lines++; cur = word; } else cur = next;
    }
    const markH = p.rem * 3, textH = lines * size * 1.15, h = pad * 2 + markH + textH + (by ? p.rem * 2.6 : 0);
    p.panel({ x: box.left, y: box.y, w: box.w, h }, { progress: p.enter(t, 'default') });
    const m = p.enter(t - 0.1, 'snappy');
    p.ctx.save(); p.ctx.globalAlpha *= m;
    p.text(rtl ? '”' : '“', start, box.y + pad + markH * 0.95, { role: 'serif', size: p.rem * 5, weight: 700, color: p.brand.colors.accent });
    p.ctx.restore();
    const typed = Math.max(0, Math.min(1, ((t - 0.3) * 26) / Math.max(1, [...text].length)));
    p.text(text, start, box.y + pad + markH + size * 0.9, { role: 'display', size, weight: 700, maxWidth: inner, wrap: true, lineHeight: 1.15, progress: typed });
    if (by && typed >= 1) {
      const k = p.enter(t - 0.3 - [...text].length / 26, 'default');
      p.ctx.save(); p.ctx.globalAlpha *= Math.min(1, k * 1.5);
      p.text(`— ${by}`, start, box.y + h - pad - p.rem * 0.2, { role: 'body', size: p.rem * 1.05, color: p.theme.muted, maxWidth: inner });
      p.ctx.restore();
    }
  },
};
