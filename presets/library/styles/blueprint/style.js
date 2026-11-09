// Blueprint: everything is a construction drawing. A grid with major lines every four cells, boxes drawn as
// dashed outlines over a faint fill with ticks past their corners, body text in mono.
const grids = new Map();

export default (base) => {
  const cell = Math.max(0.5, Number(base.params.grid ?? 2));
  const mono = (o) => ((o.role ?? 'body') === 'body' ? { ...o, role: 'mono' } : o);

  return {
    background() {
      const key = `${this.W}x${this.H}|${this.theme.bg}|${this.theme.border}|${cell}`;
      let g = grids.get(key);
      if (!g) {
        g = this.canvas(this.W, this.H);
        const x = g.getContext('2d'), step = this.rem * cell;
        x.fillStyle = this.theme.bg; x.fillRect(0, 0, this.W, this.H);
        x.strokeStyle = this.theme.border; x.lineWidth = 1;
        for (let i = 0, v = 0; v <= this.W; i++, v = i * step) { x.globalAlpha = i % 4 ? 0.35 : 0.8; x.beginPath(); x.moveTo(Math.round(v) + 0.5, 0); x.lineTo(Math.round(v) + 0.5, this.H); x.stroke(); }
        for (let i = 0, v = 0; v <= this.H; i++, v = i * step) { x.globalAlpha = i % 4 ? 0.35 : 0.8; x.beginPath(); x.moveTo(0, Math.round(v) + 0.5); x.lineTo(this.W, Math.round(v) + 0.5); x.stroke(); }
        grids.set(key, g);
      }
      this.ctx.drawImage(g, 0, 0);
    },

    measure(str, o = {}) { return base.measure.call(this, str, mono(o)); },
    text(str, x, y, o = {}) { return base.text.call(this, str, x, y, mono(o)); },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = Math.max(0, Math.min(1, o.progress ?? 1));
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, color = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : this.theme.text);
      c.save();
      c.globalAlpha *= 0.55 * Math.min(1, prog * 1.6);
      c.fillStyle = o.fill ?? this.theme.sunken; c.fillRect(r.x, r.y, r.w, r.h);
      c.globalAlpha /= 0.55;
      c.strokeStyle = color; c.lineWidth = Math.max(1, this.rem / 16);
      c.setLineDash([this.rem * 0.5, this.rem * 0.3]);
      c.lineDashOffset = -this.rem * 4 * (1 - prog);                     // the dashes run into place
      c.strokeRect(r.x, r.y, r.w, r.h);
      if (this.params.ticks !== false) {
        c.setLineDash([]); c.strokeStyle = this.theme.muted;
        const k = this.rem * 0.7;
        for (const [px, py] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
          c.beginPath(); c.moveTo(px - k, py); c.lineTo(px + k, py); c.moveTo(px, py - k); c.lineTo(px, py + k); c.stroke();
        }
      }
      c.restore();
    },

    pill(r, o = {}) {
      // Fills become a faint wash under a solid outline of the same colour.
      if (!o.fill) return base.pill.call(this, r, { ...o, radius: Math.min(o.radius ?? r.h / 2, this.rem * 0.1) });
      const c = this.ctx;
      c.save(); c.globalAlpha *= 0.3;
      base.pill.call(this, r, { fill: o.fill, radius: Math.min(o.radius ?? r.h / 2, this.rem * 0.1) });
      c.restore();
      base.pill.call(this, r, { stroke: o.stroke ?? o.fill, radius: Math.min(o.radius ?? r.h / 2, this.rem * 0.1) });
    },

    line(points, o = {}) {
      const c = this.ctx;
      c.save(); c.setLineDash([this.rem * 0.45, this.rem * 0.25]);
      base.line.call(this, points, { ...o, width: Math.min(o.width ?? this.rem * 0.12, this.rem * 0.1) });
      c.restore();
    },
  };
};
