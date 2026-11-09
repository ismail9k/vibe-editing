// Riso: two inks on paper. Panels are flat green-ink blocks with the black-ink outline printed slightly off them,
// headlines carry a green ghost where the second drum slipped, and everything has the uneven grain of riso ink.
const grains = new Map();
const clamp = (v) => Math.min(1, Math.max(0, v));

export default (base) => {
  const slip = Number(base.params.slip ?? 0.5), grainK = Number(base.params.grain ?? 0.5);
  const off = (p) => [p.rem * 0.18 * slip * 2, -p.rem * 0.1 * slip * 2];

  // Paper showing through the ink: a tile of seeded pinholes, used to knock holes in what's just been printed.
  function holes(p) {
    const n = 192, key = `${n}|${grainK}`;
    if (grains.has(key)) return grains.get(key);
    const s = p.canvas(n, n), x = s.getContext('2d'), r = p.rng(key);
    x.fillStyle = '#000';
    for (let i = 0; i < n * n * 0.12 * grainK; i++) { x.globalAlpha = 0.2 + r() * 0.8; x.fillRect(Math.floor(r() * n), Math.floor(r() * n), 1, 1); }
    grains.set(key, s);
    return s;
  }
  // Print r: draw it on a scratch layer the size of its box, knock the grain out of it, and lay it down.
  function grainy(p, r, fn) {
    const own = p.ctx, m = own.getTransform ? own.getTransform() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, pad = p.rem * 1.6;
    const xs = [], ys = [];
    for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) { xs.push(m.a * x + m.c * y + m.e); ys.push(m.b * x + m.d * y + m.f); }
    const bx = Math.floor(Math.min(...xs) - pad), by = Math.floor(Math.min(...ys) - pad);
    const bw = Math.ceil(Math.max(...xs) + pad) - bx, bh = Math.ceil(Math.max(...ys) + pad) - by;
    if (bw <= 0 || bh <= 0) return;
    const layer = p.canvas(bw, bh), g = layer.getContext('2d');
    g.setTransform(m.a, m.b, m.c, m.d, m.e - bx, m.f - by);
    p.ctx = g;
    try { fn(); } finally { p.ctx = own; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-out';
    g.fillStyle = g.createPattern(holes(p), 'repeat'); g.fillRect(0, 0, bw, bh);
    own.save(); own.setTransform(1, 0, 0, 1, 0, 0); own.drawImage(layer, bx, by); own.restore();
  }

  return {
    background() {
      const c = this.ctx;
      c.fillStyle = this.theme.bg; c.fillRect(0, 0, this.W, this.H);
    },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = clamp(o.progress ?? 1);
      if (variant === 'flat' || prog <= 0) return;
      const [dx, dy] = off(this), rad = o.radius ?? this.rem * 0.5;
      grainy(this, r, () => {
        const c = this.ctx;
        c.globalAlpha = Math.min(1, prog * 1.6);
        c.translate(0, (1 - prog) * this.rem);
        c.beginPath(); c.roundRect(r.x + dx, r.y + dy, r.w, r.h, rad);
        c.fillStyle = o.fill ?? (variant === 'feature' ? this.theme.raised : this.theme.selected); c.fill();
        c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, rad);
        c.lineWidth = this.rem * 0.1; c.strokeStyle = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : this.theme.text); c.stroke();
      });
    },

    text(str, x, y, o = {}) {
      if ((o.role ?? 'body') !== 'display') return base.text.call(this, str, x, y, o);
      const [dx, dy] = off(this), c = this.ctx;
      c.save(); c.globalAlpha *= 0.8;
      base.text.call(this, str, x + dx, y + dy, { ...o, color: this.theme.primaryText, caret: false });
      c.restore();
      return base.text.call(this, str, x, y, o);
    },

    pill(r, o = {}) {
      if (!o.fill) return base.pill.call(this, r, o);
      grainy(this, r, () => base.pill.call(this, r, o));
    },
  };
};
