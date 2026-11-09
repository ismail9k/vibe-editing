// The footage looks: the pure parts (sampling sizes, edges, the low-poly mesh, the ASCII ramp, brick colours).
import { describe, it, expect } from 'vitest';
import { LOOKS, LOOK_NAMES, isLook, lookSample, lumaOf, edges, mesh, asciiFor, posterize, ramp, heatOf, cube } from '../../src/core/looks';

describe('look list', () => {
  it('has the looks from both reels, each with a display name', () => {
    expect(LOOKS).toEqual([
      'neon', 'sketch', 'comic', 'chalk', 'pixel', 'riso', 'lowpoly', 'papercut', 'bricks', 'terminal',
      'hologram', 'cyberpunk', 'isometric', 'blueprint', 'thermal', 'anime', 'watercolor', 'clay',
    ]);
    for (const l of LOOKS) expect(LOOK_NAMES[l]).toBeTruthy();
    expect(isLook('comic')).toBe(true);
    expect(isLook('lego')).toBe(false);
    expect(isLook(undefined)).toBe(false);
  });
});

describe('lookSample', () => {
  it('samples coarse looks on their grid and fine looks near 360 wide, at the rect aspect', () => {
    expect(lookSample('pixel', 1080, 1920)).toEqual([72, 128]);
    expect(lookSample('bricks', 1080, 1920)).toEqual([32, 57]);
    const [tw, th] = lookSample('terminal', 1080, 1920);
    expect(tw).toBe(60);
    // Characters are 1.7× taller than wide.
    expect(th).toBe(Math.round(1920 / ((1080 / 60) * 1.7)));
    expect(lookSample('neon', 1080, 1920)).toEqual([360, 640]);
    // Isometric cube rows overlap: a row advances √3/2 of a cube's width.
    const [iw, ih] = lookSample('isometric', 1080, 1920);
    expect(iw).toBe(44);
    expect(ih).toBe(Math.round(1920 / ((1080 / 44) * (Math.sqrt(3) / 2))));
  });

  it('never samples finer than the rect it draws into', () => {
    expect(lookSample('neon', 180, 320)).toEqual([180, 320]);
    const [w, h] = lookSample('pixel', 40, 80);
    expect(w).toBeLessThanOrEqual(40);
    expect(h).toBeLessThanOrEqual(80);
    expect(w).toBeGreaterThanOrEqual(1);
  });
});

describe('edges', () => {
  // A 12×8 RGBA image: black on the left half, white on the right.
  const w = 12, h = 8, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, v = x >= 6 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }

  it('reads luma 0..1', () => {
    const l = lumaOf(d, w, h);
    expect(l[0]).toBe(0);
    expect(l[11]).toBeCloseTo(1);
  });

  it('is strong on the step and zero on flat areas', () => {
    const e = edges(lumaOf(d, w, h), w, h);
    const at = (x: number, y: number) => e[y * w + x];
    expect(at(5, 4)).toBeGreaterThan(0.5);
    expect(at(6, 4)).toBeGreaterThan(0.5);
    expect(at(2, 4)).toBe(0);
    expect(at(9, 4)).toBe(0);
    for (const v of e) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
});

describe('mesh', () => {
  const area = ([a, b, c]: [number, number][]) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;

  it('tiles the whole rect with triangles', () => {
    const tris = mesh(300, 500, 60, 7);
    expect(tris.reduce((s, t) => s + area(t), 0)).toBeCloseTo(300 * 500, 3);
    for (const t of tris) for (const [x, y] of t) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(300);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(500);
    }
  });

  it('is the same mesh for the same seed, so it holds still across frames', () => {
    expect(mesh(300, 500, 60, 7)).toEqual(mesh(300, 500, 60, 7));
    expect(mesh(300, 500, 60, 8)).not.toEqual(mesh(300, 500, 60, 7));
  });
});

describe('asciiFor', () => {
  it('goes from blank for black to dense for white, never lighter as luma rises', () => {
    expect(asciiFor(0)).toBe(' ');
    expect(asciiFor(1)).toBe('@');
    const ramp = ' .:-=+*#%@';
    let last = -1;
    for (let v = 0; v <= 1; v += 0.01) {
      const k = ramp.indexOf(asciiFor(v));
      expect(k).toBeGreaterThanOrEqual(last);
      last = k;
    }
  });
});

describe('posterize', () => {
  it('snaps a channel to a few even levels', () => {
    expect(posterize(0, 4)).toBe(0);
    expect(posterize(255, 4)).toBe(255);
    expect(posterize(100, 4)).toBe(85);
    expect(posterize(200, 4)).toBe(170);
    expect(new Set(Array.from({ length: 256 }, (_, v) => posterize(v, 3))).size).toBe(3);
  });
});

