// The look components: one look over a beat, the reel's roll through the looks, and the closing grid.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LOOKS } from '../../src/core/looks';

const meta = (id: string) => JSON.parse(readFileSync(`presets/library/components/${id}/component.json`, 'utf8'));
const load = async (id: string) => (await import(`../../presets/library/components/${id}/component.js`)).default;

// A stub painter that records which looks the footage was drawn in, and the text drawn.
function stub(dir: 'ltr' | 'rtl' = 'ltr') {
  const W = 1080, H = 1920, looks: (string | undefined)[] = [], texts: string[] = [];
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const p = {
    ctx, W, H, rem: 32, dir, t: 0, mode: 'dark',
    sx: (x: number) => (dir === 'rtl' ? W - x : x),
    theme: { bg: '#000', border: '#333', muted: '#666', text: '#fff', surface: '#111' },
    brand: { colors: { accent: '#f60', primary: '#0a0' } },
    enter: () => 1, background: () => {}, panel: () => {}, pill: () => {}, rule: () => {},
    measure: (s: string) => s.length * 20,
    footage: (o: { look?: string } = {}) => { looks.push(o.look); },
    text: (s: string) => { texts.push(s); return { w: s.length * 20, h: 30 }; },
  };
  return { p, looks, texts };
}
const draw = async (id: string, t: number, props: Record<string, unknown> = {}, dur = 4, dir: 'ltr' | 'rtl' = 'ltr') => {
  const s = stub(dir), mod = await load(id);
  mod.draw(s.p, { t, dur, props: { ...meta(id).defaults, ...props }, place: () => ({}) });
  return s;
};

describe('look components', () => {
  it('offer every look, and are scenes', () => {
    expect(meta('look').schema.look.options).toEqual([...LOOKS]);
    for (const id of ['look', 'look-roll', 'look-grid']) expect(meta(id).scene).toBe(true);
  });

  it('look: wipes in from the plain shot, then holds the look', async () => {
    expect((await draw('look', 0.1, { look: 'comic' })).looks).toEqual([undefined, 'comic']);
    expect((await draw('look', 2, { look: 'comic' })).looks).toEqual(['comic']);
    expect((await draw('look', 0.1, { look: 'comic', wipe: false })).looks).toEqual(['comic']);
  });

  it('look-roll: one look per beat, the next wiping over the last, with the list filling in', async () => {
    const props = { looks: ['neon', 'sketch', 'comic'], each: 1, title: 'Three looks' };
    expect((await draw('look-roll', 0.5, props)).looks).toEqual(['neon']);
    expect((await draw('look-roll', 1.6, props)).looks).toEqual(['neon', 'sketch']); // sketch wiping in
    expect((await draw('look-roll', 2.0, props)).looks).toEqual(['sketch']);
    expect((await draw('look-roll', 9, props)).looks).toEqual(['comic']); // holds the last
    const { texts } = await draw('look-roll', 1.6, props);
    expect(texts).toContain('Three looks');
    expect(texts).toContain('Neon');
    expect(texts).toContain('Pencil sketch');
    expect(texts).not.toContain('Comic'); // not reached yet
  });

  it('look-roll: skips unknown looks and uses your names (in the same order as the looks) when given', async () => {
    const { texts, looks } = await draw('look-roll', 1.6, { looks: ['lego', 'pixel', 'riso'], names: ['ليغو', 'بكسل', 'ريزو'], each: 1 });
    expect(looks).toEqual(['pixel', 'riso']);
    expect(texts).toEqual(expect.arrayContaining(['بكسل', 'ريزو']));
    expect(texts).not.toContain('ليغو');
  });

  it('look-grid: a tile per look, and the call to action', async () => {
    const { looks, texts } = await draw('look-grid', 3, { looks: ['neon', 'pixel', 'terminal'], text: 'Comment', keyword: 'STYLE', line: 'and I will send the prompts' });
    expect(looks).toEqual(['neon', 'pixel', 'terminal']);
    expect(texts).toEqual(expect.arrayContaining(['Comment', '«STYLE»', 'and I will send the prompts']));
  });
});
