// Woodblock: everything is printed from carved blocks. The grain shows in the background and every colour block,
// key lines are cut a little unevenly, colour lands a hair off its line (registration slips), and the sky at the
// top fades in three printed steps of the brand green instead of a gradient.
const grains = new Map();
const clamp = (v) => Math.min(1, Math.max(0, v));

export default (base) => {
  const grain = Number(base.params.grain ?? 0.5), sky = base.params.sky !== false;
  const keyLine = (p) => (p.mode === 'light' ? p.brand.colors.ink : p.theme.text);

  // Long wavy fibres across the frame, seeded so the grain never moves.
  function grainOf(p) {
    const W = p.W, H = p.H, key = `${W}x${H}|${p.mode}|${grain}`;
    if (grains.has(key)) return grains.get(key);
    const s = p.canvas(W, H), x = s.getContext('2d'), r = p.rng(key);
    x.strokeStyle = p.mode === 'light' ? p.brand.colors.ink : '#FFFFFF';
    const n = Math.round(H / (p.rem * 0.3));
    for (let i = 0; i < n; i++) {
      const y0 = ((i + r()) * H) / n, amp = p.rem * (0.3 + r() * 1.2), freq = 0.4 + r() * 1.6, ph = r() * 6;
      x.globalAlpha = (0.02 + r() * 0.07) * grain * 2;
      x.lineWidth = 0.6 + r() * 1.6;
      x.beginPath();
      for (let X = 0; X <= W + 12; X += 12) {
        const Y = y0 + Math.sin((X / W) * Math.PI * freq + ph) * amp + Math.sin(X * 0.05 + ph * 3) * 0.6;
        if (X) x.lineTo(X, Y); else x.moveTo(X, Y);
      }
      x.stroke();
    }
    grains.set(key, s);
    return s;
  }

  return {
    background() {
      const c = this.ctx, W = this.W, H = this.H;
      c.fillStyle = this.theme.bg; c.fillRect(0, 0, W, H);
      if (sky) {
        c.save();
        c.fillStyle = this.brand.colors.primary;
        for (const [h, a] of [[0.24, 0.07], [0.16, 0.08], [0.08, 0.1]]) { c.globalAlpha = a; c.fillRect(0, 0, W, H * h); }
        c.restore();
      }
      c.drawImage(grainOf(this), 0, 0);
    },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = clamp(o.progress ?? 1);
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, rr = this.rng(o.seed ?? Math.round(r.x * 7 + r.y)), j = this.rem * 0.12, slip = this.rem * 0.14;
      const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(([x, y]) => [x + (rr() - 0.5) * j * 2, y + (rr() - 0.5) * j * 2]);
      const path = (d = 0) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x + d, y + d) : c.moveTo(x + d, y + d))); c.closePath(); };
      c.save();
      c.globalAlpha *= Math.min(1, prog * 1.6);
      c.translate(0, (1 - prog) * this.rem);
      path(slip);
      // A green-tinted block (the brand's selected tone), so the slip off the key line shows.
      c.fillStyle = o.fill ?? (variant === 'feature' ? this.theme.raised : this.theme.selected); c.fill();
      c.save(); c.clip(); c.drawImage(grainOf(this), 0, 0); c.drawImage(grainOf(this), 0, this.rem * 0.5); c.restore();
      path();
      c.lineJoin = 'round'; c.lineWidth = this.rem * 0.13;
      c.strokeStyle = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : keyLine(this)); c.stroke();
      c.restore();
    },

    text(str, x, y, o = {}) {
      if ((o.role ?? 'body') === 'display') {
        // The colour block under a headline, printed a hair off.
        const d = (o.size ?? this.rem) * 0.05, c = this.ctx;
        c.save(); c.globalAlpha *= 0.75;
        base.text.call(this, str, x + d, y + d, { ...o, color: this.theme.primaryText, caret: false });
        c.restore();
      }
      return base.text.call(this, str, x, y, o);
    },

    line(points, o = {}) { return base.line.call(this, points, { ...o, width: (o.width ?? this.rem * 0.12) * 1.4 }); },
    rule(x, y, w, o = {}) { return base.rule.call(this, x, y, w, { ...o, height: o.height ?? this.rem * 0.24 }); },
    pill(r, o = {}) { return base.pill.call(this, r, { ...o, radius: Math.min(o.radius ?? r.h / 2, this.rem * 0.2) }); },
  };
};