describe('footage({ look })', async () => {
  const { mediaMethods } = await import('../../src/core/media');
  // A recording canvas: every 2D call is logged; pixel reads return a blank image of the right size.
  const fakeCanvas = (w: number, h: number, log: string[]) => {
    const ctx: Record<string, unknown> = new Proxy({ canvas: { width: w, height: h } } as Record<string, unknown>, {
      get: (o, k: string) => k in o ? o[k]
        : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => {} })
        : k === 'getImageData' || k === 'createImageData' ? (..._a: number[]) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
        : (...a: unknown[]) => { log.push(`${k}${k === 'drawImage' ? `@${(a as number[]).slice(-4).map(Math.round).join(',')}` : ''}`); },
      set: (o, k: string, v) => { o[k] = v; return true; },
    });
    return { width: w, height: h, getContext: () => ctx };
  };
  const painter = (log: string[], made: [number, number][]) => {
    const W = 1080, H = 1920, main = fakeCanvas(W, H, log).getContext();
    const frame = { videoWidth: 1080, videoHeight: 1920 } as unknown as CanvasImageSource;
    const m = mediaMethods({ media: { frame, matte: null }, clip: true, W, H });
    return Object.assign(Object.create(null), m, {
      ctx: main, W, H, t: 0, rem: 32, dir: 'ltr',
      theme: { surface: '#111', border: '#333' }, brand: { colors: { accent: '#f60' } },
      canvas: (w: number, h: number) => { made.push([w, h]); return fakeCanvas(w, h, []); },
      rng: () => () => 0.5, font: () => {},
    });
  };

  it('samples the shot on the look grid and draws it back into the rect', () => {
    const log: string[] = [], made: [number, number][] = [];
    const p = painter(log, made);
    p.footage({ look: 'pixel', rect: { x: 100, y: 200, w: 540, h: 960 } });
    expect(made[0]).toEqual([72, 128]);
    expect(log).toContain('drawImage@100,200,540,960');
  });

  it('samples the whole shot even when the look grid has another shape (terminal cells are tall)', () => {
    const log: string[] = [], made: [number, number][] = [];
    painter(log, made).footage({ look: 'terminal', rect: { x: 0, y: 0, w: 540, h: 960 } });
    // First the shot at the rect's own shape, then squeezed onto the 60×63 character grid.
    expect(made.slice(0, 2)).toEqual([[60, 107], [60, 63]]);
  });

  it('draws every look without throwing, in a full frame and in a small tile', () => {
    for (const look of LOOKS) for (const rect of [undefined, { x: 10, y: 20, w: 180, h: 320 }]) {
      const log: string[] = [], made: [number, number][] = [];
      expect(() => painter(log, made).footage({ look, rect }), look).not.toThrow();
      expect(log.length, look).toBeGreaterThan(0);
    }
  });

  it('draws the plain shot for no look or an unknown one', () => {
    for (const look of [undefined, 'lego']) {
      const log: string[] = [], made: [number, number][] = [];
      painter(log, made).footage({ look, rect: { x: 0, y: 0, w: 540, h: 960 } });
      expect(made).toEqual([]);
      expect(log).toContain('drawImage@0,0,540,960');
    }
  });
});

describe('ramp', () => {
  const stops: [number, [number, number, number]][] = [[0, [0, 0, 0]], [0.5, [100, 0, 200]], [1, [255, 255, 255]]];
  it('hits each stop and blends between them', () => {
    expect(ramp(stops, 0)).toEqual([0, 0, 0]);
    expect(ramp(stops, 0.5)).toEqual([100, 0, 200]);
    expect(ramp(stops, 1)).toEqual([255, 255, 255]);
    expect(ramp(stops, 0.25)).toEqual([50, 0, 100]);
  });
  it('holds the end colours outside 0..1', () => {
    expect(ramp(stops, -1)).toEqual([0, 0, 0]);
    expect(ramp(stops, 2)).toEqual([255, 255, 255]);
  });
});

describe('heatOf', () => {
  it('reads warm colours hotter than cool ones of the same brightness', () => {
    expect(heatOf(220, 140, 100)).toBeGreaterThan(heatOf(100, 150, 230));
  });
  it('rises with brightness and stays in 0..1', () => {
    expect(heatOf(200, 200, 200)).toBeGreaterThan(heatOf(40, 40, 40));
    for (const [r, g, b] of [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 0, 255]]) {
      const v = heatOf(r, g, b);
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('cube', () => {
  it('is a hexagon as wide as asked, whose rows tile at √3/2 of its width', () => {
    const w = 30, q = cube(100, 100, w);
    expect(q.ur[0] - q.ul[0]).toBeCloseTo(w);
    // The next row sits half a cube along and √3/2·w down: its top-left edge meets this cube's bottom-right edge.
    const n = cube(100 + w / 2, 100 + (w * Math.sqrt(3)) / 2, w);
    expect(n.ul[0]).toBeCloseTo(q.bottom[0]); expect(n.ul[1]).toBeCloseTo(q.bottom[1]);
    expect(n.top[0]).toBeCloseTo(q.lr[0]); expect(n.top[1]).toBeCloseTo(q.lr[1]);
  });
});
