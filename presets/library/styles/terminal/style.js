// Terminal: every card is a terminal window (a title bar with three dots and a path sits on top of it), all type
// is Plex Mono, and the background has faint scanlines instead of the glow.
const screens = new Map();

export default (base) => {
  const scan = Number(base.params.scanlines ?? 0.5);
  const mono = (o) => ({ ...o, role: 'mono', weight: (o.role ?? 'body') === 'display' ? Math.min(o.weight ?? 700, 600) : o.weight });

  return {
    background() {
      const key = `${this.W}x${this.H}|${this.theme.bg}|${scan}`;
      let s = screens.get(key);
      if (!s) {
        s = this.canvas(this.W, this.H);
        const x = s.getContext('2d'), ink = this.mode === 'light' ? '0,0,0' : '255,255,255', step = Math.max(3, Math.round(this.H / 640));
        x.fillStyle = this.theme.bg; x.fillRect(0, 0, this.W, this.H);
        x.fillStyle = `rgba(${ink},${0.05 * scan})`;
        for (let y = 0; y < this.H; y += step) x.fillRect(0, y, this.W, 1);
        screens.set(key, s);
      }
      this.ctx.drawImage(s, 0, 0);
    },

    measure(str, o = {}) { return base.measure.call(this, str, mono(o)); },
    text(str, x, y, o = {}) { return base.text.call(this, str, x, y, mono(o)); },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = Math.max(0, Math.min(1, o.progress ?? 1));
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, bar = this.rem * 1.5, rad = this.rem * 0.35;
      c.save();
      c.globalAlpha *= Math.min(1, prog * 1.6);
      c.translate(0, (1 - prog) * this.rem);
      c.beginPath(); c.roundRect(r.x, r.y - bar, r.w, r.h + bar, rad);
      c.fillStyle = o.fill ?? this.theme.sunken; c.fill();
      c.lineWidth = Math.max(1, this.rem / 16); c.strokeStyle = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : this.theme.border); c.stroke();
      c.beginPath(); c.roundRect(r.x, r.y - bar, r.w, bar, [rad, rad, 0, 0]); c.fillStyle = this.theme.raised; c.fill();
      c.fillStyle = this.theme.border; c.fillRect(r.x, r.y - 1, r.w, 1);
      const dot = this.rem * 0.22, rtl = this.dir === 'rtl';
      for (let i = 0; i < 3; i++) {
        c.beginPath(); c.arc(rtl ? r.x + r.w - this.rem * (0.8 + i * 0.7) : r.x + this.rem * (0.8 + i * 0.7), r.y - bar / 2, dot, 0, Math.PI * 2);
        c.fillStyle = i ? this.theme.border : this.theme.muted; c.fill();
      }
      c.restore();
      if (this.params.title) base.text.call(this, String(this.params.title), r.x + r.w / 2, r.y - bar / 2, { role: 'mono', size: this.rem * 0.6, color: this.theme.muted, align: 'center', baseline: 'middle' });
    },

    pill(r, o = {}) { return base.pill.call(this, r, { ...o, radius: Math.min(o.radius ?? r.h / 2, this.rem * 0.15) }); },
  };
};
