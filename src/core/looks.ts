// Footage looks: the shot redrawn as neon, a pencil sketch, a comic, chalk on a board, pixel art, a riso print,
// low poly, paper cut, bricks or a terminal. The footage is sampled small (each look on its own grid), read back
// as pixels and drawn again into the rect. Pure: the same frame at the same t gives the same pixels.
import { motion, clamp } from './motion';
import type { Ctx, Painter, Rect } from './painter';

export const LOOKS = ['neon', 'sketch', 'comic', 'chalk', 'pixel', 'riso', 'lowpoly', 'papercut', 'bricks', 'terminal'] as const;
export type Look = (typeof LOOKS)[number];
export const LOOK_NAMES: Record<Look, string> = {
  neon: 'Neon', sketch: 'Pencil sketch', comic: 'Comic', chalk: 'Chalkboard', pixel: 'Pixel art',
  riso: 'Riso print', lowpoly: 'Low poly', papercut: 'Paper cut', bricks: 'Bricks', terminal: 'Terminal',
};
export const isLook = (v: unknown): v is Look => typeof v === 'string' && (LOOKS as readonly string[]).includes(v);

// Samples across the rect: coarse looks sample on their own grid (one sample per pixel, brick, dot or character).
const ACROSS: Partial<Record<Look, number>> = { pixel: 72, bricks: 32, terminal: 60, riso: 90, lowpoly: 120, papercut: 270 };
const CHAR = 1.7; // a terminal character cell is this much taller than wide

/** The sample grid for a look drawn into a rect of rw×rh: [across, down]. Never finer than the rect. */
export function lookSample(look: Look, rw: number, rh: number): [number, number] {
  const across = Math.max(1, Math.min(Math.round(rw), ACROSS[look] ?? 360));
  const cell = rw / across;
  const down = Math.max(1, Math.min(Math.round(rh), Math.round(rh / (cell * (look === 'terminal' ? CHAR : 1)))));
  return [across, down];
}

/** Luma, 0..1, per pixel of an RGBA image. */
export function lumaOf(d: ArrayLike<number>, w: number, h: number): Float32Array {
  const l = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) l[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  return l;
}

/** Sobel edge strength, 0..1 (a full black-to-white step is 1). Borders repeat the edge pixel. */
export function edges(l: Float32Array, w: number, h: number): Float32Array {
  const e = new Float32Array(w * h);
  const at = (x: number, y: number) => l[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
    const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
    e[y * w + x] = Math.min(1, Math.hypot(gx, gy) / 4);
  }
  return e;
}

/** A channel (0..255) snapped to `levels` even steps. */
export function posterize(v: number, levels: number): number {
  const step = 255 / (levels - 1);
  return Math.round(Math.round(v / step) * step);
}

const RAMP = ' .:-=+*#%@';
/** The character for a brightness (0..1), from blank to dense. */
export function asciiFor(v: number): string {
  return RAMP[Math.min(RAMP.length - 1, Math.floor(clamp(v) * RAMP.length))];
}

type Pt = [number, number];
/** Triangles that tile a w×h rect: a jittered grid of about `cell` px, two triangles per square. Same seed, same mesh. */
export function mesh(w: number, h: number, cell: number, seed: number): [Pt, Pt, Pt][] {
  const cols = Math.max(1, Math.round(w / cell)), rows = Math.max(1, Math.round(h / cell));
  const r = motion.rng(seed), cw = w / cols, ch = h / rows;
  // Jitter of a fifth of a cell keeps every square convex; edge points slide only along their edge.
  const pts: Pt[][] = [];
  for (let j = 0; j <= rows; j++) {
    const row: Pt[] = [];
    for (let i = 0; i <= cols; i++) {
      const jx = i > 0 && i < cols ? (r() - 0.5) * 0.4 * cw : 0, jy = j > 0 && j < rows ? (r() - 0.5) * 0.4 * ch : 0;
      row.push([i * cw + jx, j * ch + jy]);
    }
    pts.push(row);
  }
  const tris: [Pt, Pt, Pt][] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = pts[j][i], b = pts[j][i + 1], c = pts[j + 1][i + 1], d = pts[j + 1][i];
    if ((i + j) % 2) tris.push([a, b, c], [a, c, d]); else tris.push([a, b, d], [b, c, d]);
  }
  return tris;
}

