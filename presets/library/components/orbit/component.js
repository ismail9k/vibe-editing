// A ring of words around you at chest height (clear of your face): the half behind you is drawn before you,
// the half in front after.
export default {
  draw(p, { t, props }) {
    const words = (Array.isArray(props.words) ? props.words : []).map(String).filter(Boolean);
    const { head } = p.subjectBox(), k = p.enter(t, 'heavy');
    const rx = head.r * 3 * (0.6 + 0.4 * k), ry = rx * Math.min(1, Math.max(0.05, Number(props.tilt) || 0.3));
    const cx = head.x, cy = head.y + head.r * 2.3, turn = (Number(props.speed) || 0.3) * t;
    const items = words.map((w, i) => { const a = Math.PI * 2 * (i / words.length + turn); return { w, i, x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, front: Math.sin(a) }; });
    const ring = (front) => {
      const pts = [];
      for (let i = 0; i <= 40; i++) { const a = (front ? 0 : Math.PI) + (i / 40) * Math.PI; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
      p.line(pts, { color: front ? p.brand.colors.accent : p.theme.muted, width: p.rem * 0.12, progress: k });
    };
    // Each word types into its badge as the ring opens, one after another (the badge grows with it).
    const cps = 20;
    const word = (it) => {
      const chars = [...it.w], n = Math.round(Math.min(1, Math.max(0, ((t - 0.25 - it.i * 0.12) * cps) / chars.length)) * chars.length);
      if (n === 0) return;
      const c = p.ctx, s = 0.8 + 0.25 * it.front;
      c.save(); c.globalAlpha *= 0.75 + 0.25 * it.front; // the far side of the ring is dimmer
      c.translate(it.x, it.y); c.scale(s, s);
      p.badge(chars.slice(0, n).join(''), 0, -p.rem * 0.7, { variant: 'solid', size: p.rem * 0.75, align: 'center' });
      c.restore();
    };
    p.footage();
    ring(false);
    items.filter((it) => it.front < 0).forEach(word);
    p.subject();
    ring(true);
    items.filter((it) => it.front >= 0).sort((a, b) => a.front - b.front).forEach(word);
  },
};
