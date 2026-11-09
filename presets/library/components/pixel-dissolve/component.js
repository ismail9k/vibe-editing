// A pixel dissolve: the shot coarsens into big square pixels, each pixel flips over to the next look at its own
// moment, and the new look sharpens back. "none" on either side is the plain shot, so it also works as a cut.
const clamp = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const k = clamp((v - a) / (b - a)); return k * k * (3 - 2 * k); };

/** A fixed random number per cell, so a cell flips at the same moment on every frame. */
export function cellHash(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** The pixel size at u (0..1 of the transition): coarsens over the first 30%, holds, sharpens over the last 30%. */
export function blockAt(u, max) {
  return 1 + (max - 1) * Math.min(smooth(0, 0.3, u), 1 - smooth(0.7, 1, u));
}

/** How far a cell is through its flip at u: cells flip one after another between 30% and 70%. */
export function flipAt(u, x, y) {
  const at = 0.3 + 0.34 * cellHash(x, y);
  return clamp((u - at) / 0.06);
}

// The shot in one look, drawn off-screen so it can be sampled.
function shot(p, look) {
  const c = p.canvas(p.W, p.H), old = p.ctx;
  p.ctx = c.getContext('2d');
  try { if (look && look !== 'none') p.footage({ look }); else p.footage(); } finally { p.ctx = old; }
  return c;
}

// One colour per cell: the shot shrunk so each pixel is one cell.
function cells(p, src, k) {
  const w = Math.ceil(p.W / k), h = Math.ceil(p.H / k), s = p.canvas(w, h), g = s.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'medium';
  g.drawImage(src, 0, 0, p.W / k, p.H / k);
  return { w, h, d: g.getImageData(0, 0, w, h).data };
}

export default {
  draw(p, { t, dur, props }) {
    const u = clamp(t / Math.max(0.01, dur)), max = Math.max(2, Number(props.size) || 36) * (p.W / 1080);
    const from = String(props.from ?? 'none'), to = String(props.to ?? 'none');
    const k = Math.round(blockAt(u, max)), c = p.ctx;
    if (k < 2) { // sharp: just the side we're on
      if (u < 0.5) { if (from !== 'none') p.footage({ look: from }); else p.footage(); }
      else if (to !== 'none') p.footage({ look: to }); else p.footage();
      return;
    }
    const a = cells(p, shot(p, from), k), b = u > 0.3 ? cells(p, shot(p, to), k) : a;
    const fill = (src, i, x, y, s) => {
      c.fillStyle = `rgb(${src.d[i]},${src.d[i + 1]},${src.d[i + 2]})`;
      c.fillRect(x + (k - k * s) / 2, y + (k - k * s) / 2, k * s + 0.5, k * s + 0.5);
    };
    c.save();
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const f = b === a ? 0 : flipAt(u, x, y), i = (y * a.w + x) * 4;
      // A flipping cell's new colour grows out of its middle over the old one, so there's never a gap.
      if (f < 1) fill(a, i, x * k, y * k, 1);
      if (f > 0) fill(b, i, x * k, y * k, smooth(0, 1, f));
    }
    c.restore();
  },
};
