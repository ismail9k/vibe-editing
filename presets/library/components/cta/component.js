export default {
  draw(p, { t, props, place }) {
    const box = place({ y: 0.4, w: 0.84 }), pad = p.rem * 1.6, h = p.rem * 11;
    const k = p.enter(t, 'default');
    p.ctx.save(); p.ctx.globalAlpha *= Math.min(1, k * 1.5);
    p.pill({ x: box.left, y: box.y + (1 - k) * p.rem, w: box.w, h }, { fill: p.brand.colors.primary, radius: p.rem });
    const rtl = p.dir === 'rtl', start = rtl ? box.right - pad : box.left + pad;
    const text = String(props.text), cps = 26;
    p.text(text, start, box.y + pad + p.rem * 1.5, { role: 'display', size: p.rem * 1.7, weight: 700, color: p.brand.colors.onPrimary, maxWidth: box.w - pad * 2 - (props.nino ? p.rem * 5 : 0), wrap: true, lineHeight: 1.15, progress: Math.min(1, (t - 0.2) * cps / [...text].length) });
    const kb = p.enter(t - 0.3 - [...text].length / cps, 'snappy');
    if (kb > 0 && props.button) {
      p.ctx.save(); p.ctx.globalAlpha *= Math.min(1, kb * 2);
      p.button(String(props.button), start, box.y + h - pad - p.rem * 2.75 + (1 - kb) * p.rem * 0.6, { variant: 'accent' });
      p.ctx.restore();
    }
    if (props.nino) {
      const size = p.rem * 4.2, nx = rtl ? box.left + pad * 0.6 : box.right - pad * 0.6 - size;
      p.nino(nx, box.y + h - size - pad * 0.4, size, { expression: kb > 0 ? 'happy' : 'idle', t, white: true });
    }
    p.ctx.restore();
  },
};
