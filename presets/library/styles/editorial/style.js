// Editorial: the film as a printed page. Headlines set in Plex Serif, cards are square sheets with a heavy rule
// on top and a hairline under them, and the background is plain paper with a seeded grain. No glow.
const papers = new Map();

export default (base) => {
  const grain = Number(base.params.grain ?? 0.5);
  const serif = (o) => (o.role === 'display' ? { ...o, role: 'serif', weight: Math.min(o.weight ?? 600, 600) } : o);

  return {
    background() {
      const key = `${this.W}x${this.H}|${this.theme.bg}|${grain}|${this.params.frame}`;
      let paper = papers.get(key);
      if (!paper) {
        paper = this.canvas(this.W, this.H);
        const x = paper.getContext('2d'), r = this.rng(key), ink = this.mode === 'light' ? '0,0,0' : '255,255,255';
        x.fillStyle = this.theme.bg; x.fillRect(0, 0, this.W, this.H);
        for (let i = 0; i < 9000 * grain; i++) { x.fillStyle = `rgba(${ink},${0.015 + r() * 0.04})`; x.fillRect(r() * this.W, r() * this.H, 1, 1); }
        if (this.params.frame !== false) {
          const m = this.rem * 1.2;
          x.strokeStyle = this.theme.border; x.lineWidth = 1; x.strokeRect(m + 0.5, m + 0.5, this.W - m * 2, this.H - m * 2);
        }
        papers.set(key, paper);
      }
      this.ctx.drawImage(paper, 0, 0);
    },

    measure(str, o = {}) { return base.measure.call(this, str, serif(o)); },
    text(str, x, y, o = {}) { return base.text.call(this, str, x, y, serif(o)); },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = Math.max(0, Math.min(1, o.progress ?? 1));
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx;
      c.save();
      c.globalAlpha *= Math.min(1, prog * 1.6);
      c.fillStyle = o.fill ?? (variant === 'feature' ? this.theme.raised : this.theme.surface);
      c.fillRect(r.x, r.y, r.w, r.h);
      const w = r.w * prog, from = this.dir === 'rtl' ? r.x + r.w - w : r.x;
      c.fillStyle = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : this.theme.text);
      c.fillRect(from, r.y, w, Math.max(2, this.rem * 0.12));     // the heavy rule on top, drawn in reading order
      c.fillStyle = this.theme.border;
      c.fillRect(r.x, r.y + r.h - 1, r.w, 1);                     // the hairline under it
      c.restore();
    },

    pill(r, o = {}) { return base.pill.call(this, r, { ...o, radius: Math.min(o.radius ?? r.h / 2, this.rem * 0.12) }); },
    line(points, o = {}) { return base.line.call(this, points, { ...o, width: (o.width ?? this.rem * 0.12) * 0.6 }); },
  };
};
