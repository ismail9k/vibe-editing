// A game HUD: score (counting up in whole steps, zero-padded like an arcade), level, and hearts drawn from a pixel
// map. Lost hearts blink for half a second and then go hollow. Everything snaps to the pixel grid.
const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
const clamp = (v) => Math.min(1, Math.max(0, v));

/** The score shown at time t: it counts up over the first 1.2 s in 20 steps, padded to six digits. */
export function scoreAt(score, t) {
  const n = Math.max(0, Math.round(Number(score) || 0)), f = Math.floor(clamp(t / 1.2) * 20) / 20;
  return String(Math.round(n * f)).padStart(6, '0');
}

/** How many hearts are full at time t, and whether the one being lost is lit (it blinks before it goes). */
export function heartsAt(hearts, lose, at, t) {
  const total = Math.max(0, Math.round(hearts)), gone = Math.min(total, Math.max(0, Math.round(lose)));
  if (!gone || t < at) return { full: total, blink: false };
  if (t < at + 0.5) return { full: total - gone, blink: Math.floor((t - at) * 10) % 2 === 0 };
  return { full: total - gone, blink: false };
}

export default {
  draw(p, { t, props, place }) {
    const box = place({ y: 0.05, w: 0.9 }), c = p.ctx, rem = p.rem, rtl = p.dir === 'rtl';
    const k = p.enter(t, 'snappy');
    if (k <= 0) return;
    const u = Math.max(2, Math.round(rem * 0.24)), snap = (v) => Math.round(v / u) * u, y = snap(box.y + (1 - k) * -rem * 2);
    const size = rem * 1.3, mono = { role: 'mono', size, weight: 700 };
    c.save();
    c.globalAlpha *= k;
    // The HUD's dark strip, so it reads over any shot; pixel-stepped at its bottom edge.
    c.fillStyle = p.theme.bg; c.globalAlpha *= 0.82;
    c.fillRect(0, 0, p.W, y + size * 1.55);
    for (let x = 0; x < p.W; x += u * 2) c.fillRect(x, y + size * 1.55, u, u);
    c.globalAlpha /= 0.82;
    p.text(`${props.label ?? ''} ${scoreAt(props.score, t)}`.trim(), box.start, y + size, { ...mono, color: p.theme.text });
    if (props.level) p.text(String(props.level), box.x, y + size, { ...mono, size: size * 0.8, color: p.theme.muted, align: 'center' });
    const { full, blink } = heartsAt(Number(props.hearts) || 0, Number(props.lose) || 0, Number(props.at) || 0, t);
    const total = Math.max(0, Math.round(Number(props.hearts) || 0)), hw = 7 * u, gap = u * 2;
    for (let i = 0; i < total; i++) {
      // Hearts read from the end edge inwards, so the one lost is the innermost full one.
      const hx = rtl ? box.end + i * (hw + gap) : box.end - (i + 1) * hw - i * gap;
      const lit = i < full || (blink && i < full + Math.max(0, Math.round(Number(props.lose) || 0)));
      HEART.forEach((row, ry) => [...row].forEach((ch, rx) => {
        if (ch !== 'X') return;
        const edge = ry === 0 || rx === 0 || rx === 6 || HEART[ry - 1]?.[rx] !== 'X' || row[rx - 1] !== 'X' || row[rx + 1] !== 'X' || HEART[ry + 1]?.[rx] !== 'X';
        if (!lit && !edge) return; // a lost heart is just its outline
        c.fillStyle = lit ? p.brand.colors.accent : p.theme.border;
        c.fillRect(snap(hx) + rx * u, y + ry * u + Math.round(size * 0.05), u, u);
      }));
    }
    c.restore();
  },
};
