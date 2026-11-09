// The components from the "30 animations" reel: bar race, flowchart, type slam and flying cards.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const meta = (id: string) => JSON.parse(readFileSync(`presets/library/components/${id}/component.json`, 'utf8'));
const load = async (id: string) => await import(`../../presets/library/components/${id}/component.js`);

// A stub painter that records the text drawn and the boxes and pills it was asked for.
function stub(dir: 'ltr' | 'rtl' = 'ltr') {
  const W = 1080, H = 1920, texts: { s: string; x: number; y: number }[] = [], pills: { x: number; y: number; w: number }[] = [], panels: number[] = [], lines: number[] = [];
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const p = {
    ctx, W, H, rem: 32, dir, t: 0, mode: 'dark',
    theme: { bg: '#000', border: '#333', muted: '#666', text: '#fff', surface: '#111', raised: '#222' },
    brand: { colors: { accent: '#f60', primary: '#0a0' } },
    enter: (t: number) => (t <= 0 ? 0 : Math.min(1, t * 4)), background: () => {}, rule: () => {},
    rng: () => () => 0.5, fit: (_s: string, o: { size: number }) => o.size,
    measure: (s: string) => s.length * 20,
    panel: (r: { y: number }) => { panels.push(r.y); },
    pill: (r: { x: number; y: number; w: number }) => { pills.push(r); },
    line: (pts: [number, number][]) => { lines.push(pts.length); },
    text: (s: string, x: number, y: number) => { texts.push({ s, x, y }); return { w: s.length * 20, h: 30 }; },
  };
  return { p, texts, pills, panels, lines };
}
const draw = async (id: string, t: number, props: Record<string, unknown> = {}, dur = 6, dir: 'ltr' | 'rtl' = 'ltr') => {
  const s = stub(dir), mod = (await load(id)).default;
  const place = (d: { x?: number; y: number; w: number }) => {
    const w = d.w * 1080, x = (d.x ?? 0.5) * 1080, left = x - w / 2, right = x + w / 2;
    return { x, y: d.y * 1920, w, left, right, start: dir === 'rtl' ? right : left, end: dir === 'rtl' ? left : right };
  };
  mod.draw(s.p, { t, dur, props: { ...meta(id).defaults, ...props }, place });
  return s;
};

describe('the reel components', () => {
  it('have defaults that fit their schema', () => {
    for (const id of ['bar-race', 'flowchart', 'type-slam', 'flying-cards']) {
      const m = meta(id);
      for (const k of Object.keys(m.defaults)) expect(m.schema[k], `${id}.${k}`).toBeTruthy();
    }
  });
});

describe('bar race', async () => {
  const { parseBar, valueAt, ranks } = await load('bar-race');

  it('reads "Name: values" lines and skips the rest', () => {
    expect(parseBar('Hooks: 20, 45, 70')).toEqual({ name: 'Hooks', values: [20, 45, 70] });
    expect(parseBar('No colon 20')).toBeNull();
    expect(parseBar('Empty:')).toBeNull();
    expect(parseBar(': 1, 2')).toBeNull();
  });

  it('eases from one period to the next and holds the last', () => {
    expect(valueAt([0, 100], 0)).toBe(0);
    expect(valueAt([0, 100], 0.5)).toBe(50);
    expect(valueAt([0, 100], 1)).toBe(100);
    expect(valueAt([0, 100], 5)).toBe(100);
  });

  it('ranks the biggest on top, and glides two bars past each other instead of jumping', () => {
    const r = ranks([10, 50, 30]);
    expect(r[1]).toBeLessThan(r[2]);
    expect(r[2]).toBeLessThan(r[0]);
    expect(Math.round(r[1])).toBe(0);
    const tie = ranks([50, 50]);
    expect(tie[0]).toBeCloseTo(0.5);
  });

  it('draws every bar, the period and the title', async () => {
    const { pills, texts } = await draw('bar-race', 5.5);
    expect(pills).toHaveLength(5);
    const s = texts.map((x) => x.s);
    expect(s).toContain('What keeps people watching');
    expect(s).toContain('Week 4');
    expect(s).toContain('96%');
  });

  it('puts the overtaker on top by the end', async () => {
    const { texts } = await draw('bar-race', 5.9, { bars: ['Slow: 50, 50', 'Fast: 0, 100'], periods: ['A', 'B'], highlight: '' });
    const y = (n: string) => texts.find((x) => x.s === n)!.y;
    expect(y('Fast')).toBeLessThan(y('Slow'));
    const early = (await draw('bar-race', 0.1, { bars: ['Slow: 50, 50', 'Fast: 0, 100'], periods: ['A', 'B'] })).texts;
    expect(early.find((x) => x.s === 'Slow')!.y).toBeLessThan(early.find((x) => x.s === 'Fast')!.y);
  });
});

