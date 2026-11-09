export default {
  draw(p, { t, props, place }) {
    const box = place({ y: 0.12, w: 0.86 });
    const size = p.rem * Number(props.size || 3), cps = 22;
    const len = [...String(props.text)].length;
    const typing = Math.min(1, (t * cps) / Math.max(1, len));
    const { h } = p.text(String(props.text), box.start, box.y + size, { role: 'display', size, weight: 700, maxWidth: box.w, wrap: true, lineHeight: 1.08, progress: typing });
    if (props.sub) {
      const k = p.enter(t - len / cps - 0.1, 'default');
      p.ctx.save(); p.ctx.globalAlpha *= k;
      p.text(String(props.sub), box.start, box.y + size + h + p.rem * 0.4 + (1 - k) * p.rem, { role: 'body', size: p.rem * 1.2, color: p.theme.muted, maxWidth: box.w });
      p.ctx.restore();
    }
  },
};
