// You in front of a new background: the room wipes away bottom-up, you stay.
export default {
  draw(p, { t, props }) {
    const c = p.ctx, k = p.enter(t, 'heavy');
    p.footage();
    c.save();
    c.beginPath(); c.rect(0, p.H * (1 - k), p.W, p.H * k); c.clip();
    if (props.backdrop === 'band') { c.fillStyle = p.brand.colors.primary; c.fillRect(0, 0, p.W, p.H); }
    else if (props.backdrop === 'grid') {
      c.fillStyle = p.theme.bg; c.fillRect(0, 0, p.W, p.H);
      const step = p.rem * 3;
      for (let x = step / 2; x < p.W; x += step) p.line([[x, 0], [x, p.H]], { color: p.theme.border, width: 1 });
      for (let y = step / 2; y < p.H; y += step) p.line([[0, y], [p.W, y]], { color: p.theme.border, width: 1 });
    } else p.background(t);
    c.restore();
    p.subject();
  },
};
