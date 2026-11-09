// The styles, transition and scenery from the "30 animations" and "10 styles" reels: synthwave, woodblock, noir, sumi,
// frosted glass, the pixel dissolve, and drawn scenes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const STYLES = ['synthwave', 'woodblock', 'noir', 'sumi', 'glass', 'collage', 'film', 'comic', 'riso', 'papercut', 'bricks'];
const styleMeta = (id: string) => JSON.parse(readFileSync(`presets/library/styles/${id}/style.json`, 'utf8'));
const loadStyle = async (id: string) => (await import(`../../presets/library/styles/${id}/style.js`)).default;
const loadComponent = async (id: string) => await import(`../../presets/library/components/${id}/component.js`);

// A canvas whose context accepts every call and records the ones that draw.
function fakeCanvas(w: number, h: number, log: string[]) {
  const ctx: Record<string, unknown> = new Proxy({ canvas: { width: w, height: h } } as Record<string, unknown>, {
    get: (o, k: string) => k in o ? o[k]
      : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => {} })
      : k === 'getTransform' ? () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
      : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
      : (...a: unknown[]) => { log.push(k === 'fillRect' ? `${k}@${(a as number[]).map(Math.round).join(',')}` : k); },
    set: (o, k: string, v) => { o[k] = v; return true; },
  });
  return { width: w, height: h, getContext: () => ctx };
}

function basePainter(mode: 'dark' | 'light', dir: 'ltr' | 'rtl', params: Record<string, unknown>, log: string[], calls: string[]) {
  const W = 1080, H = 1920;
  return {
    ctx: fakeCanvas(W, H, log).getContext(), W, H, rem: 32, dir, mode, t: 0, params,
    theme: { bg: '#0F0F0F', text: '#F5F5F5', muted: '#999', primaryText: '#2FB161', surface: '#1A1A1A', raised: '#242424', sunken: '#141414', border: '#404040', selected: '#1F3327', warning: '#F4C871', glow: ['#499B56', '#4FA866', '#E85A02'], glowOpacity: 0.35 },
    brand: { colors: { primary: '#166434', accent: '#E85A02', onAccent: '#000', onPrimary: '#fff', ink: '#0A111A' } },
    m: { clamp: (v: number) => Math.min(1, Math.max(0, v)), hash: () => 1 },
    rng: (seed: string | number) => { // seeded like the painter's: the same seed gives the same numbers
      let h = 2166136261; for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      return () => { h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5 | 0; return ((h >>> 0) % 1e6) / 1e6; };
    },
    canvas: (w: number, h: number) => fakeCanvas(w, h, []),
    measure: (s: string) => { calls.push(`measure:${s}`); return s.length * 20; },
    text: (s: string) => { calls.push(`text:${s}`); return { w: s.length * 20, h: 30 }; },
    panel: () => calls.push('panel'), pill: () => calls.push('pill'), line: () => calls.push('line'), rule: () => calls.push('rule'),
    background: () => calls.push('background'), enter: (t: number) => t,
  };
}

