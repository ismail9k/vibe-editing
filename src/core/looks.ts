// Footage looks: the shot redrawn as neon, a pencil sketch, a comic, chalk on a board, pixel art, a riso print,
// low poly, paper cut, bricks, a terminal, a hologram, a cyberpunk grade, isometric cubes, a blueprint, a thermal
// camera, anime cels, watercolour or clay. The footage is sampled small (each look on its own grid), read back as
// pixels and drawn again into the rect. Pure: the same frame at the same t gives the same pixels.
import { motion, clamp } from './motion';
import type { Ctx, Painter, Rect } from './painter';

export const LOOKS = [
  'neon', 'sketch', 'comic', 'chalk', 'pixel', 'riso', 'lowpoly', 'papercut', 'bricks', 'terminal',
  'hologram', 'cyberpunk', 'isometric', 'blueprint', 'thermal', 'anime', 'watercolor', 'clay',
] as const;
export type Look = (typeof LOOKS)[number];
export const LOOK_NAMES: Record<Look, string> = {
  neon: 'Neon', sketch: 'Pencil sketch', comic: 'Comic', chalk: 'Chalkboard', pixel: 'Pixel art',
  riso: 'Riso print', lowpoly: 'Low poly', papercut: 'Paper cut', bricks: 'Bricks', terminal: 'Terminal',
  hologram: 'Hologram', cyberpunk: 'Cyberpunk neon', isometric: 'Isometric', blueprint: 'Blueprint',
  thermal: 'Thermal cam', anime: 'Anime cel', watercolor: 'Watercolour', clay: 'Claymation',
};
export const isLook = (v: unknown): v is Look => typeof v === 'string' && (LOOKS as readonly string[]).includes(v);

// Samples across the rect: coarse looks sample on their own grid (one sample per pixel, brick, dot, character or
// cube). Thermal and clay sample softer than the default on purpose: both should read smooth, not detailed.
const ACROSS: Partial<Record<Look, number>> = {
  pixel: 72, bricks: 32, terminal: 60, riso: 90, lowpoly: 120, papercut: 270, isometric: 44, thermal: 200, clay: 240,
};
// How much taller than wide a sample cell is: terminal characters are tall, isometric cube rows overlap
// (a row of pointy-top hexagons advances √3/2 of a cube's width).
const ASPECT: Partial<Record<Look, number>> = { terminal: 1.7, isometric: Math.sqrt(3) / 2 };

/** The sample grid for a look drawn into a rect of rw×rh: [across, down]. Never finer than the rect. */
export function lookSample(look: Look, rw: number, rh: number): [number, number] {
  const across = Math.max(1, Math.min(Math.round(rw), ACROSS[look] ?? 360));
  const cell = rw / across;
  const down = Math.max(1, Math.min(Math.round(rh), Math.round(rh / (cell * (ASPECT[look] ?? 1)))));
  return [across, down];
}

