// A vertical timeline: the spine draws down, each step's node and label land in turn; the newest node is orange.
export default {
  draw(p, { t, props, place }) {
    const steps = (Array.isArray(props.steps) ? props.steps : []).map(String);
    if (!steps.length) return;
    const box = place({ y: 0.24, w: 0.8 }), gap = p.rem * 4, rtl = p.dir === 'rtl';
    const stagger = Number(props.stagger) || 0.8, spineX = rtl ? box.right - p.rem : box.left + p.rem;
    const landed = steps.filter((_, i) => t >= 0.3 + i * stagger).length;
    const end = box.y + (steps.length - 1) * gap;
    p.line([[spineX, box.y], [spineX, end]], { color: p.theme.border, width: p.rem * 0.14,
      progress: Math.min(1, Math.max(0, (t - 0.3) / (stagger * Math.max(1, steps.length - 1)))) });
    steps.forEach((s, i) => {
      const k = p.enter(t - 0.3 - i * stagger, 'snappy');
      if (k <= 0) return;
      const y = box.y + i * gap, r = p.rem * 0.55 * k, now = i === landed - 1;
      p.pill({ x: spineX - r, y: y - r, w: r * 2, h: r * 2 }, { fill: now ? p.brand.colors.accent : p.theme.raised, stroke: now ? undefined : p.theme.border });
      p.ctx.save(); p.ctx.globalAlpha *= Math.min(1, k * 1.5);
      const tx = rtl ? spineX - p.rem * 1.6 : spineX + p.rem * 1.6;
      p.text(String(i + 1).padStart(2, '0'), tx, y - p.rem * 0.35, { role: 'mono', size: p.rem * 0.75, color: p.theme.muted });
      p.text(s, tx, y + p.rem * 1.05, { role: 'display', size: p.rem * 1.45, weight: now ? 700 : 600, color: now ? p.theme.text : p.theme.muted, maxWidth: box.w - p.rem * 2.6 });
      p.ctx.restore();
    });
  },
};
