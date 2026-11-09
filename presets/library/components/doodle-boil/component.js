// Marker doodles around your head, redrawn a little differently on every boil frame, the way hand animation shimmers.
export default {
  draw(p, { t, props }) {
    const fps = Math.max(2, Number(props.fps) || 8), r = p.rng(`boil${Math.floor(t * fps)}`);
    const { head } = p.subjectBox(), R = head.r, j = () => (r() - 0.5) * p.rem * 0.35;
    const k = Math.min(1, p.enter(t, 'default') * 1.2), width = p.rem * 0.24, accent = p.brand.colors.accent, ink = p.theme.text;
    const at = (a, d) => [head.x + Math.cos(a) * d + j(), head.y + Math.sin(a) * d + j()];
    p.footage(); // a scene, so Studio tiles get the stand-in to doodle round
    const kind = props.doodle;
    if (kind === 'circle') {
      const pts = [];
      for (let i = 0; i <= 28; i++) { const a = -Math.PI / 2 + (i / 26) * Math.PI * 2; pts.push([head.x + Math.cos(a) * R * 1.45 + j(), head.y + Math.sin(a) * R * 1.6 + j()]); }
      p.line(pts, { color: accent, width, progress: k });
    } else if (kind === 'crown') {
      const y = head.y - R * 1.15, w = R * 1.5, n = 4, pts = [];
      for (let i = 0; i <= n * 2; i++) pts.push([head.x - w / 2 + (w * i) / (n * 2) + j(), y - (i % 2 ? R * 0.55 : 0) + j()]);
      pts.push([head.x + w / 2 + j(), y + R * 0.25], [head.x - w / 2 + j(), y + R * 0.25], pts[0]);
      p.line(pts, { color: accent, width, progress: k });
    } else if (kind === 'arrow') {
      const side = p.dir === 'rtl' ? -1 : 1, x0 = head.x + side * R * 3.2, y0 = head.y - R * 1.6, x1 = head.x + side * R * 1.4, y1 = head.y - R * 0.5;
      const pts = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push([x0 + (x1 - x0) * u + j() * 0.5, y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * R * 0.6 + j() * 0.5]); }
      p.line(pts, { color: accent, width, progress: k });
      if (k > 0.95) p.line([[x1 + side * R * 0.5 + j(), y1 - R * 0.45 + j()], [x1, y1], [x1 + side * R * 0.65 + j(), y1 + R * 0.15 + j()]], { color: accent, width });
    } else {
      [-150, -115, -65, -30].forEach((deg, i) => {
        const a = (deg * Math.PI) / 180;
        p.line([at(a, R * 1.35), at(a, R * 1.95)], { color: i === 1 ? accent : ink, width, progress: Math.min(1, k * 1.3 - i * 0.08) });
      });
    }
  },
};