describe('the reel styles', () => {
  it('have a name, a description and params whose values sit in range', () => {
    for (const id of STYLES) {
      const m = styleMeta(id);
      expect(m.name && m.description, id).toBeTruthy();
      for (const [k, p] of Object.entries(m.params as Record<string, { type: string; value: number; min?: number; max?: number }>)) {
        if (p.type === 'number') { expect(p.value, `${id}.${k}`).toBeGreaterThanOrEqual(p.min!); expect(p.value, `${id}.${k}`).toBeLessThanOrEqual(p.max!); }
      }
    }
  });

  for (const id of STYLES) for (const mode of ['dark', 'light'] as const) for (const dir of ['ltr', 'rtl'] as const) {
    it(`${id} draws every primitive in ${mode} ${dir} without throwing`, async () => {
      const log: string[] = [], calls: string[] = [];
      const params = Object.fromEntries(Object.entries(styleMeta(id).params as Record<string, { value: unknown }>).map(([k, v]) => [k, v.value]));
      const base = basePainter(mode, dir, params, log, calls);
      const p = Object.assign(Object.create(null), base, (await loadStyle(id))(base));
      const r = { x: 100, y: 300, w: 800, h: 400 };
      if (p.background !== base.background) p.background(1.3);
      for (const variant of ['default', 'feature', 'flat']) for (const progress of [0, 0.5, 1]) p.panel(r, { variant, progress });
      p.text('Hello', 100, 100, { role: 'display', size: 64 });
      p.text('Body', 100, 200, {});
      p.pill({ x: 0, y: 0, w: 200, h: 40 }, { fill: '#f60' });
      p.pill({ x: 0, y: 0, w: 200, h: 40 }, { stroke: '#333' });
      p.line([[0, 0], [100, 100]], {});
      p.rule(100, 100, 300, { progress: 0.5 });
      p.measure('Hi', { role: 'display' });
      if (p.post) p.post();
      if (p.enter !== base.enter) expect(p.enter(0.5)).toBeGreaterThanOrEqual(0);
      expect(log.length, id).toBeGreaterThan(0);
    });
  }

  it('noir sets headlines in capitals, and measures them that way so they fit', async () => {
    const calls: string[] = [];
    const base = basePainter('dark', 'ltr', {}, [], calls);
    const p = Object.assign(Object.create(null), base, (await loadStyle('noir'))(base));
    p.text('Hello', 0, 0, { role: 'display' }); p.text('Body', 0, 0, {}); p.measure('fit me', { role: 'display' });
    expect(calls).toEqual(['text:HELLO', 'text:Body', 'measure:FIT ME']);
  });

  it('only sumi signs a finished feature card with the seal', async () => {
    const seal = async (variant: string, progress: number) => {
      const log: string[] = [], base = basePainter('dark', 'ltr', { dry: 0.5, seal: true }, log, []);
      (await loadStyle('sumi'))(base).panel!.call(base, { x: 0, y: 0, w: 600, h: 300 }, { variant, progress });
      return log.includes('strokeRect');
    };
    expect(await seal('feature', 1)).toBe(true);
    expect(await seal('feature', 0.6)).toBe(false);
    expect(await seal('default', 1)).toBe(false);
  });

  it('glass blurs what is already drawn under a card', async () => {
    const log: string[] = [], base = basePainter('dark', 'ltr', { blur: 0.6, tint: 0.5 }, log, []);
    (await loadStyle('glass'))(base).panel!.call(base, { x: 100, y: 100, w: 400, h: 200 }, {});
    expect(log).toContain('drawImage');
    expect(String((base.ctx as Record<string, unknown>).filter)).toMatch(/blur\(/);
  });
});

describe('riso', () => {
  it('prints each card on a layer only as big as the card, not the whole frame', async () => {
    const made: [number, number][] = [], base = basePainter('dark', 'ltr', { slip: 0.5, grain: 0.5 }, [], []);
    base.canvas = (w: number, h: number) => { made.push([w, h]); return fakeCanvas(w, h, []); };
    (await loadStyle('riso'))(base).panel!.call(base, { x: 100, y: 300, w: 400, h: 200 }, {});
    expect(made).toContainEqual([400 + 2 * Math.ceil(32 * 1.6), 200 + 2 * Math.ceil(32 * 1.6)]);
    expect(made).not.toContainEqual([1080, 1920]);
  });
});

describe('old film', () => {
  // The post pass, run on a canvas that records the size and place of every speck.
  const post = async (t: number) => {
    const log: string[] = [], base = basePainter('dark', 'ltr', { grain: 0.5, weave: 0.5, fps: 12 }, log, []);
    const p = Object.assign(Object.create(null), base, (await loadStyle('film'))(base), { t });
    p.post();
    return log.join();
  };

  it('puts the same dust on every frame of one drawing, and new dust on the next drawing', async () => {
    expect(await post(1.0)).toBe(await post(1.04)); // both in drawing 12
    expect(await post(1.0)).not.toBe(await post(1.1));
  });

  it('moves in steps, twelve drawings a second', async () => {
    const base = basePainter('dark', 'ltr', { fps: 12 }, [], []);
    const p = Object.assign(Object.create(null), base, (await loadStyle('film'))(base));
    expect(p.enter(0.1)).toBe(p.enter(0.0834));
    expect(p.enter(0.1)).toBeCloseTo(1 / 12);
  });
});

describe('look on you', async () => {
  const { split } = await loadComponent('look-cutout');
  const meta = JSON.parse(readFileSync('presets/library/components/look-cutout/component.json', 'utf8'));
  const record = (on: string, dim: boolean) => {
    const calls: unknown[] = [];
    split({ footage: (o: object) => calls.push(['footage', o]), subject: (o?: object) => calls.push(['subject', o]) }, 'hologram', on, dim);
    return calls;
  };

  it('needs the cutout', () => { expect(meta.matte).toBe(true); expect(meta.scene).toBe(true); });

  it('puts the look on you over the room, dimmed or not', () => {
    expect(record('you', true)).toEqual([['footage', { filter: 'brightness(0.35) saturate(0.6)' }], ['subject', { look: 'hologram' }]]);
    expect(record('you', false)).toEqual([['footage', {}], ['subject', { look: 'hologram' }]]);
  });

  it('or on the room, with you plain in front', () => {
    expect(record('room', true)).toEqual([['footage', { look: 'hologram' }], ['subject', undefined]]);
  });
});

describe('pixel dissolve', async () => {
  const { cellHash, blockAt, flipAt } = await loadComponent('pixel-dissolve');
  const meta = JSON.parse(readFileSync('presets/library/components/pixel-dissolve/component.json', 'utf8'));
  const looks = JSON.parse(readFileSync('presets/library/components/look/component.json', 'utf8')).schema.look.options;

  it('offers "none" and every look on both sides', () => {
    expect(meta.schema.from.options).toEqual(['none', ...looks]);
    expect(meta.schema.to.options).toEqual(['none', ...looks]);
    expect(meta.scene).toBe(true);
  });

  it('coarsens, holds and sharpens back', () => {
    expect(blockAt(0, 36)).toBe(1);
    expect(blockAt(0.5, 36)).toBe(36);
    expect(blockAt(1, 36)).toBe(1);
    expect(blockAt(0.15, 36)).toBeGreaterThan(1);
  });

  it('flips every cell between 30% and 70%, each at its own fixed moment', () => {
    for (let i = 0; i < 200; i++) {
      const x = i % 30, y = Math.floor(i / 30);
      expect(flipAt(0.3, x, y)).toBe(0);
      expect(flipAt(0.7, x, y)).toBe(1);
      expect(cellHash(x, y)).toBe(cellHash(x, y));
      expect(cellHash(x, y)).toBeGreaterThanOrEqual(0);
      expect(cellHash(x, y)).toBeLessThan(1);
    }
    const spread = new Set(Array.from({ length: 50 }, (_, i) => flipAt(0.5, i, 3)));
    expect(spread.size).toBeGreaterThan(2);
  });
});

describe('scenery', async () => {
  const mod = (await loadComponent('scenery')).default;
  const meta = JSON.parse(readFileSync('presets/library/components/scenery/component.json', 'utf8'));

  it('draws every scene in both modes, the same way every time at the same t', () => {
    expect(meta.scene).toBe(true);
    for (const scene of meta.schema.scene.options) for (const mode of ['dark', 'light'] as const) {
      const run = (t: number) => {
        const log: string[] = [], calls: string[] = [];
        mod.draw(basePainter(mode, 'ltr', {}, log, calls), { t, dur: 4, props: { scene } });
        return [...log, ...calls].join();
      };
      expect(run(1.5).length, `${scene} ${mode}`).toBeGreaterThan(0);
      expect(run(1.5)).toBe(run(1.5));
    }
  });

  it('falls back to the night scene for an unknown name', () => {
    const a: string[] = [], b: string[] = [];
    mod.draw(basePainter('dark', 'ltr', {}, a, []), { t: 1, dur: 4, props: { scene: 'mars' } });
    mod.draw(basePainter('dark', 'ltr', {}, b, []), { t: 1, dur: 4, props: { scene: 'night' } });
    expect(a).toEqual(b);
  });
});
