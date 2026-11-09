// Comic: thick ink borders and hard ink shadows on every panel, a pop-art halftone in the brand green coming in
// from a corner, headlines that lean forward on an ink drop, and feature panels screened with orange dots.
const screens = new Map();
const clamp = (v) => Math.min(1, Math.max(0, v));

export default (base) => {
  const dots = Number(base.params.dots ?? 0.5), inkW = Number(base.params.ink ?? 0.5);
  const ink = (p) => (p.mode === 'light' ? p.brand.colors.ink : '#000000');
  // The drop under panels and headlines: ink on light pages; on a dark page ink would vanish, so it's the brand green.
  const drop = (p) => (p.mode === 'light' ? p.brand.colors.ink : p.brand.colors.primary);

  // Dots on a square grid that swell towards one corner, in one colour (cached per colour).
  function halftone(p, color, corner) {
    const W = p.W, H = p.H, key = `${W}x${H}|${color}|${corner}`;
    if (screens.has(key)) return screens.get(key);
    const s = p.canvas(W, H), x = s.getContext('2d'), step = p.rem * 0.6, [cx, cy] = corner ? [W, 0] : [W / 2, H / 2];
    x.fillStyle = color;
    for (let py = step / 2; py < H; py += step) for (let px = step / 2; px < W; px += step) {
      const d = corner ? 1 - clamp(Math.hypot(px - cx, py - cy) / (Math.hypot(W, H) * 0.55)) : 0.55;
      if (d <= 0.02) continue;
      x.beginPath(); x.arc(px, py, step * 0.5 * d, 0, Math.PI * 2); x.fill();
    }
    screens.set(key, s);
    return s;
  }

  return {
    background() {
      const c = this.ctx;
      c.fillStyle = this.theme.bg; c.fillRect(0, 0, this.W, this.H);
      c.save(); c.globalAlpha = 0.35 * dots * 2; c.drawImage(halftone(this, this.brand.colors.primary, true), 0, 0); c.restore();
    },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = clamp(o.progress ?? 1);
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, d = this.rem * 0.4, rad = o.radius ?? this.rem * 0.35, lw = this.rem * 0.28 * inkW;
      c.save();
      c.globalAlpha *= Math.min(1, prog * 2);
      // Pops in from small with a little overshoot, like a panel being slapped on the page.
      const s = 0.85 + 0.15 * prog + 0.04 * Math.sin(prog * Math.PI);
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(s, s); c.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      c.beginPath(); c.roundRect(r.x + d, r.y + d, r.w, r.h, rad); c.fillStyle = drop(this); c.fill();
      c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, rad);
      c.fillStyle = o.fill ?? (variant === 'feature' ? this.theme.raised : this.theme.surface); c.fill();
      if (variant === 'feature' && !o.fill) {
        c.save(); c.clip(); c.globalAlpha *= 0.22; c.drawImage(halftone(this, this.brand.colors.accent, false), 0, 0); c.restore();
      }
      c.lineWidth = lw; c.strokeStyle = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : this.mode === 'light' ? ink(this) : this.theme.text);
      c.stroke();
      c.restore();
    },

    text(str, x, y, o = {}) {
      if ((o.role ?? 'body') !== 'display') return base.text.call(this, str, x, y, o);
      const c = this.ctx, d = Math.max(2, (o.size ?? this.rem) * 0.07);
      c.save();
      c.translate(x, y); c.transform(1, 0, -0.12, 1, 0, 0); c.translate(-x, -y);
      base.text.call(this, str, x + d, y + d, { ...o, color: drop(this), caret: false });
      const res = base.text.call(this, str, x, y, { ...o, weight: Math.max(o.weight ?? 700, 700) });
      c.restore();
      return res;
    },

    line(points, o = {}) { return base.line.call(this, points, { ...o, width: (o.width ?? this.rem * 0.12) * 1.8 }); },
    rule(x, y, w, o = {}) { return base.rule.call(this, x, y, w, { ...o, height: o.height ?? this.rem * 0.3 }); },
    enter(t, kind = 'default') { return base.enter.call(this, t, kind === 'heavy' ? 'default' : 'snappy'); },
  };
};