/** A colour ramp: `stops` are [position 0..1, colour], in order. Returns the colour at v. */
export function ramp(stops: [number, [number, number, number]][], v: number): [number, number, number] {
  const x = clamp(v);
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    if (x <= p1) {
      const [p0, c0] = stops[i - 1], k = p1 > p0 ? (x - p0) / (p1 - p0) : 1;
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  return [...stops[stops.length - 1][1]];
}

/** Heat for the thermal look, 0..1: brightness, pushed up for warm colours (skin, a red top) and down for cool. */
export function heatOf(r: number, g: number, b: number): number {
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return clamp(0.55 * l + 0.45 * clamp((r - b) / 255 + 0.35));
}

/** The six corners and centre of a pointy-top cube (a hexagon of width w) centred on x, y. */
export function cube(x: number, y: number, w: number) {
  const r = w / Math.sqrt(3), hw = w / 2;
  return {
    top: [x, y - r], ur: [x + hw, y - r / 2], lr: [x + hw, y + r / 2],
    bottom: [x, y + r], ll: [x - hw, y + r / 2], ul: [x - hw, y - r / 2], mid: [x, y],
  } as Record<'top' | 'ur' | 'lr' | 'bottom' | 'll' | 'ul' | 'mid', [number, number]>;
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

/** The red, green and blue planes (0..255) of an image, each box-blurred by `rad` (0 = as is). */
function planes({ data, width: w, height: h }: Img, rad: number): [Float32Array, Float32Array, Float32Array] {
  const out = [0, 1, 2].map((ch) => {
    const a = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = data[i * 4 + ch];
    return rad > 0 ? blur(a, w, h, rad) : a;
  });
  return out as [Float32Array, Float32Array, Float32Array];
}

/** A size unit for drawing on top of a look: about one rem on a full frame, smaller on a tile. */
const unitOf = (r: Rect) => r.w / 34;

/** Darkened corners, `amount` 0..1. */
function vignette(c: Ctx, r: Rect, amount: number, rgb = '0,0,0') {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, g = c.createRadialGradient(cx, cy, Math.min(r.w, r.h) * 0.35, cx, cy, Math.hypot(r.w, r.h) / 2);
  g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${amount})`);
  c.fillStyle = g; c.fillRect(r.x, r.y, r.w, r.h);
}

/** Thin dark scanlines across the rect, and a soft bright band rolling down it once every 1 / speed seconds. */
function scanlines(p: Painter, r: Rect, band: string, speed: number) {
  const c = p.ctx, gap = Math.max(1.5, unitOf(r) / 10);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = r.y; y < r.y + r.h; y += gap * 2) c.fillRect(r.x, y, r.w, gap);
  const by = r.y + ((p.t * speed) % 1) * r.h, g = c.createLinearGradient(0, by - r.h * 0.08, 0, by + r.h * 0.08);
  g.addColorStop(0, `rgba(${band},0)`); g.addColorStop(0.5, `rgba(${band},0.1)`); g.addColorStop(1, `rgba(${band},0)`);
  c.fillStyle = g; c.fillRect(r.x, by - r.h * 0.08, r.w, r.h * 0.16);
}

const IRONBOW: [number, RGB][] = [[0, [4, 0, 18]], [0.22, [48, 4, 120]], [0.45, [168, 18, 150]], [0.65, [236, 76, 52]], [0.83, [255, 168, 20]], [1, [255, 250, 200]]];
const CYBER: [number, RGB][] = [[0, [4, 6, 26]], [0.3, [8, 74, 112]], [0.62, [150, 40, 205]], [0.86, [255, 92, 205]], [1, [255, 228, 246]]];

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

  hologram(p, r, _src, { data, width: w, height: h }) {
    const c = p.ctx, u = unitOf(r), l = stretch(lumaOf(data, w, h)), e = edges(l, w, h);
    const deep: RGB = [0, 64, 118], cyan: RGB = [150, 246, 255];
    c.fillStyle = '#01060d'; c.fillRect(r.x, r.y, r.w, r.h);
    // The projector: a glow rising from the floor.
    const fx = r.x + r.w / 2, glow = c.createRadialGradient(fx, r.y + r.h, 0, fx, r.y + r.h, r.w * 0.9);
    glow.addColorStop(0, 'rgba(40,200,255,0.28)'); glow.addColorStop(1, 'rgba(40,200,255,0)');
    c.fillStyle = glow; c.fillRect(r.x, r.y, r.w, r.h);
    // See-through light: brighter where the shot is bright, brightest on its edges.
    const body = pixels(p, w, h, (o) => {
      for (let i = 0; i < w * h; i++) {
        const v = l[i], col = mix(deep, cyan, clamp(v * 0.8 + e[i] * 1.2)), k = i * 4;
        o[k] = col[0]; o[k + 1] = col[1]; o[k + 2] = col[2]; o[k + 3] = 255 * 0.9 * clamp(v * 0.8 + e[i] * 1.8);
      }
    });
    const flicker = 0.86 + 0.14 * Math.sin(p.t * 31) * Math.sin(p.t * 5.7);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha *= flicker;
    c.filter = `blur(${(u * 0.5).toFixed(1)}px)`; put(c, body, r);
    c.filter = 'none';
    // The sharp layer in strips; now and then a few slip sideways, a dozen times a second (the glitch).
    const g = p.rng(`holo${Math.floor(p.t * 12)}`), strips = 24, sh = r.h / strips;
    for (let k = 0; k < strips; k++) {
      const slip = g() < 0.08 ? (g() - 0.5) * u * 1.4 : 0;
      c.save();
      c.beginPath(); c.rect(r.x, r.y + k * sh, r.w, sh + 0.5); c.clip();
      c.drawImage(body, r.x + slip, r.y, r.w, r.h);
      c.restore();
    }
    c.restore();
    scanlines(p, r, '120,240,255', 0.35);
  },

  cyberpunk(p, r, _src, { data, width: w, height: h }) {
    const c = p.ctx, u = unitOf(r), l = stretch(lumaOf(data, w, h));
    // Teal shadows, magenta highlights, with the shot's own colours kept (and pushed) underneath.
    const graded = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const k = i * 4, y = 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2], grade = ramp(CYBER, l[i]);
      for (let ch = 0; ch < 3; ch++) graded[k + ch] = (y + (data[k + ch] - y) * 1.5) * 0.4 + grade[ch] * 0.6;
      graded[k + 3] = 255;
    }
    put(c, pixels(p, w, h, (o) => o.set(graded)), r);
    // Only the bright parts bloom.
    const bright = pixels(p, w, h, (o) => {
      o.set(graded);
      for (let i = 0; i < w * h; i++) o[i * 4 + 3] = 255 * smooth(l[i], 0.55, 0.92);
    });
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha *= 0.6;
    c.filter = `blur(${(u * 0.7).toFixed(1)}px)`; put(c, bright, r);
    c.filter = `blur(${(u * 2).toFixed(1)}px)`; put(c, bright, r);
    c.restore();
    // Haze: magenta hanging from the top, teal on the floor.
    c.save();
    c.globalCompositeOperation = 'screen';
    const haze = c.createLinearGradient(0, r.y, 0, r.y + r.h);
    haze.addColorStop(0, 'rgba(255,40,200,0.2)'); haze.addColorStop(0.45, 'rgba(255,40,200,0)');
    haze.addColorStop(0.75, 'rgba(0,200,255,0)'); haze.addColorStop(1, 'rgba(0,200,255,0.16)');
    c.fillStyle = haze; c.fillRect(r.x, r.y, r.w, r.h);
    c.restore();
    vignette(c, r, 0.55, '6,0,24');
  },

  isometric(p, r, _src, { data, width: w, height: h }) {
    const c = p.ctx, cw = r.w / w, pitch = r.h / h;
    c.fillStyle = '#f4d8c6'; c.fillRect(r.x, r.y, r.w, r.h);
    c.save();
    c.lineJoin = 'round';
    c.lineWidth = Math.max(0.5, cw * 0.03);
    const white: RGB = [255, 248, 240], shade: RGB = [40, 24, 40];
    // A pointy-top cube per sample; odd rows sit half a cube along, so the cubes tile like a honeycomb. One more
    // row and one more cube on odd rows cover the ragged edges.
    for (let y = 0; y <= h; y++) for (let x = y % 2 ? -1 : 0; x < w; x++) {
      const k = (Math.min(h - 1, y) * w + Math.max(0, x)) * 4, lum = 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
      // Toy plastic: brighter, a little more saturated, a few steps, a touch of white.
      const col = mix([0, 1, 2].map((i) => posterize(Math.min(255, Math.max(0, (lum + (data[k + i] - lum) * 1.25) * 1.08)), 7)) as RGB, white, 0.12);
      const q = cube(r.x + (x + (y % 2 ? 1 : 0.5)) * cw, r.y + (y + 0.5) * pitch, cw);
      const faces: [[number, number][], RGB][] = [
        [[q.top, q.ur, q.mid, q.ul], mix(col, white, 0.3)],
        [[q.ul, q.mid, q.bottom, q.ll], col],
        [[q.mid, q.ur, q.lr, q.bottom], mix(col, shade, 0.28)],
      ];
      for (const [pts, fc] of faces) {
        const s = css(fc);
        c.fillStyle = s; c.strokeStyle = s;
        c.beginPath(); c.moveTo(...pts[0]); for (const pt of pts.slice(1)) c.lineTo(...pt); c.closePath(); c.fill(); c.stroke();
      }
    }
    c.restore();
  },

  blueprint(p, r, _src, { data, width: w, height: h }) {
    const c = p.ctx, u = unitOf(r), l = stretch(lumaOf(data, w, h)), e = edges(blur(l, w, h, 1), w, h);
    const bg = c.createRadialGradient(r.x + r.w / 2, r.y + r.h * 0.45, 0, r.x + r.w / 2, r.y + r.h * 0.45, Math.hypot(r.w, r.h) * 0.6);
    bg.addColorStop(0, '#1a5bc4'); bg.addColorStop(1, '#0a2e72');
    c.fillStyle = bg; c.fillRect(r.x, r.y, r.w, r.h);
    // The drafting grid: a fine line every unit, a stronger one every fifth.
    c.save();
    const step = r.w / 34;
    for (let k = 0, x = r.x; x <= r.x + r.w; k++, x += step) {
      c.fillStyle = k % 5 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.2)'; c.fillRect(x, r.y, 1, r.h);
    }
    for (let k = 0, y = r.y; y <= r.y + r.h; k++, y += step) {
      c.fillStyle = k % 5 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.2)'; c.fillRect(r.x, y, r.w, 1);
    }
    // A ghost of the shot, then the drawing: white lines on its edges, faintly glowing.
    const lines = pixels(p, w, h, (o) => {
      for (let i = 0; i < w * h; i++) {
        const k = i * 4;
        o[k] = 235; o[k + 1] = 245; o[k + 2] = 255; o[k + 3] = 255 * Math.max(smooth(e[i], 0.07, 0.28), l[i] * 0.1);
      }
    });
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha *= 0.5; c.filter = `blur(${(u * 0.25).toFixed(1)}px)`; put(c, lines, r);
    c.globalAlpha /= 0.5; c.filter = 'none'; put(c, lines, r);
    c.globalCompositeOperation = 'source-over';
    // A dimension line up the start side, and the title block in the corner.
    c.strokeStyle = 'rgba(235,245,255,0.8)'; c.fillStyle = 'rgba(235,245,255,0.85)';
    c.lineWidth = Math.max(1, u * 0.06);
    const dx = r.x + u * 1.4, y0 = r.y + r.h * 0.12, y1 = r.y + r.h * 0.9;
    c.setLineDash([u * 0.4, u * 0.25]);
    c.beginPath(); c.moveTo(dx, y0); c.lineTo(dx, y1); c.stroke();
    c.setLineDash([]);
    c.beginPath(); for (const y of [y0, y1]) { c.moveTo(dx - u * 0.5, y); c.lineTo(dx + u * 0.5, y); } c.stroke();
    p.font('mono', u * 0.55, 600);
    c.direction = 'ltr'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.save(); c.translate(dx + u * 0.5, (y0 + y1) / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillText('1 720', 0, 0); c.restore();
    const bw = u * 8, bh = u * 2.2, bx = r.x + r.w - bw - u, by = r.y + r.h - bh - u;
    c.strokeRect(bx, by, bw, bh);
    c.beginPath(); c.moveTo(bx, by + bh / 2); c.lineTo(bx + bw, by + bh / 2); c.stroke();
    c.fillText('DWG 01 · SHOT', bx + u * 0.4, by + bh / 4);
    c.fillText('SCALE 1:10', bx + u * 0.4, by + (bh * 3) / 4);
    c.restore();
  },

  thermal(p, r, _src, img) {
    const c = p.ctx, u = unitOf(r), { data, width: w, height: h } = img;
    const raw = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) raw[i] = heatOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    const heat = stretch(blur(raw, w, h, 1));
    const cv = pixels(p, w, h, (o) => {
      for (let i = 0; i < w * h; i++) {
        const col = ramp(IRONBOW, heat[i]), k = i * 4;
        o[k] = col[0]; o[k + 1] = col[1]; o[k + 2] = col[2]; o[k + 3] = 255;
      }
    });
    put(c, cv, r);
    // The camera's overlay: a crosshair reading the centre, and the scale on the end side.
    c.save();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, arm = u * 1.1, gap = u * 0.35;
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = Math.max(1, u * 0.08);
    c.beginPath();
    c.moveTo(cx - arm, cy); c.lineTo(cx - gap, cy); c.moveTo(cx + gap, cy); c.lineTo(cx + arm, cy);
    c.moveTo(cx, cy - arm); c.lineTo(cx, cy - gap); c.moveTo(cx, cy + gap); c.lineTo(cx, cy + arm);
    c.stroke();
    const centre = heat[Math.floor(h / 2) * w + Math.floor(w / 2)], deg = (v: number) => `${(18 + v * 20).toFixed(1)}°C`;
    p.font('mono', u * 0.7, 700);
    c.direction = 'ltr'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
    c.fillText(deg(centre), cx + arm + u * 0.3, cy - arm * 0.6);
    const bx = r.x + r.w - u * 1.6, bt = r.y + r.h * 0.2, bb = r.y + r.h * 0.8, bar = c.createLinearGradient(0, bb, 0, bt);
    for (const [at, col] of IRONBOW) bar.addColorStop(at, css(col));
    c.fillStyle = bar; c.fillRect(bx, bt, u * 0.5, bb - bt);
    c.strokeRect(bx, bt, u * 0.5, bb - bt);
    p.font('mono', u * 0.5, 600);
    c.textAlign = 'right'; c.fillStyle = '#fff';
    c.fillText(deg(1), bx - u * 0.25, bt); c.fillText(deg(0), bx - u * 0.25, bb);
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.textAlign = 'left';
    c.fillText('● REC  IR', r.x + u, r.y + u * 1.2);
    c.restore();
  },

  anime(p, r, _src, img) {
    const { width: w, height: h } = img, [R, G, B] = planes(img, 1);
    const l = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) l[i] = (0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i]) / 255;
    const e = edges(l, w, h), ink: RGB = [34, 26, 40], air: RGB = [255, 252, 248];
    const cv = pixels(p, w, h, (o) => {
      for (let i = 0; i < w * h; i++) {
        const y = l[i] * 255, v = l[i];
        // Three flat tones (shadow, base, light) per colour, the hue kept: cel paint.
        const tone = v < 0.26 ? 0.4 : v < 0.6 ? 0.7 : 0.95, scale = (tone * 255 + 12) / (y + 12);
        const base = mix([R[i], G[i], B[i]].map((ch) => (y + (ch - y) * 1.35) * scale) as RGB, air, 0.08);
        const col = mix(base, ink, smooth(e[i], 0.14, 0.28)), k = i * 4;
        o[k] = col[0]; o[k + 1] = col[1]; o[k + 2] = col[2]; o[k + 3] = 255;
      }
    });
    put(p.ctx, cv, r);
  },

  watercolor(p, r, _src, img) {
    const { data, width: w, height: h } = img, [R, G, B] = planes(img, 2);
    const wash = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) wash[i] = (0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i]) / 255;
    // Pigment pools where the wash changes (the dark rim a drying wash leaves), and a pencil line under it.
    const far = blur(wash, w, h, 4), e = edges(stretch(lumaOf(data, w, h)), w, h);
    const grain = p.rng('paper'), paper: RGB = [247, 242, 231], fade = Math.max(2, w * 0.05);
    const cv = pixels(p, w, h, (o) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, n = grain(), y0 = 0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i];
        // The paint stops short of the paper's edge, raggedly.
        const edge = smooth(Math.min(x, w - 1 - x, y, h - 1 - y) / fade + (n - 0.5) * 0.7, 0.15, 1);
        // Pigment: the colour a little greyer and lighter than the shot's.
        const pig = [R[i], G[i], B[i]].map((ch) => { const v = y0 + (ch - y0) * 0.85; return v + (255 - v) * 0.12; });
        const density = 0.9 * edge * (0.88 + 0.12 * n), rim = 1 - 0.3 * clamp(Math.abs(wash[i] - far[i]) * 4);
        const line = 1 - 0.4 * smooth(e[i], 0.12, 0.35) * edge, k = i * 4;
        for (let ch = 0; ch < 3; ch++) o[k + ch] = paper[ch] * (1 - density * (1 - pig[ch] / 255)) * rim * line * (0.97 + 0.03 * n);
        o[k + 3] = 255;
      }
    });
    put(p.ctx, cv, r);
  },

  clay(p, r, _src, img) {
    const c = p.ctx, u = unitOf(r), { width: w, height: h } = img, [R, G, B] = planes(img, 2);
    const l = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) l[i] = (0.2126 * R[i] + 0.7152 * G[i] + 0.0722 * B[i]) / 255;
    // The shot's brightness as a height map: lit from the top-start corner, with a soft shine on the bumps.
    const hm = blur(l, w, h, 2), at = (x: number, y: number) => hm[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    const lx = -0.45, ly = -0.65, lz = 0.62, hl = Math.hypot(lx, ly, lz + 1), [hx, hy, hz] = [lx / hl, ly / hl, (lz + 1) / hl];
    const prints = p.rng('thumbprints'), warm: RGB = [255, 228, 200];
    const cv = pixels(p, w, h, (o) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, gx = (at(x + 1, y) - at(x - 1, y)) * 7, gy = (at(x, y + 1) - at(x, y - 1)) * 7;
        const nl = Math.hypot(gx, gy, 1), nx = -gx / nl, ny = -gy / nl, nz = 1 / nl;
        const diff = Math.max(0, nx * lx + ny * ly + nz * lz), spec = Math.max(0, nx * hx + ny * hy + nz * hz) ** 24;
        const y0 = l[i] * 255, base = mix([R[i], G[i], B[i]].map((ch) => y0 + (ch - y0) * 1.3) as RGB, warm, 0.1);
        const k = i * 4, light = 0.6 + 0.55 * diff + (prints() - 0.5) * 0.04;
        for (let ch = 0; ch < 3; ch++) o[k + ch] = base[ch] * light + 255 * 0.3 * spec;
        o[k + 3] = 255;
      }
    });
    // Stop motion: twelve poses a second, each nudged a little off the last.
    const j = p.rng(`clay${Math.floor(p.t * 12)}`), nx = (j() - 0.5) * u * 0.25, ny = (j() - 0.5) * u * 0.25;
    c.fillStyle = '#2a1d16'; c.fillRect(r.x, r.y, r.w, r.h);
    put(c, cv, { x: r.x + nx - u * 0.2, y: r.y + ny - u * 0.2, w: r.w + u * 0.4, h: r.h + u * 0.4 });
    vignette(c, r, 0.35, '40,20,10');
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
