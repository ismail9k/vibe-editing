// Dolly zoom: the room fades into a tunnel that keeps falling away behind you while you stay the same size.
export default {
  draw(p, { t, props }) {
    const c = p.ctx, k = p.enter(t, 'default'), { head } = p.subjectBox();
    const n = Math.max(4, Math.round(Number(props.rings) || 14)), speed = Number(props.speed) || 1;
    p.footage();
    c.save(); c.globalAlpha *= k;
    c.fillStyle = p.theme.bg; c.fillRect(0, 0, p.W, p.H);
    const vx = head.x, vy = head.y;
    for (const [x, y] of [[0, 0], [p.W, 0], [0, p.H], [p.W, p.H], [p.W / 2, 0], [p.W / 2, p.H], [0, p.H / 2], [p.W, p.H / 2]])
      p.line([[x, y], [vx, vy]], { color: p.theme.border, width: 1.5 });
    for (let i = 0; i < n; i++) {
      const z = (i / n + t * speed * 0.35) % 1, s = 2.2 * Math.pow(0.05, z);
      const w = p.W * s, h = p.H * s;
      p.pill({ x: vx - w / 2, y: vy - h / 2, w, h }, { stroke: i === 0 ? p.brand.colors.accent : p.theme.border, radius: p.rem * 2 * s });
    }
    c.restore();
    p.subject();
  },
};
