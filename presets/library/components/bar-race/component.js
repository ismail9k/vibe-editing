// A bar chart race: every bar moves through its values one period after another, the bars re-sort as one
// overtakes another, the leader always fills the width, and the period ticks over in the corner.
const clamp = (v) => Math.min(1, Math.max(0, v));
const ease = (k) => k * k * (3 - 2 * k);

/** "Name: 1, 2, 3" -> { name, values }, or null for a line without a name or a number. */
export function parseBar(line) {
  const m = String(line).match(/^(.*?):\s*(.*)$/);
  if (!m || !m[1].trim()) return null;
  const values = m[2].split(',').map((v) => v.trim()).filter((v) => v !== '').map(Number).filter((v) => Number.isFinite(v));
  return values.length ? { name: m[1].trim(), values } : null;
}

/** A bar's value at f (0 = the first period, 1 = the second, …), easing between periods. */
export function valueAt(values, f) {
  const i = Math.max(0, Math.min(values.length - 1, Math.floor(f))), k = ease(clamp(f - i));
  const a = values[i], b = values[Math.min(values.length - 1, i + 1)];
  return a + (b - a) * k;
}

/** Each bar's place in the order (0 = top), as a smooth number so two bars glide past each other. */
export function ranks(vals) {
  const spread = Math.max(1e-6, Math.max(...vals.map(Math.abs)) * 0.006);
  return vals.map((v, i) => vals.reduce((s, w, j) => (j === i ? s : s + 1 / (1 + Math.exp(-(w - v) / spread))), 0));
}

export default {
  draw(p, { t, dur, props, place }) {
    const bars = (Array.isArray(props.bars) ? props.bars : []).map(parseBar).filter(Boolean);
    if (!bars.length) return;
    const periods = (Array.isArray(props.periods) ? props.periods : []).map(String);
    const steps = Math.max(...bars.map((b) => b.values.length));
    const lead = 0.5, run = Math.max(0.5, dur - lead - 1.2), f = clamp((t - lead) / run) * (steps - 1);
    const now = bars.map((b) => valueAt(b.values, f)), order = ranks(now), top = Math.max(...now, 1e-6);

    const rem = p.rem, rtl = p.dir === 'rtl', box = place({ y: 0.24, w: 0.88 }), pad = rem * 1.3;
    const head = props.title ? rem * 3 : rem * 0.4, row = rem * 3, h = pad * 2 + head + row * bars.length + rem * 2.6;
    p.panel({ x: box.left, y: box.y, w: box.w, h }, { progress: p.enter(t, 'default') });
    if (props.title) p.text(String(props.title), box.start + (rtl ? -pad : pad), box.y + pad + rem * 1.5, { role: 'display', size: rem * 1.6, weight: 700, maxWidth: box.w - pad * 2 });

    const inner = box.w - pad * 2, valueW = rem * 4.2, k = p.enter(t - 0.2, 'default');
    bars.forEach((b, i) => {
      const y = box.y + pad + head + order[i] * row, lit = b.name === String(props.highlight ?? '');
      const bw = Math.max(rem * 0.5, (inner - valueW) * (now[i] / top) * k), x = rtl ? box.right - pad - bw : box.left + pad;
      p.text(b.name, rtl ? box.right - pad : box.left + pad, y + rem * 0.8, { size: rem * 0.85, weight: 600, color: lit ? p.theme.text : p.theme.muted, maxWidth: inner });
      p.pill({ x, y: y + rem * 1.1, w: bw, h: rem * 1.3 }, { fill: lit ? p.brand.colors.accent : p.theme.raised, stroke: lit ? undefined : p.theme.border, radius: rem * 0.35 });
      const vx = rtl ? x - rem * 0.5 : x + bw + rem * 0.5;
      p.text(`${Math.round(now[i] * k)}${props.unit ?? ''}`, vx, y + rem * 2.15, { role: 'mono', size: rem * 0.95, weight: 600, align: rtl ? 'end' : 'start', color: lit ? p.theme.text : p.theme.muted });
    });

    // The period, big and quiet in the end corner.
    const label = periods[Math.min(periods.length - 1, Math.round(f))];
    if (label) p.text(label, rtl ? box.left + pad : box.right - pad, box.y + h - pad, { role: 'mono', size: rem * 1.8, weight: 700, align: rtl ? 'start' : 'end', color: p.theme.muted });
  },
};
