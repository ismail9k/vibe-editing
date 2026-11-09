// Synthwave: a striped sun setting into a grid floor that rolls towards you, all in the brand's glow colours.
// Cards are hard-edged with a lit outline; headlines lean forward on a hard green shadow.
const suns = new Map();
const clamp = (v) => Math.min(1, Math.max(0, v));

export default (base) => {
  const sun = base.params.sun !== false, grid = base.params.grid !== false;
  const speed = Number(base.params.speed ?? 0.5);

  // The sun: amber (the dark mode's warning tone, the light glow's middle) to the glow's orange, cut by stripes that thicken towards the horizon.
  function sunSprite(p, r) {
    const [, mid, low] = p.theme.glow, top = p.mode === 'dark' ? p.theme.warning ?? mid : mid, key = `${Math.round(r)}|${top}|${low}`;
    if (suns.has(key)) return suns.get(key);
    const d = Math.ceil(r * 2), s = p.canvas(d, d), x = s.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, d);
    g.addColorStop(0.1, top); g.addColorStop(0.9, low);
    x.fillStyle = g; x.beginPath(); x.arc(r, r, r, 0, Math.PI * 2); x.fill();
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 8; i++) x.fillRect(0, r * (0.8 + i * 0.16), d, r * (0.02 + i * 0.014));
    suns.set(key, s);
    return s;
  }

  function lit(p, color, fn) {
    const c = p.ctx;
    c.save();
    c.shadowColor = color; c.shadowBlur = p.rem * 0.6;
    fn();
    c.restore();
  }

  return {
    background(t) {
      const c = this.ctx, W = this.W, H = this.H, hz = H * 0.62, depth = H - hz;
      c.fillStyle = this.theme.bg; c.fillRect(0, 0, W, H);
      if (sun) {
        const r = W * 0.32, s = sunSprite(this, r);
        c.save();
        c.beginPath(); c.rect(0, 0, W, hz); c.clip();
        c.globalAlpha = clamp(this.theme.glowOpacity * 2.4);
        c.drawImage(s, W / 2 - r, hz - r * 1.5);
        c.restore();
      }
      c.fillStyle = this.theme.sunken; c.fillRect(0, hz, W, depth);
      if (!grid) return;
      c.save();
      c.strokeStyle = this.theme.primaryText; c.lineWidth = Math.max(1, this.rem / 14);
      c.globalAlpha = 0.45;
      c.beginPath();
      for (let j = -14; j <= 14; j++) { c.moveTo(W / 2 + j * W * 0.025, hz); c.lineTo(W / 2 + j * W * 0.26, H); }
      c.stroke();
      // Cross lines at 1/z: evenly spaced on the floor, bunching towards the horizon, rolling at `speed`.
      const f = (((t * speed) % 1) + 1) % 1;
      for (let i = 0; i < 16; i++) {
        const z = i + 1 - f;
        if (z < 0.9) continue;
        const y = hz + depth / z;
        c.globalAlpha = 0.45 * clamp((y - hz) / (depth * 0.12));
        c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
      }
      c.globalAlpha = 0.9; c.lineWidth = Math.max(2, this.rem / 8);
      c.beginPath(); c.moveTo(0, hz); c.lineTo(W, hz); c.stroke();
      c.restore();
    },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = clamp(o.progress ?? 1);
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, edge = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : this.theme.primaryText);
      const rad = o.radius ?? this.rem * 0.2, d = this.rem * 0.28;
      c.save();
      c.globalAlpha *= Math.min(1, prog * 1.6);
      c.translate(0, (1 - prog) * this.rem * 1.2);
      c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, rad);
      c.fillStyle = o.fill ?? this.theme.surface; c.fill();
      c.lineWidth = Math.max(2, this.rem * 0.09); c.strokeStyle = edge;
      lit(this, edge, () => c.stroke());
      c.globalAlpha *= 0.35; c.lineWidth = Math.max(1, this.rem / 20);
      c.beginPath(); c.roundRect(r.x + d, r.y + d, r.w - d * 2, r.h - d * 2, Math.max(0, rad - d)); c.stroke();
      c.restore();
    },

    text(str, x, y, o = {}) {
      if ((o.role ?? 'body') !== 'display') return base.text.call(this, str, x, y, o);
      const c = this.ctx, d = Math.max(2, (o.size ?? this.rem) * 0.06);
      c.save();
      c.translate(x, y); c.transform(1, 0, -0.16, 1, 0, 0); c.translate(-x, -y);
      base.text.call(this, str, x + d, y + d, { ...o, color: this.theme.primaryText, caret: false });
      const res = base.text.call(this, str, x, y, o);
      c.restore();
      return res;
    },

    line(points, o = {}) {
      const color = o.color ?? this.theme.primaryText;
      lit(this, color, () => base.line.call(this, points, { ...o, color }));
    },

    rule(x, y, w, o = {}) {
      lit(this, o.color ?? this.brand.colors.accent, () => base.rule.call(this, x, y, w, o));
    },
  };
};
