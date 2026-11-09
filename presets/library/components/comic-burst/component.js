// A comic burst: a jagged star in the accent, with a hard ink shadow and an ink edge, slammed in on the snappy
// spring with a shudder as it lands, and the word on it in black (text on orange is black).

/** The burst's outline around (0, 0): spikes alternate long and short, each a little different, squashed wide. */
export function burstPoints(r, spikes, rng) {
  const n = Math.max(6, Math.round(spikes)) * 2, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2, len = r * (i % 2 ? 0.66 + rng() * 0.06 : 0.9 + rng() * 0.1);
    pts.push([Math.cos(a) * len, Math.sin(a) * len * 0.66]);
  }
  return pts;
}

export default {
  draw(p, { t, props, place }) {
    // Beside the head by default, never on the face.
    const box = place({ x: 0.7, y: 0.05, w: 0.52 }), k = p.enter(t, 'snappy');
    if (k <= 0) return;
    const c = p.ctx, r = box.w / 2, cx = box.x, cy = box.y + r * 0.66, word = String(props.text ?? '');
    const pts = burstPoints(r, Number(props.spikes) || 14, p.rng(`burst${word}`));
    const shudder = Math.sin(t * 40) * 0.04 * Math.max(0, 1 - t * 3);
    const trace = (dx = 0, dy = 0) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x + dx, y + dy) : c.moveTo(x + dx, y + dy))); c.closePath(); };
    c.save();
    c.translate(cx, cy); c.rotate(-0.07 + shudder); c.scale(k, k);
    trace(p.rem * 0.35, p.rem * 0.35); c.fillStyle = p.brand.colors.ink; c.fill();
    trace(); c.fillStyle = p.brand.colors.accent; c.fill();
    c.lineJoin = 'miter'; c.lineWidth = p.rem * 0.18; c.strokeStyle = p.brand.colors.ink; c.stroke();
    if (word) {
      const size = p.fit(word, { role: 'display', size: r * 0.42, weight: 700, maxWidth: r * 1.1 });
      p.text(word, 0, size * 0.36, { role: 'display', size, weight: 700, color: p.brand.colors.onAccent, align: 'center' });
    }
    c.restore();
  },
};
