// Sticker: cards and pills are die-cut stickers with a thick edge and a hard (unblurred) shadow, and they pop in
// on a scale rather than fading. On dark modes the edge is white like a sticker's paper border.
export default (base) => {
  const depth = Number(base.params.depth ?? 0.5), edgeK = Number(base.params.edge ?? 0.5);
  const edge = (p) => (p.mode === 'light' ? p.brand.colors.ink : p.brand.colors.onPrimary);

  function sticker(p, r, radius, fill, stroke, lw) {
    const c = p.ctx, d = p.rem * 0.5 * depth;
    c.save();
    c.fillStyle = p.brand.colors.ink; c.globalAlpha *= p.mode === 'light' ? 0.9 : 0.6;
    c.beginPath(); c.roundRect(r.x + d, r.y + d, r.w, r.h, radius); c.fill();
    c.restore();
    c.save();
    c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, radius);
    if (fill) { c.fillStyle = fill; c.fill(); }
    c.lineWidth = lw; c.strokeStyle = stroke; c.stroke();
    c.restore();
  }

  return {
    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = Math.max(0, Math.min(1, o.progress ?? 1));
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, s = 0.85 + 0.15 * prog;
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(s, s); c.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      sticker(this, r, o.radius ?? this.rem * 1.1, o.fill ?? (variant === 'feature' ? this.theme.raised : this.theme.surface),
        o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : edge(this)), this.rem * 0.35 * edgeK);
      c.restore();
    },

    pill(r, o = {}) {
      if (!o.fill) return base.pill.call(this, r, o);
      sticker(this, r, o.radius ?? r.h / 2, o.fill, o.stroke ?? edge(this), Math.max(2, this.rem * 0.14 * edgeK));
    },

    text(str, x, y, o = {}) {
      const role = o.role ?? 'body';
      return base.text.call(this, str, x, y, { ...o, weight: Math.max(o.weight ?? 400, role === 'display' ? 700 : 500) });
    },
    measure(str, o = {}) {
      const role = o.role ?? 'body';
      return base.measure.call(this, str, { ...o, weight: Math.max(o.weight ?? 400, role === 'display' ? 700 : 500) });
    },

    line(points, o = {}) { return base.line.call(this, points, { ...o, width: (o.width ?? this.rem * 0.12) * 1.8 }); },
    enter(t, kind = 'default') { return base.enter.call(this, t, kind === 'heavy' ? 'default' : 'snappy'); },
  };
};
