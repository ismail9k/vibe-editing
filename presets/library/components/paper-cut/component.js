// Stop-motion paper: the background turns to paper, you become a cut-out with a white edge and a hard shadow,
// nudged a little on every stop-motion frame.
export default {
  draw(p, { t, props }) {
    const c = p.ctx, fps = Math.max(2, Number(props.fps) || 8), step = Math.floor(t * fps), r = p.rng(`paper${step}`);
    const k = p.enter(t, 'default'), tilt = ((Number(props.tilt) || 2.5) * Math.PI) / 180;
    c.fillStyle = p.theme.sunken; c.fillRect(0, 0, p.W, p.H);
    const fibres = p.rng('fibres');
    for (let i = 0; i < 160; i++) {
      const x = fibres() * p.W, y = fibres() * p.H, a = fibres() * Math.PI, l = p.rem * (0.3 + fibres());
      p.line([[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], { color: p.theme.border, width: 1 });
    }
    const b = p.subjectBox(), cx = b.x + b.w / 2, cy = b.y + b.h;
    c.save();
    c.translate(cx + (r() - 0.5) * p.rem * 0.3, cy + (1 - k) * p.rem * 3);
    c.rotate((r() - 0.5) * 2 * tilt);
    c.translate(-cx, -cy);
    c.save(); c.translate(p.rem * 0.45, p.rem * 0.55);
    p.subject({ filter: 'brightness(0)', alpha: 0.35, outline: { color: p.brand.colors.ink, width: p.rem * 0.45 } });
    c.restore();
    p.subject({ outline: { color: p.brand.colors.onPrimary, width: p.rem * 0.45 } });
    c.restore();
  },
};
