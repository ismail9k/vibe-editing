// Count the lines a text wraps into at a width, so the panel can be sized before drawing.
function lineCount(p, str, o, width) {
  let lines = 0, cur = '';
  for (const word of str.split(/\s+/).filter(Boolean)) {
    const next = cur ? cur + ' ' + word : word;
    if (cur && p.measure(next, o) > width) { lines++; cur = word; } else cur = next;
  }
  return lines + (cur ? 1 : 0);
}

export default {
  draw(p, { t, props, place }) {
    const box = place({ y: 0.42, w: 0.84 }), pad = p.rem * 1.4, inner = box.w - pad * 2;
    const title = String(props.title), body = String(props.body || '');
    const to = { role: 'display', size: p.rem * 1.8, weight: 700 }, bo = { role: 'body', size: p.rem * 1.05 };
    const tl = lineCount(p, title, to, inner), bl = body ? lineCount(p, body, bo, inner) : 0;
    const top = props.badge ? p.rem * 2.4 : 0;
    const h = pad * 2 + top + tl * to.size * 1.15 + (bl ? p.rem * 0.6 + bl * bo.size * 1.4 : 0);
    const k = p.enter(t, 'default');
    p.panel({ x: box.left, y: box.y, w: box.w, h }, { progress: k });
    const start = p.dir === 'rtl' ? box.right - pad : box.left + pad;
    let y = box.y + pad;
    if (props.badge) { p.badge(String(props.badge), start, y, { variant: 'tag' }); y += top; }
    const cps = 26, tlen = [...title].length;
    p.text(title, start, y + to.size * 0.9, { ...to, maxWidth: inner, wrap: true, lineHeight: 1.15, progress: Math.min(1, (t - 0.15) * cps / tlen) });
    if (body) {
      const kb = p.enter(t - 0.15 - tlen / cps, 'default');
      p.ctx.save(); p.ctx.globalAlpha *= kb;
      p.text(body, start, y + tl * to.size * 1.15 + p.rem * 0.6 + bo.size, { ...bo, color: p.theme.muted, maxWidth: inner, wrap: true, lineHeight: 1.4 });
      p.ctx.restore();
    }
  },
};
