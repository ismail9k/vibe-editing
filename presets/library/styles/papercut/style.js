// Paper cut: every card is a small stack of cut sheets lifted off the page, each casting a soft shadow on the one
// below; the background has layered paper hills along the bottom, each a step lighter as it comes forward.
const clamp = (v) => Math.min(1, Math.max(0, v));

export default (base) => {
  const depth = Number(base.params.depth ?? 0.5), hills = base.params.hills !== false;

  function sheet(p, r, rad, fill, lift) {
    const c = p.ctx;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = p.rem * 0.9 * lift; c.shadowOffsetY = p.rem * 0.35 * lift;
    c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, rad); c.fillStyle = fill; c.fill();
    c.restore();
  }

  return {
    background() {
      const c = this.ctx, W = this.W, H = this.H;
      c.fillStyle = this.theme.bg; c.fillRect(0, 0, W, H);
      if (!hills) return;
      const tones = [this.theme.sunken, this.theme.surface, this.theme.raised];
      tones.forEach((tone, i) => {
        const top = H * (0.72 + i * 0.08), amp = H * 0.03;
        c.save();
        c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = this.rem * 1.2; c.shadowOffsetY = -this.rem * 0.2;
        c.fillStyle = tone;
        c.beginPath(); c.moveTo(0, H);
        for (let x = 0; x <= W; x += W / 40) c.lineTo(x, top - Math.sin((x / W) * Math.PI * (2 + i) + i * 1.7) * amp);
        c.lineTo(W, H); c.closePath(); c.fill();
        c.restore();
      });
    },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = clamp(o.progress ?? 1);
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, rad = o.radius ?? this.rem * 0.8, step = this.rem * 0.22 * depth * 2;
      c.save();
      c.globalAlpha *= Math.min(1, prog * 1.6);
      // The sheets lift off the page one after another.
      const under = [this.theme.sunken, this.theme.border];
      under.forEach((tone, i) => {
        const k = clamp(prog * 3 - i), d = step * (2 - i) * k;
        sheet(this, { x: r.x - d * 0.4, y: r.y + d, w: r.w, h: r.h }, rad, tone, 0.5);
      });
      sheet(this, r, rad, o.fill ?? (variant === 'feature' ? this.theme.raised : this.theme.surface), prog);
      if (o.stroke || variant === 'feature') {
        c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, rad);
        c.lineWidth = Math.max(1, this.rem / 14); c.strokeStyle = o.stroke ?? this.brand.colors.accent; c.stroke();
      }
      c.restore();
    },

    rule(x, y, w, o = {}) {
      const len = w * clamp(o.progress ?? 1), h = o.height ?? this.rem * 0.3, left = this.dir === 'rtl' ? x - len : x;
      if (len <= 0) return;
      sheet(this, { x: left, y: y - h / 2, w: len, h }, h * 0.2, o.color ?? this.brand.colors.accent, 0.5);
    },

    pill(r, o = {}) {
      if (!o.fill) return base.pill.call(this, r, o);
      sheet(this, r, o.radius ?? r.h / 2, o.fill, 0.4);
      if (o.stroke) base.pill.call(this, r, { stroke: o.stroke, radius: o.radius });
    },
  };
};
