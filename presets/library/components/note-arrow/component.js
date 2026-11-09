// A note and an arrow: the note is typed on one side of you, then a curved arrow draws from under it to your head
// (or your middle) and gets its head. Lines and text go through the painter, so the style decides how they look.
const clamp = (v) => Math.min(1, Math.max(0, v));

/** Points along a curve from a to b that bows outwards (a quadratic through a raised midpoint). */
export function curve(a, b, bow, n = 24) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * bow, cy = my + (dx / len) * bow, pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, g = 1 - f;
    pts.push([g * g * a[0] + 2 * g * f * cx + f * f * b[0], g * g * a[1] + 2 * g * f * cy + f * f * b[1]]);
  }
  return pts;
}

export default {
  draw(p, { t, props, place }) {
    const rtl = p.dir === 'rtl', end = props.side !== 'start', right = end !== rtl, rem = p.rem;
    const box = place({ x: right ? 0.76 : 0.24, y: 0.14, w: 0.4 }), s = p.subjectBox();
    const word = String(props.text ?? ''), size = rem * 1.8;
    const typed = clamp((t * 18) / Math.max(1, word.length));
    p.text(word, box.x, box.y + size, { role: 'display', size, weight: 700, align: 'center', maxWidth: box.w, wrap: true, progress: typed });
    const target = props.at === 'body'
      ? [s.x + s.w / 2 + (right ? 1 : -1) * s.w * 0.22, s.y + s.h * 0.45]
      : [s.head.x + (right ? 1 : -1) * s.head.r * 1.25, s.head.y];
    const from = [box.x + (right ? -1 : 1) * box.w * 0.1, box.y + size * 1.9];
    const pts = curve(from, target, (right ? -1 : 1) * rem * 4);
    const k = clamp((t - word.length / 18 - 0.1) / 0.5), color = p.theme.text, width = rem * 0.2;
    if (k <= 0) return;
    p.line(pts, { color, width, progress: k });
    if (k >= 1) {
      // The arrowhead: two strokes back along the curve's last stretch.
      const [x1, y1] = pts[pts.length - 1], [x0, y0] = pts[pts.length - 4], a = Math.atan2(y1 - y0, x1 - x0), h = rem * 0.9;
      for (const d of [-0.55, 0.55]) p.line([[x1, y1], [x1 - Math.cos(a + d) * h, y1 - Math.sin(a + d) * h]], { color, width });
    }
  },
};
