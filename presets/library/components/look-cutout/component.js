// A look on part of the shot: on you (the room stays real, or dims so you float in it like the reel's hologram) or
// on the room (you stay real in front of it). It needs the clip's cutout; it sweeps in and out like `look`.
const WIPE = 0.35;
const clamp = (v) => Math.min(1, Math.max(0, v));

/** The finished shot: the look on you or on the room. */
export function split(p, look, on, dim) {
  if (on === 'room') { p.footage({ look }); p.subject(); return; }
  p.footage(dim ? { filter: 'brightness(0.35) saturate(0.6)' } : {});
  p.subject({ look });
}

export default {
  draw(p, { t, dur, props }) {
    const look = String(props.look), on = props.on === 'room' ? 'room' : 'you', dim = props.dim !== false;
    const k = props.wipe ? Math.min(clamp(t / WIPE), clamp((dur - t) / WIPE)) : 1;
    if (k >= 1) { split(p, look, on, dim); return; }
    const e = k * k * (3 - 2 * k), w = p.W * e, x = p.dir === 'rtl' ? p.W - w : 0;
    p.footage();
    const c = p.ctx;
    c.save();
    c.beginPath(); c.rect(x, 0, w, p.H); c.clip();
    split(p, look, on, dim);
    c.restore();
    const edge = p.dir === 'rtl' ? x : x + w, bar = p.rem * 0.15;
    p.pill({ x: edge - bar / 2, y: 0, w: bar, h: p.H }, { fill: p.brand.colors.accent, radius: 0 });
  },
};
