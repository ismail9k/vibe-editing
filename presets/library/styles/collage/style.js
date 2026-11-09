// Collage: every card is a torn sheet of paper stuck down a little crooked, with a hard shadow and tape across two
// corners; rules are strips of tape; the background is a board with old scraps on it. Seeded per card, so a card
// keeps its tear and its angle from frame to frame.
const boards = new Map();
const clamp = (v) => Math.min(1, Math.max(0, v));

export default (base) => {
  const tilt = Number(base.params.tilt ?? 0.5), tape = base.params.tape !== false;

  /** The outline of a torn sheet: every edge zigzags a little, more along the long sides. */
  function torn(r, rr, k) {
    const pts = [], step = k * 2.2;
    const edge = (x0, y0, x1, y1, nx, ny) => {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / step));
      for (let i = 0; i < n; i++) { const f = i / n, d = (rr() - 0.5) * k; pts.push([x0 + (x1 - x0) * f + nx * d, y0 + (y1 - y0) * f + ny * d]); }
    };
    edge(r.x, r.y, r.x + r.w, r.y, 0, 1); edge(r.x + r.w, r.y, r.x + r.w, r.y + r.h, 1, 0);
    edge(r.x + r.w, r.y + r.h, r.x, r.y + r.h, 0, 1); edge(r.x, r.y + r.h, r.x, r.y, 1, 0);
    return pts;
  }
  const trace = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };

  function strip(p, cx, cy, w, h, angle, color, alpha) {
    const c = p.ctx, rr = p.rng(Math.round(cx * 3 + cy)), j = h * 0.18;
    c.save();
    c.translate(cx, cy); c.rotate(angle);
    c.globalAlpha *= alpha; c.fillStyle = color;
    c.beginPath(); c.moveTo(-w / 2, -h / 2);
    c.lineTo(w / 2, -h / 2);
    for (let i = 1; i < 5; i++) c.lineTo(w / 2 + (i % 2 ? j : 0), -h / 2 + (h * i) / 5); // torn ends
    c.lineTo(w / 2, h / 2); c.lineTo(-w / 2, h / 2);
    for (let i = 4; i > 0; i--) c.lineTo(-w / 2 - (i % 2 ? j * (0.5 + rr()) : 0), -h / 2 + (h * i) / 5);
    c.closePath(); c.fill();
    c.restore();
  }

  return {
    background() {
      const c = this.ctx, key = `${this.W}x${this.H}|${this.theme.bg}|${this.theme.surface}`;
      let board = boards.get(key);
      if (!board) {
        board = this.canvas(this.W, this.H);
        const x = board.getContext('2d'), r = this.rng(key), k = this.rem * 0.4;
        x.fillStyle = this.theme.bg; x.fillRect(0, 0, this.W, this.H);
        // Old scraps, torn off long ago: faint, at all angles.
        for (let i = 0; i < 14; i++) {
          const w = this.W * (0.15 + r() * 0.3), h = w * (0.3 + r() * 0.8), cx = r() * this.W, cy = r() * this.H;
          x.save(); x.translate(cx, cy); x.rotate((r() - 0.5) * 0.8);
          x.globalAlpha = 0.1 + r() * 0.15; x.fillStyle = r() < 0.5 ? this.theme.surface : this.theme.raised;
          trace(x, torn({ x: -w / 2, y: -h / 2, w, h }, r, k)); x.fill();
          x.restore();
        }
        boards.set(key, board);
      }
      c.drawImage(board, 0, 0);
    },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = clamp(o.progress ?? 1);
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, rr = this.rng(o.seed ?? Math.round(r.x * 7 + r.y)), k = this.rem * 0.35;
      const angle = (rr() - 0.5) * 0.05 * tilt * 2, pts = torn(r, rr, k), sh = this.rem * 0.3;
      c.save();
      // Stuck down with a slap: a little large and more crooked, settling flat.
      const s = 1 + 0.06 * (1 - prog);
      c.globalAlpha *= Math.min(1, prog * 2);
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.rotate(angle * (1 + 2 * (1 - prog))); c.scale(s, s); c.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      c.save(); c.translate(sh, sh); trace(c, pts); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fill(); c.restore();
      trace(c, pts);
      c.fillStyle = o.fill ?? (variant === 'feature' ? this.theme.raised : this.mode === 'light' ? this.theme.surface : this.theme.raised); c.fill();
      if (o.stroke || variant === 'feature') { c.lineWidth = Math.max(2, this.rem * 0.08); c.strokeStyle = o.stroke ?? this.brand.colors.accent; c.stroke(); }
      if (tape) {
        // Masking tape: pale and see-through, across the two top corners.
        const tw = this.rem * 4.2, th = this.rem * 1.35, ink = this.theme.text;
        strip(this, r.x + this.rem * 0.5, r.y + this.rem * 0.4, tw, th, -0.7, ink, 0.28);
        strip(this, r.x + r.w - this.rem * 0.5, r.y + this.rem * 0.4, tw, th, 0.7, ink, 0.28);
      }
      c.restore();
    },

    text(str, x, y, o = {}) {
      if ((o.role ?? 'body') !== 'display') return base.text.call(this, str, x, y, o);
      // Headlines cut out and stuck down by hand: each one sits at its own slight angle.
      const c = this.ctx, a = (this.rng(this.m.hash(String(str)))() - 0.5) * 0.04 * tilt * 2;
      c.save(); c.translate(x, y); c.rotate(a); c.translate(-x, -y);
      const res = base.text.call(this, str, x, y, o);
      c.restore();
      return res;
    },

    rule(x, y, w, o = {}) {
      const len = w * clamp(o.progress ?? 1), dir = this.dir === 'rtl' ? -1 : 1, h = o.height ?? this.rem * 0.55;
      if (len <= 0) return;
      strip(this, x + (dir * len) / 2, y, len, h, -0.015, o.color ?? this.brand.colors.accent, 0.85);
    },

    pill(r, o = {}) { return base.pill.call(this, r, { ...o, radius: Math.min(o.radius ?? r.h / 2, this.rem * 0.12) }); },
    enter(t, kind = 'default') { return base.enter.call(this, t, kind === 'heavy' ? 'default' : 'snappy'); },
  };
};
