// Noir comic: square panels with thick ink borders and a halftone shadow, a 45° dot screen over the background
// that thickens towards the bottom, and headlines in capitals. The accent is the only colour, like the reds in noir.
const screens = new Map();
const clamp = (v) => Math.min(1, Math.max(0, v));

export default (base) => {
  const dots = Number(base.params.dots ?? 0.5);
  const upper = (str, o) => ((o.role ?? 'body') === 'display' ? String(str).toUpperCase() : str);

  // A 45° halftone screen of the text colour; `grow` makes the dots swell towards the bottom of the frame.
  function screen(p, grow) {
    const W = p.W, H = p.H, key = `${W}x${H}|${p.theme.text}|${grow}`;
    if (screens.has(key)) return screens.get(key);
    const s = p.canvas(W, H), x = s.getContext('2d'), step = p.rem * 0.42, diag = Math.hypot(W, H), k = Math.SQRT1_2;
    x.fillStyle = p.theme.text;
    for (let u = -diag / 2; u < diag / 2; u += step) for (let v = -diag / 2; v < diag / 2; v += step) {
      const px = W / 2 + (u - v) * k, py = H / 2 + (u + v) * k;
      if (px < -step || py < -step || px > W + step || py > H + step) continue;
      const rad = step * 0.5 * (grow ? 0.12 + 0.8 * clamp(py / H) ** 1.5 : 0.62);
      x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
    }
    screens.set(key, s);
    return s;
  }

  return {
    background() {
      const c = this.ctx;
      c.fillStyle = this.theme.bg; c.fillRect(0, 0, this.W, this.H);
      c.save(); c.globalAlpha = 0.14 * dots * 2; c.drawImage(screen(this, true), 0, 0); c.restore();
    },

    panel(r, o = {}) {
      const variant = o.variant ?? 'default', prog = clamp(o.progress ?? 1);
      if (variant === 'flat' || prog <= 0) return;
      const c = this.ctx, sh = this.rem * 0.45;
      c.save();
      c.globalAlpha *= Math.min(1, prog * 1.6);
      // Panels slam in from slightly large, like a cut in a comic.
      const s = 1.06 - 0.06 * prog;
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(s, s); c.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      c.save();
      c.beginPath(); c.rect(r.x + sh, r.y + sh, r.w, r.h); c.clip();
      c.globalAlpha *= 0.3 + 0.5 * dots; c.drawImage(screen(this, false), 0, 0);
      c.restore();
      c.fillStyle = o.fill ?? (variant === 'feature' ? this.theme.raised : this.theme.surface);
      c.fillRect(r.x, r.y, r.w, r.h);
      c.lineWidth = this.rem * 0.2; c.lineJoin = 'miter';
      c.strokeStyle = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : this.theme.text);
      c.strokeRect(r.x, r.y, r.w, r.h);
      c.restore();
    },

    measure(str, o = {}) { return base.measure.call(this, upper(str, o), o); },
    text(str, x, y, o = {}) {
      const display = (o.role ?? 'body') === 'display';
      return base.text.call(this, upper(str, o), x, y, display ? { ...o, weight: Math.max(o.weight ?? 700, 700) } : o);
    },

    pill(r, o = {}) {
      const res = base.pill.call(this, r, { ...o, stroke: undefined, radius: Math.min(o.radius ?? r.h / 2, this.rem * 0.1) });
      if (o.stroke || o.fill) {
        const c = this.ctx;
        c.save(); c.lineWidth = this.rem * 0.1; c.strokeStyle = o.stroke ?? this.theme.text; c.strokeRect(r.x, r.y, r.w, r.h); c.restore();
      }
      return res;
    },
    line(points, o = {}) { return base.line.call(this, points, { ...o, width: (o.width ?? this.rem * 0.12) * 1.6 }); },
  };
};
