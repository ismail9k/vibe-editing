// Pixel Art: shapes snap to a grid of big pixels, motion moves in steps, and the whole
// overlay is resampled to that grid at the end of the frame. Footage stays sharp underneath.
export default (base) => {
  const steps = Math.max(2, Number(base.params.steps ?? 6));
  const px = () => Math.max(2, Math.round(Number(base.params.pixel ?? 4) * base.W / 1080));
  const snap = (v, k) => Math.round(v / k) * k;

  // A pixel-art box: square, with one-block notches at the corners.
  function notched(c, x, y, w, h, k) {
    c.beginPath();
    c.moveTo(x + k, y); c.lineTo(x + w - k, y); c.lineTo(x + w - k, y + k); c.lineTo(x + w, y + k);
    c.lineTo(x + w, y + h - k); c.lineTo(x + w - k, y + h - k); c.lineTo(x + w - k, y + h); c.lineTo(x + k, y + h);
    c.lineTo(x + k, y + h - k); c.lineTo(x, y + h - k); c.lineTo(x, y + k); c.lineTo(x + k, y + k); c.closePath();
  }

  return {
    background(t) {
      const c = this.ctx, bands = 8, k = px();
      for (let i = 0; i < bands; i++) {
        c.fillStyle = this.theme.bg;
        c.fillRect(0, (this.H * i) / bands, this.W, this.H / bands + 1);
        c.fillStyle = this.theme.glow[1];
        c.globalAlpha = 0.03 + 0.035 * i;
        c.fillRect(0, (this.H * i) / bands, this.W, this.H / bands + 1);
        c.globalAlpha = 1;
      }
      if (this.params.stars !== false && this.mode !== 'light') {
        const r = this.rng('stars'), tick = Math.floor(t * 2);
        for (let i = 0; i < 70; i++) {
          const sx = snap(r() * this.W, k * 2), sy = snap(r() * this.H * 0.6, k * 2), blink = r();
          if ((tick + Math.floor(blink * 7)) % 7 === 0) continue;
          c.fillStyle = blink > 0.85 ? this.brand.colors.accent : this.theme.text;
          c.globalAlpha = 0.5 + blink * 0.5;
          c.fillRect(sx, sy, k * (blink > 0.7 ? 2 : 1), k * (blink > 0.7 ? 2 : 1));
        }
        c.globalAlpha = 1;
      }
    },

    panel(rect, o = {}) {
      const variant = o.variant ?? 'default', prog = o.progress ?? 1;
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, k = px() * 2;
      const x = snap(rect.x, k), y = snap(rect.y + (1 - prog) * k * 4, k), w = snap(rect.w, k), h = snap(rect.h, k);
      c.save();
      c.fillStyle = 'rgba(0,0,0,0.45)'; notched(c, x + k, y + k, w, h, k); c.fill(); // hard shadow
      c.fillStyle = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : this.theme.border);
      notched(c, x, y, w, h, k); c.fill();
      c.fillStyle = o.fill ?? (variant === 'feature' ? this.theme.raised : this.theme.surface);
      c.fillRect(x + k, y + k, w - 2 * k, h - 2 * k);
      c.restore();
    },

    text(str, x, y, o = {}) {
      const size = Math.max(o.size ?? this.rem, this.rem * 0.95);
      return base.text.call(this, str, x, y, { ...o, size, weight: Math.max(o.weight ?? 600, 600) });
    },

    pill(rect, o = {}) {
      const c = this.ctx, k = px();
      c.save();
      notched(c, snap(rect.x, k), snap(rect.y, k), snap(rect.w, k), snap(rect.h, k), k);
      if (o.fill) { c.fillStyle = o.fill; c.fill(); }
      if (o.stroke) { c.lineWidth = k; c.strokeStyle = o.stroke; c.stroke(); }
      c.restore();
    },

    rule(x, y, w, o = {}) {
      const k = px() * 2, ww = snap(w * (o.progress ?? 1), k);
      this.ctx.fillStyle = o.color ?? this.brand.colors.accent;
      this.ctx.fillRect(this.dir === 'rtl' ? snap(x, k) - ww : snap(x, k), snap(y, k), ww, k);
    },

    line(points, o = {}) {
      base.line.call(this, points, { ...o, width: px() * 2 });
    },

    enter(t, kind = 'default') {
      return Math.round(base.enter.call(this, t, kind) * steps) / steps;
    },

    post() {
      const c = this.ctx, k = px(), w = Math.ceil(this.W / k), h = Math.ceil(this.H / k);
      const small = this.canvas(w, h), s = small.getContext('2d');
      s.imageSmoothingEnabled = true; s.imageSmoothingQuality = 'medium';
      s.drawImage(c.canvas, 0, 0, w, h);
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.W, this.H);
      c.imageSmoothingEnabled = false;
      c.drawImage(small, 0, 0, w * k, h * k);
      c.restore();
    },
  };
};
