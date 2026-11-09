// Chalkboard: every outline is drawn twice by a slightly unsteady hand, letters are dusty,
// and the board carries old smudges. All randomness is seeded, so frames never flicker.
const boards = new Map();
const grains = new Map();

export default (base) => {
  const wobble = Number(base.params.wobble ?? 0.35);
  const dust = Number(base.params.dust ?? 0.5);
  const grain = Number(base.params.grain ?? 0.45);

  // A colour turned into chalk: a pattern of the colour with seeded holes and soft spots.
  function chalk(p, color) {
    const key = `${color}|${grain}`;
    if (grains.has(key)) return p.ctx.createPattern(grains.get(key), 'repeat');
    const n = 160, c = p.canvas(n, n), x = c.getContext('2d'), r = p.rng(key);
    x.fillStyle = color; x.fillRect(0, 0, n, n);
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n * n * 0.18 * grain; i++) {
      x.globalAlpha = 0.35 + r() * 0.65;
      x.fillRect(Math.floor(r() * n), Math.floor(r() * n), 1 + Math.floor(r() * 2), 1);
    }
    grains.set(key, c);
    return p.ctx.createPattern(c, 'repeat');
  }

  // Points along a rough path: each segment bends through a jittered midpoint.
  function roughStroke(p, pts, { color, width, progress = 1, seed = 1, passes = 2, closed = false } = {}) {
    const c = p.ctx, r = p.rng(seed), j = p.rem * 0.35 * wobble;
    const path = closed ? [...pts, pts[0]] : pts;
    const lens = path.slice(1).map((q, i) => Math.hypot(q[0] - path[i][0], q[1] - path[i][1]));
    const total = lens.reduce((a, b) => a + b, 0);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = chalk(p, color ?? p.theme.text);
    for (let pass = 0; pass < passes; pass++) {
      c.lineWidth = (width ?? p.rem * 0.13) * (pass ? 0.6 : 1);
      c.globalAlpha *= pass ? 0.7 : 1;
      c.setLineDash([p.rem * (1.4 + r()), p.rem * 0.07]);
      let left = total * Math.max(0, Math.min(1, progress));
      c.beginPath();
      c.moveTo(path[0][0] + (r() - 0.5) * j, path[0][1] + (r() - 0.5) * j);
      for (let i = 1; i < path.length && left > 0; i++) {
        const f = Math.min(1, left / (lens[i - 1] || 1));
        const [ax, ay] = path[i - 1], bx = ax + (path[i][0] - ax) * f, by = ay + (path[i][1] - ay) * f;
        c.quadraticCurveTo((ax + bx) / 2 + (r() - 0.5) * j, (ay + by) / 2 + (r() - 0.5) * j, bx + (r() - 0.5) * j * 0.6, by + (r() - 0.5) * j * 0.6);
        left -= lens[i - 1];
      }
      c.stroke();
    }
    c.restore();
  }

  return {
    background(t) {
      const key = `${this.W}x${this.H}|${this.theme.bg}|${dust}`;
      let board = boards.get(key);
      if (!board) {
        board = this.canvas(this.W, this.H);
        const x = board.getContext('2d'), r = this.rng(key);
        x.fillStyle = this.theme.bg; x.fillRect(0, 0, this.W, this.H);
        const ink = this.mode === 'light' ? '0,0,0' : '255,255,255';
        for (let i = 0; i < 14; i++) { // old smudges where something was wiped off
          const cx = r() * this.W, cy = r() * this.H, rad = this.W * (0.15 + r() * 0.35);
          const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
          g.addColorStop(0, `rgba(${ink},${0.05 * dust})`); g.addColorStop(1, `rgba(${ink},0)`);
          x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
        }
        for (let i = 0; i < 4000 * dust; i++) { // dust specks
          x.fillStyle = `rgba(${ink},${0.04 + r() * 0.12})`;
          x.fillRect(r() * this.W, r() * this.H, 1 + r() * 2, 1 + r() * 2);
        }
        boards.set(key, board);
      }
      this.ctx.drawImage(board, 0, 0);
    },

    panel(rect, o = {}) {
      if ((o.variant ?? 'default') === 'flat') return;
      const { x, y, w, h } = rect, k = this.rem * 0.3;
      const pts = [[x + k, y], [x + w - k, y], [x + w, y + k], [x + w, y + h - k], [x + w - k, y + h], [x + k, y + h], [x, y + h - k], [x, y + k]];
      const color = o.stroke ?? (o.variant === 'feature' ? this.brand.colors.accent : this.theme.text);
      roughStroke(this, pts, { color, progress: o.progress ?? 1, seed: o.seed ?? Math.round(x * 7 + y), closed: true });
    },

    text(str, x, y, o = {}) {
      const c = this.ctx, seed = this.m.hash(str + Math.round(y));
      const tilt = (this.rng(seed)() - 0.5) * 0.02 * (0.5 + wobble);
      c.save();
      c.translate(x, y); c.rotate(tilt); c.translate(-x, -y);
      const color = o.color ?? this.theme.text;
      const res = base.text.call(this, str, x, y, { ...o, color: typeof color === 'string' ? chalk(this, color) : color, caret: false });
      c.restore();
      return res;
    },

    line(points, o = {}) {
      roughStroke(this, points, { color: o.color, width: o.width, progress: o.progress, seed: o.seed ?? Math.round(points[0][0] + points[0][1]) });
    },

    rule(x, y, w, o = {}) {
      const dir = this.dir === 'rtl' ? -1 : 1, pts = [];
      for (let i = 0; i <= 6; i++) pts.push([x + dir * (w * i) / 6, y + (i % 2 ? -1 : 1) * this.rem * 0.08 * wobble]);
      roughStroke(this, pts, { color: o.color ?? this.brand.colors.accent, width: o.height ?? this.rem * 0.2, progress: o.progress ?? 1, seed: Math.round(x + y), passes: 2 });
    },

    pill(rect, o = {}) {
      const c = this.ctx;
      if (o.fill) {
        c.save();
        c.beginPath(); c.roundRect(rect.x, rect.y, rect.w, rect.h, o.radius ?? rect.h / 2);
        c.fillStyle = chalk(this, o.fill); c.fill();
        c.restore();
      }
      if (o.stroke) {
        const { x, y, w, h } = rect;
        roughStroke(this, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { color: o.stroke, width: this.rem * 0.08, seed: Math.round(x + y), closed: true, passes: 1 });
      }
    },
  };
};
