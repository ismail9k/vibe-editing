// Captions, drawn through the painter so every style restyles them too.
// The keyword sits in the orange pill with black text: the one accent of the shot.
import type { Caption } from './model';
import type { Painter } from './painter';
import { clamp } from './motion';

export function drawCaption(p: Painter, cap: Caption, t: number, y = 0.78) {
  const local = t - cap.at;
  const size0 = p.rem * 2.05, maxWidth = p.W * 0.88;
  const size = p.fit(cap.text, { role: 'display', size: size0, weight: 700, maxWidth });
  const kw = cap.keyword && cap.text.includes(cap.keyword) ? cap.keyword : '';
  const segs = kw ? splitOnce(cap.text, kw) : [{ text: cap.text, key: false }];
  const o = { role: 'display' as const, size, weight: 700 };
  const widths = segs.map((s) => p.measure(s.text, o));
  const padX = size * 0.22, total = widths.reduce((a, b) => a + b, 0) + (kw ? padX * 2 : 0);
  const pop = p.enter(local, 'snappy');
  const c = p.ctx, cy = p.H * y, rtl = p.dir === 'rtl';
  c.save();
  c.globalAlpha *= clamp(pop * 2) * clamp((cap.dur - local) / 0.12);
  c.translate(p.W / 2, cy); c.scale(0.92 + 0.08 * pop, 0.92 + 0.08 * pop); c.translate(-p.W / 2, -cy);
  // Walk the segments in reading order from the reading start.
  let cursor = rtl ? p.W / 2 + total / 2 : p.W / 2 - total / 2;
  segs.forEach((s, i) => {
    const w = widths[i] + (s.key ? padX * 2 : 0);
    const left = rtl ? cursor - w : cursor;
    if (s.key) {
      p.pill({ x: left, y: cy - size * 0.82, w, h: size * 1.12 }, { fill: p.brand.colors.accent, radius: size * 0.22 });
      p.text(s.text, rtl ? cursor - padX : cursor + padX, cy, { ...o, color: p.brand.colors.onAccent, caret: false });
    } else {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = size * 0.25; c.shadowOffsetY = size * 0.05;
      p.text(s.text, cursor, cy, { ...o, color: '#FFFFFF', caret: false });
      c.restore();
    }
    cursor = rtl ? cursor - w : cursor + w;
  });
  c.restore();
}

function splitOnce(text: string, kw: string) {
  const i = text.indexOf(kw);
  return [
    { text: text.slice(0, i), key: false },
    { text: kw, key: true },
    { text: text.slice(i + kw.length), key: false },
  ].filter((s) => s.text.length > 0);
}