describe('flowchart', async () => {
  const { parseLinks, layers } = await load('flowchart');

  it('chains the boxes when there are no links, and reads "a>b" links otherwise', () => {
    expect(parseLinks([], 3)).toEqual([[0, 1], [1, 2]]);
    expect(parseLinks(['1>3', '2 -> 3', '3→4', 'junk', '9>1', '2>2'], 4)).toEqual([[0, 2], [1, 2], [2, 3]]);
  });

  it('puts each box one row below the deepest box that points at it, and survives loops', () => {
    expect(layers(4, [[0, 2], [1, 2], [2, 3]])).toEqual([0, 0, 1, 2]);
    expect(layers(3, [[0, 1], [1, 2], [0, 2]])).toEqual([0, 1, 2]);
    const loop = layers(3, [[0, 1], [1, 0]]);
    for (const r of loop) expect(r).toBeLessThan(3);
  });

  it('draws the boxes one step at a time', async () => {
    const early = await draw('flowchart', 0.2), late = await draw('flowchart', 4);
    expect(early.panels.length).toBeLessThan(late.panels.length);
    expect(late.panels).toHaveLength(1 + 5); // the backing panel, then a box each
    expect(late.texts.map((x) => x.s)).toEqual(expect.arrayContaining(['Your idea', 'Claude Code', 'Post']));
    expect(late.lines.length).toBeGreaterThanOrEqual(4); // four arrows, with heads
  });

  it('lays a row out in reading order in Arabic films', async () => {
    const props = { nodes: ['أ', 'ب', 'ج'], links: ['1>3', '2>3'] };
    const ltr = (await draw('flowchart', 4, props)).texts, rtl = (await draw('flowchart', 4, props, 6, 'rtl')).texts;
    const x = (t: typeof ltr, s: string) => t.find((v) => v.s === s)!.x;
    expect(x(ltr, 'أ')).toBeLessThan(x(ltr, 'ب'));
    expect(x(rtl, 'أ')).toBeGreaterThan(x(rtl, 'ب'));
  });
});

describe('type slam', () => {
  it('shows one word a beat, or stacks them', async () => {
    expect((await draw('type-slam', 0.3)).texts.map((x) => x.s)).toEqual(['THIS']);
    expect((await draw('type-slam', 1.3)).texts.map((x) => x.s)).toEqual(['EVERYTHING']);
    expect((await draw('type-slam', 1.3, { stack: true })).texts.map((x) => x.s)).toEqual(['THIS', 'CHANGES', 'EVERYTHING']);
    expect((await draw('type-slam', 9)).texts.map((x) => x.s)).toEqual(['EVERYTHING']); // holds the last
  });
});

describe('flying cards', () => {
  it('deals the cards one by one and counts up to the total', async () => {
    const early = await draw('flying-cards', 0.4), late = await draw('flying-cards', 3.4);
    expect(early.panels.length).toBeLessThan(late.panels.length);
    expect(late.panels).toHaveLength(1 + 7); // the counter's panel, then a card each
    expect(late.texts.map((x) => x.s)).toContain('49');
    expect(Number(early.texts[0].s)).toBeLessThan(49);
  });
});
