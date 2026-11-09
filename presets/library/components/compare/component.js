// Before / after, stacked for a tall frame: the "before" card lands muted, an arrow draws down, the "after" card
// lands lit with the accent underline under its value.
export default {
  draw(p, { t, props, place }) {
    const box = place({ y: 0.24, w: 0.8 }), pad = p.rem * 1.3, h = p.rem * 6.2, gap = p.rem * 3.4;
    const card = (y, label, value, k, lit) => {
      if (k <= 0) return;
      p.panel({ x: box.left, y, w: box.w, h }, { variant: lit ? 'feature' : 'default', progress: k });
      p.ctx.save(); p.ctx.globalAlpha *= Math.min(1, k * 1.5);
      p.text(String(label ?? ''), box.start + (p.dir === 'rtl' ? -pad : pad), y + pad + p.rem * 0.8, { role: 'body', size: p.rem * 0.95, color: p.theme.muted, maxWidth: box.w - pad * 2 });
      const v = String(value ?? '');
      const typed = lit ? Math.max(0, Math.min(1, ((t - 1.4) * 18) / Math.max(1, [...v].length))) : 1;
      const r = p.text(v, box.start + (p.dir === 'rtl' ? -pad : pad), y + h - pad - p.rem * 0.3, { role: 'display', size: p.rem * 2.6, weight: 700, color: lit ? p.theme.text : p.theme.muted, maxWidth: box.w - pad * 2, progress: typed });
      if (lit && typed >= 1) p.rule(box.start + (p.dir === 'rtl' ? -pad : pad), y + h - pad + p.rem * 0.2, r.w, { progress: p.enter(t - 1.4 - [...v].length / 18, 'default') });
      p.ctx.restore();
    };
    card(box.y, props.before, props.beforeValue, p.enter(t, 'default'), false);
    const a = p.enter(t - 0.7, 'default'), ax = box.x, ay0 = box.y + h + p.rem * 0.5, ay1 = box.y + h + gap - p.rem * 0.5;
    if (a > 0) {
      p.line([[ax, ay0], [ax, ay1]], { color: p.theme.muted, width: p.rem * 0.14, progress: a });
      if (a > 0.9) p.line([[ax - p.rem * 0.6, ay1 - p.rem * 0.6], [ax, ay1], [ax + p.rem * 0.6, ay1 - p.rem * 0.6]], { color: p.theme.muted, width: p.rem * 0.14 });
    }
    card(box.y + h + gap, props.after, props.afterValue, p.enter(t - 1.1, 'heavy'), true);
  },
};
