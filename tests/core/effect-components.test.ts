// The effect components from the first reel: what they draw where, in both reading directions.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const meta = (id: string) => JSON.parse(readFileSync(`presets/library/components/${id}/component.json`, 'utf8'));
const load = async (id: string) => (await import(`../../presets/library/components/${id}/component.js`)).default;

interface Drawn { s: string; x: number; align: string; progress: number; w: number }

// A stub painter that records each text's anchor, logical alignment and typing progress. Text is 20 px a character.
function stub(dir: 'ltr' | 'rtl') {
  const W = 1080, H = 1920, texts: Drawn[] = [], badges: string[] = [];
  const ctx = new Proxy({ globalAlpha: 1 }, { get: (o, k) => (k in o ? (o as Record<string | symbol, unknown>)[k] : () => {}), set: () => true });
  const p = {
    ctx, W, H, rem: 32, dir, mode: 'dark',
    sx: (x: number) => (dir === 'rtl' ? W - x : x),
    theme: { bg: '#000', border: '#333', muted: '#666', text: '#fff' },
    brand: { colors: { accent: '#f60', primary: '#0a0', onPrimary: '#fff' } },
    enter: (t: number) => (t <= 0 ? 0 : Math.min(1, t * 4)),
    measure: (s: string) => s.length * 20,
    footage: () => {}, subject: () => {}, rule: () => {}, line: () => {}, panel: () => {},
    badge: (s: string) => { badges.push(s); return { w: s.length * 20, h: 30 }; },
    subjectBox: () => ({ x: 340, y: 500, w: 400, h: 1400, head: { x: 540, y: 650, r: 150 } }),
    text: (s: string, x: number, _y: number, o: { align?: string; progress?: number; size?: number } = {}) => {
      texts.push({ s, x, align: o.align ?? 'start', progress: o.progress ?? 1, w: s.length * 20 });
      return { w: s.length * 20, h: 30 };
    },
  };
  return { p, texts, badges, W };
}

/** The horizontal span text covers, as canvas draws it: 'start' and 'end' follow the reading direction. */
const span = (d: Drawn, dir: 'ltr' | 'rtl') => {
  if (d.align === 'center') return [d.x - d.w / 2, d.x + d.w / 2];
  const growsRight = (d.align === 'start') === (dir === 'ltr');
  return growsRight ? [d.x, d.x + d.w] : [d.x - d.w, d.x];
};

const draw = async (id: string, t: number, dir: 'ltr' | 'rtl', props: Record<string, unknown> = {}) => {
  const s = stub(dir);
  (await load(id)).draw(s.p, { t, dur: 4, props: { ...meta(id).defaults, ...props } });
  return s;
};

describe('cover-story', () => {
  for (const dir of ['ltr', 'rtl'] as const) {
    it(`keeps the issue label on screen (${dir})`, async () => {
      const { texts, W } = await draw('cover-story', 3, dir, { issue: 'ISSUE 07 · NOV' });
      const label = texts.find((d) => d.s === 'ISSUE 07 · NOV')!;
      const [a, b] = span(label, dir);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(W);
    });
  }

  it('types its cover lines in, one after another', async () => {
    const lines = ['First line here', 'Second line'];
    const early = (await draw('cover-story', 0.75, 'ltr', { lines })).texts.filter((d) => lines.includes(d.s));
    expect(early.map((d) => d.s)).toEqual(['First line here']);
    expect(early[0].progress).toBeGreaterThan(0);
    expect(early[0].progress).toBeLessThan(1);
    const late = (await draw('cover-story', 3, 'ltr', { lines })).texts.filter((d) => lines.includes(d.s));
    expect(late.map((d) => d.progress)).toEqual([1, 1]);
  });
});

describe('orbit', () => {
  it('types each word into its badge, one after another', async () => {
    const words = ['Brand', 'Styles', 'Claude'];
    const early = (await draw('orbit', 0.4, 'ltr', { words })).badges;
    expect(early.length).toBeGreaterThan(0);
    expect(early.length).toBeLessThan(words.length);           // the later words haven't started
    expect(words.some((w) => early.includes(w.slice(0, -1)) || early.some((b) => b.length < w.length && w.startsWith(b)))).toBe(true);
    const late = (await draw('orbit', 3, 'ltr', { words })).badges;
    expect([...late].sort()).toEqual([...words].sort());
  });
});

describe('wall', () => {
  for (const [dir, text] of [['ltr', 'THE END OF THE WEB'], ['rtl', 'نهاية الإنترنت'], ['rtl', 'THE END OF THE WEB']] as const) {
    it(`types its rows in behind a sweep, then fills the frame (${dir}, ${text})`, async () => {
      const early = (await draw('wall', 0.3, dir, { text })).texts;
      const { texts, W } = await draw('wall', 2.5, dir, { text });
      // Early on, some rows are part typed or not started.
      expect(early.some((d) => d.progress < 1) || early.length < texts.length).toBe(true);
      expect(texts.length).toBeGreaterThan(10);
      // Once the sweep has crossed, every row is typed as far as the frame edge (or its own end). 20 px a character.
      const rtlText = dir === 'rtl' && /[\u0590-\u08FF]/.test(text);
      for (const d of texts) {
        const left = dir === 'rtl' ? d.x - d.w : d.x, typedW = d.progress * d.w;
        if (rtlText) expect(left + d.w - typedW).toBeLessThanOrEqual(Math.max(0, left) + 20);
        else expect(left + typedW).toBeGreaterThanOrEqual(Math.min(W, left + d.w) - 20);
      }
    });
  }
});
