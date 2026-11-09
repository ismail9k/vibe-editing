export default {
  draw(p, { t, props, place }) {
    const box = place({ y: 0.42, w: 0.7 }), h = p.rem * 8;
    const k = p.enter(t, 'default');
    p.panel({ x: box.left, y: box.y, w: box.w, h }, { variant: 'feature', progress: k });
    let value = String(props.value);
    const m = value.match(/^(\D*)([\d.,]+)(.*)$/);
    if (props.count && m) {
      const target = parseFloat(m[2].replace(/,/g, '')), decimals = (m[2].split('.')[1] || '').length;
      const n = target * p.m.tween(t, 0.15, 1.1);
      value = m[1] + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + m[3];
    }
    const pad = p.rem * 1.4, start = p.dir === 'rtl' ? box.right - pad : box.left + pad;
    p.ctx.save(); p.ctx.globalAlpha *= Math.min(1, k * 1.4);
    p.text(value, start, box.y + p.rem * 4.6, { role: 'display', size: p.rem * 4, weight: 700, maxWidth: box.w - pad * 2 });
    p.text(String(props.label), start, box.y + p.rem * 6.4, { role: 'body', size: p.rem * 1.05, color: p.theme.muted, maxWidth: box.w - pad * 2 });
    if (props.source) p.text(String(props.source), start, box.y + h + p.rem * 1.1, { role: 'mono', size: p.rem * 0.7, color: p.theme.muted });
    p.ctx.restore();
  },
};