// ---- drawing ----------------------------------------------------------------------------------------------

type Img = { data: Uint8ClampedArray; width: number; height: number };
type RGB = [number, number, number];
const rgbOf = (hex: string): RGB => {
  const h = hex.replace('#', ''), f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0) as RGB;
};
const css = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const smooth = (v: number, a: number, b: number) => { const x = clamp((v - a) / (b - a)); return x * x * (3 - 2 * x); };

/** Luma remapped so the darkest 2 % is 0 and the brightest 2 % is 1 (dim footage still fills the range). */
function stretch(l: Float32Array): Float32Array {
  const hist = new Uint32Array(256);
  for (const v of l) hist[Math.min(255, (v * 255) | 0)]++;
  const cut = l.length * 0.02;
  let lo = 0, hi = 255, n = 0;
  while (lo < 255 && (n += hist[lo]) < cut) lo++;
  n = 0;
  while (hi > 0 && (n += hist[hi]) < cut) hi--;
  const span = Math.max(1, hi - lo) / 255, base = lo / 255, out = new Float32Array(l.length);
  for (let i = 0; i < l.length; i++) out[i] = clamp((l[i] - base) / span);
  return out;
}

/** A box blur of a w×h field (two passes), for soft paper shapes. */
function blur(l: Float32Array, w: number, h: number, rad: number): Float32Array {
  let a: Float32Array = l, b: Float32Array = new Float32Array(l.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -rad; k <= rad; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } }
      b[y * w + x] = s / n;
    }
    [a, b] = [b, a];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -rad; k <= rad; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += a[yy * w + x]; n++; } }
      b[y * w + x] = s / n;
    }
    [a, b] = [b, a];
  }
  return a;
}

/** A canvas of w×h filled pixel by pixel. */
function pixels(p: Painter, w: number, h: number, fill: (out: Uint8ClampedArray) => void): OffscreenCanvas {
  const cv = p.canvas(w, h), g = cv.getContext('2d')!, id = g.createImageData(w, h);
  fill(id.data);
  g.putImageData(id, 0, 0);
  return cv;
}

const put = (c: Ctx, cv: CanvasImageSource, r: Rect, crisp = false) => {
  const was = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = !crisp;
  c.drawImage(cv, r.x, r.y, r.w, r.h);
  c.imageSmoothingEnabled = was;
};

