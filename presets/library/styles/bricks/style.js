// Bricks: cards are plates of a toy brick set. Each has a row of studs along its top, a lit top edge and a dark
// bottom edge, and the background is a baseplate of studs. Studs snap to one grid, so cards line up like bricks.
const plates = new Map();
const clamp = (v) => Math.min(1, Math.max(0, v));

export default (base) => {
  const studK = Number(base.params.studs ?? 1), plate = base.params.plate !== false;
  const unit = (p) => p.rem * studK;

  function stud(c, x, y, r, fill) {
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(x + r * 0.12, y + r * 0.18, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = Math.max(1, r * 0.12); c.stroke(); // the rim, so a stud stands off its own colour
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.arc(x - r * 0.25, y - r * 0.25, r * 0.45, 0, Math.PI * 2); c.fill();
  }

  // A bevelled block: lit along the top, shaded along the bottom.
  function block(p, r, fill) {
    const c = p.ctx, e = Math.max(2, p.rem * 0.12);
    c.fillStyle = fill; c.fillRect(r.x, r.y, r.w, r.h);
    c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(r.x, r.y, r.w, e);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(r.x, r.y + r.h - e, r.w, e);
  }

  return {
    background() {
      const c = this.ctx, key = `${this.W}x${this.H}|${this.theme.bg}|${this.theme.surface}|${studK}`;
      if (!plate) { c.fillStyle = this.theme.bg; c.fillRect(0, 0, this.W, this.H); return; }
      let s = plates.get(key);
      if (!s) {
        s = this.canvas(this.W, this.H);
        const x = s.getContext('2d'), u = unit(this) * 1.6;
        x.fillStyle = this.theme.bg; x.fillRect(0, 0, this.W, this.H);
        x.globalAlpha = this.mode === 'light' ? 0.3 : 0.5; // rims read stronger on a light plate
        for (let py = u / 2; py < this.H; py += u) for (let px = u / 2; px < this.W; px += u) stud(x, px, py, u * 0.3, this.theme.surface);
        plates.set(key, s);
      }
      c.drawImage(s, 0, 0);
    },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = clamp(o.progress ?? 1);
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, u = unit(this) * 1.6, fill = o.fill ?? (variant === 'feature' ? this.theme.raised : this.theme.surface);
      c.save();
      c.globalAlpha *= Math.min(1, prog * 2);
      // Clicks down onto the plate from a stud's height above it.
      c.translate(0, -(1 - prog) * u);
      const n = Math.max(1, Math.floor(r.w / u)), pad = (r.w - n * u) / 2;
      for (let i = 0; i < n; i++) stud(c, r.x + pad + u * (i + 0.5), r.y, u * 0.3, fill);
      block(this, r, fill);
      if (o.stroke || variant === 'feature') { c.lineWidth = Math.max(2, this.rem * 0.1); c.strokeStyle = o.stroke ?? this.brand.colors.accent; c.strokeRect(r.x, r.y, r.w, r.h); }
      c.restore();
    },

    pill(r, o = {}) {
      if (!o.fill) return base.pill.call(this, r, { ...o, radius: Math.min(o.radius ?? 0, this.rem * 0.1) });
      const c = this.ctx;
      c.save(); block(this, r, o.fill); c.restore();
      if (o.stroke) base.pill.call(this, r, { stroke: o.stroke, radius: 0 });
    },

    text(str, x, y, o = {}) {
      return base.text.call(this, str, x, y, (o.role ?? 'body') === 'display' ? { ...o, weight: Math.max(o.weight ?? 700, 700) } : o);
    },
    rule(x, y, w, o = {}) { return base.rule.call(this, x, y, w, { ...o, height: o.height ?? this.rem * 0.35 }); },
  };
};
