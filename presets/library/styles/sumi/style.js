// Sumi ink: the background is rice paper with fibres in it; a card is one wide brush stroke laid in the reading
// direction, with ragged edges and dry-brush streaks breaking it up towards its tail; rules taper like a brush;
// a feature card gets the artist's red seal (the accent) in its end corner.
const papers = new Map();
const clamp = (v) => Math.min(1, Math.max(0, v));

export default (base) => {
  const dry = Number(base.params.dry ?? 0.5), seal = base.params.seal !== false;

  function paper(p) {
    const W = p.W, H = p.H, key = `${W}x${H}|${p.theme.text}`;
    if (papers.has(key)) return papers.get(key);
    const s = p.canvas(W, H), x = s.getContext('2d'), r = p.rng(key);
    x.strokeStyle = p.theme.text; x.lineCap = 'round';
    for (let i = 0; i < 1400 * (W * H) / (1080 * 1920); i++) {
      const cx = r() * W, cy = r() * H, len = p.rem * (0.3 + r() * 1.4), a = r() * Math.PI;
      x.globalAlpha = 0.02 + r() * 0.05; x.lineWidth = 0.5 + r();
      x.beginPath(); x.moveTo(cx, cy);
      x.quadraticCurveTo(cx + Math.cos(a + 0.6) * len * 0.5, cy + Math.sin(a + 0.6) * len * 0.5, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      x.stroke();
    }
    papers.set(key, s);
    return s;
  }

  return {
    background() {
      const c = this.ctx;
      c.fillStyle = this.theme.bg; c.fillRect(0, 0, this.W, this.H);
      c.drawImage(paper(this), 0, 0);
    },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = clamp(o.progress ?? 1);
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, rem = this.rem, rr = this.rng(o.seed ?? Math.round(r.x * 7 + r.y)), rtl = this.dir === 'rtl', light = this.mode === 'light';
      // The brush travels in the reading direction: only the part it has reached is drawn.
      const reach = (r.w + rem * 2) * clamp(prog * 1.1);
      c.save();
      c.beginPath(); c.rect(rtl ? r.x + r.w + rem - reach : r.x - rem, r.y - rem, reach, r.h + rem * 2); c.clip();
      const n = 28, top = [], bot = [], rag = rem * 0.3;
      for (let i = 0; i <= n; i++) {
        const x = r.x + (r.w * i) / n;
        top.push([x, r.y + (rr() - 0.5) * rag]); bot.push([x, r.y + r.h + (rr() - 0.5) * rag]);
      }
      c.beginPath(); c.moveTo(top[0][0], top[0][1]);
      for (const [x, y] of top) c.lineTo(x, y);
      c.quadraticCurveTo(r.x + r.w + rem * 0.7, r.y + r.h * 0.45, bot[n][0], bot[n][1]);
      for (let i = n; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1]);
      c.quadraticCurveTo(r.x - rem * 0.5, r.y + r.h * 0.55, top[0][0], top[0][1]);
      c.closePath();
      c.save();
      if (light) c.globalAlpha *= 0.6;
      c.fillStyle = o.fill ?? (light ? this.theme.border : this.theme.raised);
      c.fill();
      c.restore();
      // Dry brush: the bristles run out of ink towards the tail, so paper shows through in broken streaks that
      // get longer and closer together the further the stroke has gone.
      c.clip();
      const streaks = Math.round(r.h / (rem * 0.12)), tail = (f) => (rtl ? r.x + r.w * (1 - f) : r.x + r.w * f);
      c.fillStyle = this.theme.bg;
      for (let i = 0; i < streaks; i++) {
        const y = r.y + ((i + rr()) * r.h) / streaks, h = Math.max(1, rem * (0.02 + rr() * 0.06));
        let f = 1 - (0.15 + 0.6 * rr()) * (0.3 + dry); // where this bristle starts to run dry
        while (f < 1.05) {
          const seg = (0.01 + rr() * 0.08) * (f > 0.85 ? 2 : 1), gap = 0.004 + rr() * 0.03 * (1 - f);
          c.globalAlpha = Math.min(1, 0.35 + (f - 0.4) * 1.2) * (0.6 + 0.4 * rr());
          const a = tail(f), b = tail(f + seg);
          c.fillRect(Math.min(a, b), y, Math.abs(b - a) + 1, h);
          f += seg + gap;
        }
      }
      c.globalAlpha = 1;
      c.restore();
      if (seal && variant === 'feature' && prog >= 1) {
        const s = rem * 1.3, sx = rtl ? r.x + rem * 0.6 : r.x + r.w - s - rem * 0.6, sy = r.y + r.h - s - rem * 0.6;
        c.save();
        c.translate(sx + s / 2, sy + s / 2); c.rotate(-0.05); c.translate(-s / 2, -s / 2);
        c.fillStyle = this.brand.colors.accent; c.fillRect(0, 0, s, s);
        c.strokeStyle = this.brand.colors.onAccent; c.lineWidth = Math.max(1, rem * 0.07);
        c.strokeRect(s * 0.18, s * 0.18, s * 0.64, s * 0.64);
        c.beginPath(); c.moveTo(s * 0.5, s * 0.18); c.lineTo(s * 0.5, s * 0.82); c.moveTo(s * 0.18, s * 0.5); c.lineTo(s * 0.82, s * 0.5); c.stroke();
        c.restore();
      }
    },

    rule(x, y, w, o = {}) {
      const c = this.ctx, dir = this.dir === 'rtl' ? -1 : 1, len = w * clamp(o.progress ?? 1), h = o.height ?? this.rem * 0.26, rr = this.rng(Math.round(x + y));
      if (len <= 0) return;
      // A brush stroke: pressed down hard at the start, lifting off towards the end.
      const n = 18, top = [], bot = [];
      for (let i = 0; i <= n; i++) {
        const f = i / n, th = h * (f < 0.08 ? 0.7 + f * 4 : 1.05 - 0.75 * f) * (0.9 + 0.2 * rr());
        top.push([x + dir * len * f, y - th / 2]); bot.push([x + dir * len * f, y + th / 2 + (rr() - 0.5) * h * 0.15]);
      }
      c.save();
      c.fillStyle = o.color ?? this.brand.colors.accent;
      c.beginPath(); c.moveTo(top[0][0], top[0][1]);
      for (const [px, py] of top) c.lineTo(px, py);
      for (let i = n; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1]);
      c.closePath(); c.fill();
      c.restore();
    },

    line(points, o = {}) { return base.line.call(this, points, { ...o, width: (o.width ?? this.rem * 0.12) * 1.3 }); },
  };
};