const LOOK_DRAW: Record<Look, (p: Painter, r: Rect, src: OffscreenCanvas, img: Img) => void> = {
  neon(p, r, src, { data, width: w, height: h }) {
    const c = p.ctx, e = edges(lumaOf(data, w, h), w, h);
    const cyan: RGB = [41, 230, 255], pink: RGB = [255, 61, 242];
    c.fillStyle = '#07040f'; c.fillRect(r.x, r.y, r.w, r.h);
    c.save(); c.globalAlpha *= 0.18; c.filter = 'saturate(1.6)'; put(c, src, r); c.restore();
    const lines = pixels(p, w, h, (o) => {
      for (let y = 0; y < h; y++) {
        const col = mix(cyan, pink, y / h);
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          o[i * 4] = col[0]; o[i * 4 + 1] = col[1]; o[i * 4 + 2] = col[2]; o[i * 4 + 3] = 255 * smooth(e[i], 0.1, 0.4);
        }
      }
    });
    const flicker = 0.9 + 0.1 * Math.sin(p.t * 23) * Math.sin(p.t * 7.3);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha *= flicker;
    c.filter = `blur(${(p.rem * 0.35).toFixed(1)}px)`; put(c, lines, r); put(c, lines, r);
    c.filter = 'none'; put(c, lines, r);
    c.restore();
  },

  sketch(p, r, _src, { data, width: w, height: h }) {
    const l = stretch(lumaOf(data, w, h)), e = edges(l, w, h);
    const step = Math.floor(p.t * 8), jr = p.rng(`sketch${step}`), ox = Math.round(jr() * 2 - 1), oy = Math.round(jr() * 2 - 1);
    const paper: RGB = [239, 233, 220], lead: RGB = [43, 43, 48];
    const cv = pixels(p, w, h, (o) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const sx = Math.min(w - 1, Math.max(0, x + ox)), sy = Math.min(h - 1, Math.max(0, y + oy)), i = sy * w + sx, v = l[i];
        let tone = clamp((e[i] - 0.06) * 2.2);
        if (v < 0.55 && (x + y + step) % 5 === 0) tone += 0.3;
        if (v < 0.3 && (x - y + 1000 + step) % 5 === 0) tone += 0.3;
        const col = mix(paper, lead, clamp(tone) * 0.9), k = (y * w + x) * 4;
        o[k] = col[0]; o[k + 1] = col[1]; o[k + 2] = col[2]; o[k + 3] = 255;
      }
    });
    put(p.ctx, cv, r);
  },

  comic(p, r, _src, { data, width: w, height: h }) {
    const c = p.ctx, l = lumaOf(data, w, h), e = edges(l, w, h);
    const cv = pixels(p, w, h, (o) => {
      for (let i = 0; i < w * h; i++) {
        const k = i * 4, y = l[i] * 255;
        for (let ch = 0; ch < 3; ch++) o[k + ch] = e[i] > 0.22 ? 12 : posterize(clamp((y + (data[k + ch] - y) * 1.7) / 255 * 1.1) * 255, 4);
        o[k + 3] = 255;
      }
    });
    put(c, cv, r);
    // Halftone dots in the shadows.
    const cell = r.w / 70, cols = Math.ceil(r.w / cell), rows = Math.ceil(r.h / cell);
    c.save();
    c.fillStyle = 'rgba(24,12,48,0.42)';
    c.beginPath();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = r.x + (i + 0.5 + (j % 2) * 0.5) * cell, y = r.y + (j + 0.5) * cell;
      const v = l[Math.min(h - 1, Math.floor(((y - r.y) / r.h) * h)) * w + Math.min(w - 1, Math.floor(((x - r.x) / r.w) * w))];
      if (v >= 0.55) continue;
      const rad = cell * 0.55 * Math.sqrt((0.55 - v) / 0.55);
      c.moveTo(x + rad, y); c.arc(x, y, rad, 0, Math.PI * 2);
    }
    c.fill();
    c.restore();
  },

  chalk(p, r, src, { data, width: w, height: h }) {
    const c = p.ctx, e = edges(stretch(lumaOf(data, w, h)), w, h), g = p.rng(`chalk${Math.floor(p.t * 6)}`);
    c.fillStyle = '#1d3b2f'; c.fillRect(r.x, r.y, r.w, r.h);
    c.save(); c.globalAlpha *= 0.07; c.globalCompositeOperation = 'screen'; c.filter = 'grayscale(1) blur(2px)'; put(c, src, r); c.restore();
    const cv = pixels(p, w, h, (o) => {
      for (let i = 0; i < w * h; i++) {
        const k = i * 4;
        o[k] = 241; o[k + 1] = 241; o[k + 2] = 230; o[k + 3] = 255 * clamp((e[i] - 0.06) * 3.4) * (0.5 + 0.5 * g());
      }
    });
    put(c, cv, r);
  },

  pixel(p, r, _src, { data, width: w, height: h }) {
    const cv = pixels(p, w, h, (o) => {
      for (let i = 0; i < w * h * 4; i += 4) {
        const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        for (let ch = 0; ch < 3; ch++) o[i + ch] = posterize(Math.min(255, Math.max(0, y + (data[i + ch] - y) * 1.35)), 5);
        o[i + 3] = 255;
      }
    });
    put(p.ctx, cv, r, true);
  },

  riso(p, r, _src, { data, width: w, height: h }) {
    const c = p.ctx, l = stretch(lumaOf(data, w, h)), cw = r.w / w, ch = r.h / h;
    c.fillStyle = '#f3eee3'; c.fillRect(r.x, r.y, r.w, r.h);
    const inks: { color: string; dx: number; dy: number; shift: number; amount: (i: number) => number }[] = [
      { color: '#ff48b0', dx: p.rem * 0.14, dy: p.rem * 0.09, shift: 0.5, amount: (i) => clamp(((data[i * 4] - data[i * 4 + 2]) / 255) * 1.6 + 0.1) * 0.8 + (1 - l[i]) * 0.3 },
      { color: '#0078bf', dx: 0, dy: 0, shift: 0, amount: (i) => (1 - l[i]) * 1.05 - 0.08 },
    ];
    c.save();
    c.globalCompositeOperation = 'multiply';
    for (const ink of inks) {
      c.fillStyle = ink.color;
      c.beginPath();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const a = clamp(ink.amount(y * w + x));
        if (a < 0.04) continue;
        const rad = Math.max(cw, ch) * 0.62 * Math.sqrt(a);
        const px = r.x + (x + 0.5 + ink.shift * (y % 2)) * cw + ink.dx, py = r.y + (y + 0.5) * ch + ink.dy;
        c.moveTo(px + rad, py); c.arc(px, py, rad, 0, Math.PI * 2);
      }
      c.fill();
    }
    c.restore();
  },

  lowpoly(p, r, _src, { data, width: w, height: h }) {
    const c = p.ctx, shade = p.rng('facets');
    const at = (x: number, y: number): RGB => {
      const k = (Math.min(h - 1, Math.max(0, Math.floor((y / r.h) * h))) * w + Math.min(w - 1, Math.max(0, Math.floor((x / r.w) * w)))) * 4;
      return [data[k], data[k + 1], data[k + 2]];
    };
    c.save();
    c.translate(r.x, r.y);
    c.lineJoin = 'round';
    c.lineWidth = 1;
    for (const [a, b, d] of mesh(r.w, r.h, r.w / 22, 11)) {
      const cx = (a[0] + b[0] + d[0]) / 3, cy = (a[1] + b[1] + d[1]) / 3;
      const s = [at(cx, cy), at((a[0] + cx) / 2, (a[1] + cy) / 2), at((b[0] + cx) / 2, (b[1] + cy) / 2), at((d[0] + cx) / 2, (d[1] + cy) / 2)];
      const avg = s.reduce((m, v) => [m[0] + v[0] / 4, m[1] + v[1] / 4, m[2] + v[2] / 4] as RGB, [0, 0, 0] as RGB);
      const k = 0.9 + shade() * 0.2, col = css([Math.min(255, avg[0] * k), Math.min(255, avg[1] * k), Math.min(255, avg[2] * k)]);
      c.fillStyle = col; c.strokeStyle = col;
      c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.lineTo(...d); c.closePath(); c.fill(); c.stroke();
    }
    c.restore();
  },

  papercut(p, r, _src, { data, width: w, height: h }) {
    const c = p.ctx, l = blur(lumaOf(data, w, h), w, h, 3), bands = 5;
    const sorted = Float32Array.from(l).sort(), th = Array.from({ length: bands }, (_, k) => sorted[Math.floor((k / bands) * (sorted.length - 1))]);
    const band = (v: number) => { let k = 0; while (k + 1 < bands && v >= th[k + 1]) k++; return k; };
    // Each layer takes the shot's average colour in its band, a little lighter and flatter, like card stock.
    const sum = Array.from({ length: bands }, () => [0, 0, 0, 0]);
    for (let i = 0; i < w * h; i++) { const s = sum[band(l[i])]; s[0] += data[i * 4]; s[1] += data[i * 4 + 1]; s[2] += data[i * 4 + 2]; s[3]++; }
    const cols = sum.map(([a, b, d, n], k) => mix([a / (n || 1), b / (n || 1), d / (n || 1)], [245, 240, 228], 0.18 + k * 0.04));
    c.fillStyle = css(cols[0]); c.fillRect(r.x, r.y, r.w, r.h);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = p.rem * 0.6; c.shadowOffsetY = p.rem * 0.2;
    for (let k = 1; k < bands; k++) {
      const col = cols[k];
      const layer = pixels(p, w, h, (o) => {
        for (let i = 0; i < w * h; i++) {
          o[i * 4] = col[0]; o[i * 4 + 1] = col[1]; o[i * 4 + 2] = col[2];
          o[i * 4 + 3] = 255 * smooth(l[i], th[k] - 0.01, th[k] + 0.01);
        }
      });
      put(c, layer, r);
    }
    c.restore();
  },

  bricks(p, r, _src, { data, width: w, height: h }) {
    const c = p.ctx, cw = r.w / w, ch = r.h / h, rad = Math.min(cw, ch) * 0.3;
    c.save();
    c.lineWidth = Math.max(1, cw * 0.04);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4, lum = 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
      const col = [0, 1, 2].map((i) => posterize(Math.min(255, Math.max(0, lum + (data[k + i] - lum) * 1.4)), 6)) as RGB;
      const bx = r.x + x * cw, by = r.y + y * ch, cx = bx + cw / 2, cy = by + ch / 2;
      c.fillStyle = css(col); c.fillRect(bx, by, cw + 0.5, ch + 0.5);
      c.strokeStyle = 'rgba(0,0,0,0.28)'; c.strokeRect(bx, by, cw, ch);
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(cx + rad * 0.15, cy + rad * 0.22, rad, 0, Math.PI * 2); c.fill();
      c.fillStyle = css(mix(col, [255, 255, 255], 0.14)); c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.arc(cx, cy, rad * 0.75, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
    }
    c.restore();
  },

  terminal(p, r, _src, { data, width: w, height: h }) {
    const c = p.ctx, l = stretch(lumaOf(data, w, h)), cw = r.w / w, ch = r.h / h;
    c.fillStyle = '#030a05'; c.fillRect(r.x, r.y, r.w, r.h);
    c.save();
    p.font('mono', ch * 0.9, 600);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'ltr';
    c.fillStyle = '#3dff7a';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = l[y * w + x], s = asciiFor(v);
      if (s === ' ') continue;
      c.globalAlpha = 0.35 + 0.65 * v;
      c.fillText(s, r.x + (x + 0.5) * cw, r.y + (y + 0.5) * ch);
    }
    c.globalAlpha = 1;
    // Scanlines, and a slow bright band rolling down.
    c.fillStyle = 'rgba(0,0,0,0.22)';
    const gap = Math.max(2, p.rem / 10);
    for (let y = r.y; y < r.y + r.h; y += gap * 2) c.fillRect(r.x, y, r.w, gap);
    const by = r.y + ((p.t * 0.3) % 1) * r.h, band = c.createLinearGradient(0, by - r.h * 0.08, 0, by + r.h * 0.08);
    band.addColorStop(0, 'rgba(61,255,122,0)'); band.addColorStop(0.5, 'rgba(61,255,122,0.07)'); band.addColorStop(1, 'rgba(61,255,122,0)');
    c.fillStyle = band; c.fillRect(r.x, by - r.h * 0.08, r.w, r.h * 0.16);
    c.restore();
  },
};

/** Draws the footage through a look. `plain` draws the plain footage with a given painter (the sample's). */
export function drawLooked(p: Painter, look: Look, r: Rect, alpha: number | undefined, plain: (q: Painter, rect: Rect) => void) {
  const [sw, sh] = lookSample(look, r.w, r.h);
  // The shot at the rect's own shape first (footage crops to the shape it's given), then onto the look's grid.
  const ah = Math.max(1, Math.round((sw * r.h) / r.w));
  const shot = p.canvas(sw, ah), a = shot.getContext('2d', { willReadFrequently: true })!;
  a.imageSmoothingQuality = 'high'; // an area-averaged shrink, so a coarse brick grid doesn't flicker
  const q = Object.create(p) as Painter;
  q.ctx = a;
  plain(q, { x: 0, y: 0, w: sw, h: ah });
  let sample = shot, g = a;
  if (ah !== sh) {
    sample = p.canvas(sw, sh); g = sample.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(shot, 0, 0, sw, sh);
  }
  const img = g.getImageData(0, 0, sw, sh);
  const c = p.ctx;
  c.save();
  if (alpha !== undefined) c.globalAlpha *= alpha;
  c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  LOOK_DRAW[look](p, r, sample, img);
  c.restore();
}
