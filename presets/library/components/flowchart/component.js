// A flowchart that draws itself: each box pops in when the arrows into it have finished drawing, arrows run as
// elbows from the bottom of one box to the top of the next. Boxes sit in rows by how many steps lead to them.
const clamp = (v) => Math.min(1, Math.max(0, v));

/** Arrows as [from, to] box indexes (0-based): "1>3" lines, or a chain through every box when there are none. */
export function parseLinks(lines, n) {
  const out = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    const m = String(l).match(/^\s*(\d+)\s*(?:>|->|→)\s*(\d+)\s*$/);
    if (!m) continue;
    const a = Number(m[1]) - 1, b = Number(m[2]) - 1;
    if (a >= 0 && b >= 0 && a < n && b < n && a !== b) out.push([a, b]);
  }
  if (!out.length) for (let i = 0; i + 1 < n; i++) out.push([i, i + 1]);
  return out;
}

/** Each box's row: the longest chain of arrows that leads to it (loops are cut off after n passes). */
export function layers(n, links) {
  const row = new Array(n).fill(0);
  for (let pass = 0; pass < n; pass++) {
    let moved = false;
    for (const [a, b] of links) if (row[b] < row[a] + 1 && row[a] + 1 < n) { row[b] = row[a] + 1; moved = true; }
    if (!moved) break;
  }
  return row;
}

export default {
  draw(p, { t, props, place }) {
    const nodes = (Array.isArray(props.nodes) ? props.nodes : []).map(String);
    const n = nodes.length;
    if (!n) return;
    const links = parseLinks(props.links, n), row = layers(n, links), rows = Math.max(...row) + 1;
    const step = Math.max(0.15, Number(props.stagger) || 0.45), rem = p.rem, rtl = p.dir === 'rtl';
    const box = place({ y: 0.14, w: 0.88 }), pad = rem * 1.2, head = props.title ? rem * 3.4 : 0;

    // Where each box sits: rows down the frame, boxes in a row spread across it (in reading order).
    const top = box.y + pad + head, gap = Math.min(rem * 5.6, (p.H * 0.8 - top) / rows), bh = rem * 3;
    // A panel behind the whole chart, so it reads over footage.
    p.panel({ x: box.left, y: box.y, w: box.w, h: pad * 2 + head + (rows - 1) * gap + bh }, { progress: p.enter(t, 'default') });
    if (props.title) p.text(String(props.title), box.x, box.y + pad + rem * 1.7, { role: 'display', size: rem * 1.8, weight: 700, align: 'center', maxWidth: box.w - pad * 2 });
    const rect = nodes.map((label, i) => {
      const peers = nodes.map((_, j) => j).filter((j) => row[j] === row[i]), slot = peers.indexOf(i), m = peers.length;
      const inner = box.w - pad * 2, cell = inner / m, bw = Math.min(cell - rem * 0.8, Math.max(rem * 6, p.measure(label, { size: rem * 1.2, weight: 600 }) + rem * 2.4));
      const cx = rtl ? box.right - pad - cell * (slot + 0.5) : box.left + pad + cell * (slot + 0.5);
      return { x: cx - bw / 2, y: top + row[i] * gap, w: bw, h: bh, cx };
    });
    const at = (i) => 0.15 + row[i] * step;
    const accent = Math.round(Number(props.accent) || 0) - 1;

    for (const [a, b] of links) {
      const A = rect[a], B = rect[b], k = clamp((t - at(a) - step * 0.3) / (step * 0.6));
      if (k <= 0) continue;
      const y0 = A.y + A.h, y1 = B.y, mid = (y0 + y1) / 2;
      p.line([[A.cx, y0], [A.cx, mid], [B.cx, mid], [B.cx, y1 - rem * 0.1]], { color: p.theme.text, width: rem * 0.13, progress: k });
      if (k >= 1) { const s = rem * 0.4; p.line([[B.cx - s, y1 - s * 1.1], [B.cx, y1 - rem * 0.1], [B.cx + s, y1 - s * 1.1]], { color: p.theme.text, width: rem * 0.13 }); }
    }
    nodes.forEach((label, i) => {
      const k = p.enter(t - at(i), 'snappy');
      if (k <= 0.01) return;
      const r = rect[i], s = 0.85 + 0.15 * k, w = r.w * s, h = r.h * s, lit = i === accent;
      p.panel({ x: r.cx - w / 2, y: r.y + (r.h - h) / 2, w, h }, { variant: lit ? 'feature' : 'default', progress: k, ...(lit ? { fill: p.brand.colors.accent } : {}) });
      p.ctx.save(); p.ctx.globalAlpha *= clamp(k * 1.5);
      p.text(label, r.cx, r.y + r.h / 2, { size: rem * 1.2, weight: 600, align: 'center', baseline: 'middle', maxWidth: r.w - rem, color: lit ? p.theme.bg : p.theme.text });
      p.ctx.restore();
    });
  },
};
