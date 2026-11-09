// Old film: title cards are serif with a double ink border, motion moves in steps (12 drawings a second), and at
// the end of the frame the graphics are put on film: they weave in the gate, flicker, and pick up grain, dust and
// scratches. The post pass runs on the graphics layer, so footage under them stays clean (use the oldcartoon look
// for the shot). Every speck is seeded by the frame's drawing number, so a frame always looks the same.
const clamp = (v) => Math.min(1, Math.max(0, v));

export default (base) => {
  const grain = Number(base.params.grain ?? 0.5), weave = Number(base.params.weave ?? 0.5);
  const fps = Math.max(1, Number(base.params.fps ?? 12));
  const serif = (o) => ((o.role ?? 'body') === 'display' ? { ...o, role: 'serif', weight: Math.max(o.weight ?? 700, 700) } : o);
  const step = (t) => Math.floor(t * fps) / fps;

  return {
    background() {
      const c = this.ctx, W = this.W, H = this.H;
      c.fillStyle = this.theme.bg; c.fillRect(0, 0, W, H);
      // The projector's hot spot: lighter in the middle, burnt at the corners.
      const g = c.createRadialGradient(W / 2, H * 0.45, W * 0.2, W / 2, H * 0.45, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${this.mode === 'light' ? 0.25 : 0.55})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = clamp(o.progress ?? 1);
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, ink = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : this.theme.text), d = this.rem * 0.3;
      c.save();
      c.globalAlpha *= Math.min(1, prog * 1.6);
      c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, this.rem * 0.6);
      c.fillStyle = o.fill ?? this.theme.surface; c.fill();
      c.lineWidth = this.rem * 0.16; c.strokeStyle = ink; c.stroke();
      c.beginPath(); c.roundRect(r.x + d, r.y + d, r.w - d * 2, r.h - d * 2, this.rem * 0.35);
      c.lineWidth = Math.max(1, this.rem * 0.05); c.stroke();
      c.restore();
    },

    measure(str, o = {}) { return base.measure.call(this, str, serif(o)); },
    text(str, x, y, o = {}) { return base.text.call(this, str, x, y, { ...serif(o), caret: false }); },
    enter(t, kind = 'default') { return base.enter.call(this, step(t), kind); },

    post() {
      const c = this.ctx, W = this.W, H = this.H, frame = Math.floor(this.t * fps), r = this.rng(`film${frame}`);
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      // Gate weave: the whole picture jumps a pixel or two each drawing.
      const dx = Math.round((r() - 0.5) * this.rem * 0.25 * weave), dy = Math.round((r() - 0.5) * this.rem * 0.35 * weave);
      if ((dx || dy) && c.canvas) {
        const copy = this.canvas(W, H);
        copy.getContext('2d').drawImage(c.canvas, 0, 0);
        c.clearRect(0, 0, W, H);
        c.drawImage(copy, dx, dy);
      }
      // Everything below lands only on what's been drawn, so a transparent graphics layer stays transparent.
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = '#000'; c.globalAlpha = (0.02 + r() * 0.08) * (0.5 + grain); c.fillRect(0, 0, W, H); // flicker
      const ink = this.mode === 'light' ? '0,0,0' : '255,255,255';
      for (let i = 0; i < 260 * grain; i++) { // grain and dust
        c.fillStyle = r() < 0.5 ? `rgba(${ink},${0.1 + r() * 0.3})` : `rgba(0,0,0,${0.15 + r() * 0.35})`;
        const s = r() < 0.9 ? 1 + r() * 2 : 3 + r() * 4;
        c.globalAlpha = 1; c.fillRect(r() * W, r() * H, s, s);
      }
      for (let i = 0; i < Math.round(3 * grain + r() * 2); i++) { // scratches, a frame or two long
        const x = r() * W;
        c.fillStyle = `rgba(${ink},${0.15 + r() * 0.25})`;
        c.fillRect(x, 0, 1 + r() * 1.5, H);
      }
      c.restore();
    },
  };
};
