// Frosted glass: a card copies the pixels already drawn under it, blurs them back in place, then lays a pale tint,
// a sheen from above and a hairline edge on top. Whatever is behind it shows through: the shot, the glow, a card.
const clamp = (v) => Math.min(1, Math.max(0, v));

export default (base) => {
  const blur = Number(base.params.blur ?? 0.6), tint = Number(base.params.tint ?? 0.5);

  // Blur what's under rect r (in the current transform) inside the current clip.
  function frost(p, r) {
    const c = p.ctx, canvas = c.canvas;
    if (!canvas || !c.getTransform || blur <= 0) return;
    const m = c.getTransform(), xs = [], ys = [];
    for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
      xs.push(m.a * x + m.c * y + m.e); ys.push(m.b * x + m.d * y + m.f);
    }
    const px = p.rem * 1.1 * blur * Math.hypot(m.a, m.b), pad = px * 3;
    const bx = Math.max(0, Math.floor(Math.min(...xs) - pad)), by = Math.max(0, Math.floor(Math.min(...ys) - pad));
    const bw = Math.min(canvas.width, Math.ceil(Math.max(...xs) + pad)) - bx, bh = Math.min(canvas.height, Math.ceil(Math.max(...ys) + pad)) - by;
    if (bw <= 0 || bh <= 0) return;
    const copy = p.canvas(bw, bh);
    copy.getContext('2d').drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.filter = `blur(${px.toFixed(1)}px) saturate(1.3)`;
    c.drawImage(copy, bx, by);
    c.restore();
  }

  function pane(p, r, rad, fill) {
    const c = p.ctx, light = p.mode === 'light';
    c.save();
    c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, rad); c.clip();
    frost(p, r);
    c.fillStyle = light ? `rgba(255,255,255,${0.3 + 0.4 * tint})` : `rgba(255,255,255,${0.03 + 0.1 * tint})`;
    c.fillRect(r.x, r.y, r.w, r.h);
    if (fill) { c.globalAlpha *= 0.85; c.fillStyle = fill; c.fillRect(r.x, r.y, r.w, r.h); c.globalAlpha /= 0.85; }
    // The sheen: light falling on the top of the pane.
    const g = c.createLinearGradient(0, r.y, 0, r.y + Math.min(r.h, p.rem * 4));
    g.addColorStop(0, `rgba(255,255,255,${light ? 0.5 : 0.12})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
    c.restore();
  }

  return {
    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = clamp(o.progress ?? 1);
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, rad = o.radius ?? this.rem * 1.1, light = this.mode === 'light';
      c.save();
      c.globalAlpha *= Math.min(1, prog * 1.6);
      const s = 0.97 + 0.03 * prog;
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(s, s); c.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      pane(this, r, rad, o.fill);
      c.beginPath(); c.roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
      c.lineWidth = Math.max(1, this.rem / (variant === 'feature' ? 14 : 22));
      c.strokeStyle = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : light ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.22)');
      c.stroke();
      c.restore();
    },

    pill(r, o = {}) {
      // An empty pill is a pane too; a filled one (a bar, a key) keeps its colour.
      if (o.fill || !o.stroke) return base.pill.call(this, r, o);
      const rad = o.radius ?? r.h / 2;
      pane(this, r, rad);
      return base.pill.call(this, r, o);
    },
  };
};
