// A code block: line numbers, mono lines typed in order, one highlighted line. Code always reads left to right.
export default {
  draw(p, { t, props, place }) {
    const lines = (Array.isArray(props.lines) ? props.lines : []).map(String);
    const box = place({ y: 0.34, w: 0.9 }), pad = p.rem * 1.2, row = p.rem * 1.75, size = p.rem * 0.95;
    const head = props.lang ? p.rem * 2.4 : 0, h = pad * 2 + head + lines.length * row;
    p.panel({ x: box.left, y: box.y, w: box.w, h }, { variant: 'default', progress: p.enter(t, 'default'), fill: p.theme.sunken });
    if (props.lang) p.badge(String(props.lang), box.left + pad, box.y + pad * 0.8, { variant: 'outline', size: p.rem * 0.6 });
    const cps = Number(props.speed) || 30, hl = Math.round(Number(props.highlight) || 0) - 1;
    const gutter = p.rem * 2, x0 = box.left + pad + gutter, inner = box.w - pad * 2 - gutter;
    let clock = t - 0.35;
    lines.forEach((line, i) => {
      const len = Math.max(1, [...line].length), prog = Math.max(0, Math.min(1, (clock * cps) / len));
      clock -= len / cps + 0.15;
      if (prog <= 0) return;
      const y = box.y + pad + head + i * row;
      if (i === hl && prog >= 1) p.pill({ x: box.left + pad * 0.5, y: y - row * 0.05, w: box.w - pad, h: row * 0.95 }, { fill: p.theme.selected, radius: p.rem * 0.25 });
      const dir = p.dir; p.dir = 'ltr'; // code reads left to right, even in an Arabic film
      try {
        p.text(String(i + 1), box.left + pad, y + row * 0.65, { role: 'mono', size: size * 0.85, color: p.theme.muted, caret: false });
        p.text(line, x0, y + row * 0.65, { role: 'mono', size, color: i === hl ? p.theme.text : p.theme.muted, maxWidth: inner, progress: prog });
      } finally { p.dir = dir; }
    });
  },
};
