// A magazine cover over the shot: the masthead types in behind your head, cover lines land beside you.
export default {
  draw(p, { t, props }) {
    const title = String(props.title ?? ''), lines = (Array.isArray(props.lines) ? props.lines : []).map(String), white = p.brand.colors.onPrimary;
    p.footage();
    const size = Math.min(p.H * 0.16, (p.W * 0.92 * 100) / Math.max(1, p.measure(title, { role: 'display', size: 100, weight: 700 })));
    const typed = Math.min(1, (t * 10) / Math.max(1, [...title].length));
    // The masthead's baseline sits a little below the top of your head, so you stand in front of it.
    const { y: top, head } = p.subjectBox(), base = Math.max(p.H * 0.04 + size * 0.86, Math.min(p.H * 0.4, top + head.r * 0.9));
    p.text(title, p.W / 2, base, { role: 'display', size, weight: 700, align: 'center', color: white, progress: typed });
    p.subject();
    // Top end corner: sx() already mirrors the anchor in RTL, so the text ends there in both directions.
    if (props.issue) p.text(String(props.issue), p.sx(p.W - p.rem * 1.5), p.H * 0.04, { role: 'mono', size: p.rem * 0.8, align: 'end', color: white });
    const start = p.dir === 'rtl' ? p.W - p.rem * 1.6 : p.rem * 1.6;
    // Cover lines type in one after another, each starting once the one before is written.
    const cps = 24;
    let at = 0.6;
    lines.forEach((line, i) => {
      const from = at, len = Math.max(1, [...line].length);
      at += len / cps + 0.15;
      if (t <= from) return;
      const y = p.H * 0.58 + i * p.rem * 3.4;
      if (i === 0) p.rule(start, y - p.rem * 1.9, p.rem * 3, { progress: p.enter(t - from, 'default') });
      p.text(line, start, y, { role: 'display', size: p.rem * 1.5, weight: 700, color: white, maxWidth: p.W * 0.42, wrap: true, lineHeight: 1.1,
        progress: Math.min(1, ((t - from) * cps) / len) });
    });
  },
};
