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
    subjectBox: () => ({ x: 200, y: 400, w: 680, h: 1520, head: { x: 540, y: 560, r: 140 } }),
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

describe('comic burst', async () => {
  const { burstPoints } = await load('comic-burst');

  it('alternates long spikes and short notches, squashed wide', () => {
    const pts = burstPoints(100, 12, () => 0.5);
    expect(pts).toHaveLength(24);
    const len = ([x, y]: number[]) => Math.hypot(x, y / 0.66);
    expect(len(pts[0])).toBeCloseTo(95);
    expect(len(pts[1])).toBeCloseTo(69);
    expect(Math.max(...pts.map(([, y]: number[]) => Math.abs(y)))).toBeLessThan(Math.max(...pts.map(([x]: number[]) => Math.abs(x))));
  });

  it('slams in with its word, and draws nothing before it lands', async () => {
    expect((await draw('comic-burst', 0, {}, 1.5)).texts).toEqual([]);
    expect((await draw('comic-burst', 0.5, { text: 'POW!' }, 1.5)).texts.map((x) => x.s)).toEqual(['POW!']);
  });
});

describe('pixel HUD', async () => {
  const { scoreAt, heartsAt } = await load('pixel-hud');

  it('counts the score up in steps, padded like an arcade', () => {
    expect(scoreAt(12800, 0)).toBe('000000');
    expect(scoreAt(12800, 0.6)).toBe('006400');
    expect(scoreAt(12800, 5)).toBe('012800');
    expect(scoreAt('nope', 5)).toBe('000000');
  });

  it('blinks the lost hearts for half a second, then takes them', () => {
    expect(heartsAt(3, 1, 2, 1.9)).toEqual({ full: 3, blink: false });
    expect(heartsAt(3, 1, 2, 2.0)).toEqual({ full: 2, blink: true });
    expect(heartsAt(3, 1, 2, 2.15)).toEqual({ full: 2, blink: false });
    expect(heartsAt(3, 1, 2, 3)).toEqual({ full: 2, blink: false });
    expect(heartsAt(3, 9, 0, 1)).toEqual({ full: 0, blink: false });
  });

  it('shows the label and score at the reading start and the level in the middle', async () => {
    const ltr = (await draw('pixel-hud', 2, {}, 4)).texts, rtl = (await draw('pixel-hud', 2, {}, 4, 'rtl')).texts;
    expect(ltr.map((x) => x.s)).toEqual(['SCORE 012800', 'LEVEL 1']);
    expect(ltr[0].x).toBeLessThan(540);
    expect(rtl[0].x).toBeGreaterThan(540);
    expect(ltr[1].x).toBe(540);
  });
});

describe('note and arrow', async () => {
  const { curve } = await load('note-arrow');

  it('runs a bowed curve from the note to the target', () => {
    const pts = curve([0, 0], [100, 0], 20, 10);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[10][0]).toBeCloseTo(100);
    expect(pts[5][1]).toBeCloseTo(10); // half the bow, at the middle
  });

  it('types the note first, then draws the arrow and its head', async () => {
    const early = await draw('note-arrow', 0.2, {}, 3), late = await draw('note-arrow', 2.5, {}, 3);
    expect(early.lines).toEqual([]);
    expect(late.lines).toEqual([25, 2, 2]); // the curve and the two strokes of its head
  });

  it('puts the note on the end side, which is the left in Arabic', async () => {
    expect((await draw('note-arrow', 1, {}, 3)).texts[0].x).toBeGreaterThan(540);
    expect((await draw('note-arrow', 1, {}, 3, 'rtl')).texts[0].x).toBeLessThan(540);
    expect((await draw('note-arrow', 1, { side: 'start' }, 3)).texts[0].x).toBeLessThan(540);
  });
});
