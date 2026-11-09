// A wall behind you. Headlines: big rows of one line sliding in opposite directions. Screens: a grid of the same shot.
export default {
  draw(p, { t, props }) {
    const c = p.ctx, k = p.enter(t, 'heavy');
    p.footage();
    c.save(); c.globalAlpha *= Math.min(1, k * 1.5);
    c.fillStyle = p.theme.bg; c.fillRect(0, 0, p.W, p.H);
    if (props.kind === 'screens') {
      const cols = 3, rows = 5, gap = p.rem * 0.6, w = (p.W - gap * (cols + 1)) / cols, h = (p.H - gap * (rows + 1)) / rows;
      for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
        const e = p.enter(t - (r + col) * 0.06, 'snappy'), x = gap + col * (w + gap), y = gap + r * (h + gap);
        if (e <= 0) continue;
        const sw = w * e, sh = h * e, rect = { x: x + (w - sw) / 2, y: y + (h - sh) / 2, w: sw, h: sh };
        p.panel({ x: rect.x - 2, y: rect.y - 2, w: rect.w + 4, h: rect.h + 4 }, { variant: 'flat' });
        c.save(); c.beginPath(); c.rect(rect.x, rect.y, rect.w, rect.h); c.clip(); p.footage({ rect, filter: 'brightness(0.7)' }); c.restore();
      }
    } else {
      const str = `${String(props.text ?? '')} · `.repeat(6), size = p.rem * 4.4, lh = size * 1.12, { head } = p.subjectBox();
      const accentRow = Math.floor(head.y / lh);
      for (let r = 0; r * lh < p.H + lh; r++) {
        const dirn = r % 2 ? 1 : -1, shift = (((t * p.rem * 4 * dirn) % (p.W * 2)) - p.W) + (r % 3) * p.rem * 5;
        p.text(str, shift, r * lh + size * 0.85, { role: 'display', size, weight: 700, color: r === accentRow ? p.brand.colors.accent : r % 2 ? p.theme.border : p.theme.muted });
      }
    }
    c.restore();
    p.subject();
  },
};
