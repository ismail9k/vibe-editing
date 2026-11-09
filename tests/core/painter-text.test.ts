// p.text in a right-to-left frame: English stays English.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBasePainter } from '../../src/core/painter';

const brand = JSON.parse(readFileSync('presets/library/brand.json', 'utf8'));
interface Call { op: string; text?: string; x: number; w?: number; dir: string; align: string }

// A recording canvas: text is 10 px a character; it logs each fillText (with the direction and alignment in force)
// and each fillRect (the caret).
function painter(dir: 'ltr' | 'rtl') {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { direction: 'ltr', textAlign: 'start' };
  const stack: Record<string, unknown>[] = [];
  const ctx = new Proxy(state, {
    get: (o, k: string) => k in o ? o[k]
      : k === 'measureText' ? (s: string) => ({ width: [...s].length * 10 })
      : k === 'save' ? () => stack.push({ ...o })
      : k === 'restore' ? () => Object.assign(o, stack.pop())
      : k === 'fillText' ? (text: string, x: number) => calls.push({ op: 'text', text, x, dir: String(o.direction), align: String(o.textAlign) })
      : k === 'fillRect' ? (x: number, _y: number, w: number) => calls.push({ op: 'rect', x, w, dir: String(o.direction), align: String(o.textAlign) })
      : () => {},
    set: (o, k: string, v) => { o[k] = v; return true; },
  });
  const p = createBasePainter(ctx as unknown as CanvasRenderingContext2D, { W: 1080, H: 1920, dir, mode: 'dark', brand, params: {}, t: 0 });
  return { p, calls };
}

/** Where a fillText call's text lands on screen, given its direction and alignment. */
const box = (c: Call) => {
  const w = [...c.text!].length * 10, a = c.align;
  const left = a === 'left' || (a === 'start' && c.dir === 'ltr') || (a === 'end' && c.dir === 'rtl') ? c.x
    : a === 'center' ? c.x - w / 2 : c.x - w;
  return [left, left + w];
};

describe('p.text, English in an Arabic frame', () => {
  it('draws a Latin line left to right, where the whole line sits', () => {
    const { p, calls } = painter('rtl');
    p.text('#VIBE', 500, 100);                     // start = the right edge in RTL
    const t = calls.find((c) => c.op === 'text')!;
    expect(t.dir).toBe('ltr');                     // the # stays in front
    expect(box(t)).toEqual([450, 500]);            // still ends at the start edge
  });

  it('types a Latin line left to right, with the caret after the last letter', () => {
    const { p, calls } = painter('rtl');
    p.text('VIBE', 500, 100, { progress: 0.5 });
    const t = calls.find((c) => c.op === 'text')!, caret = calls.find((c) => c.op === 'rect')!;
    expect(t.text).toBe('VI');
    expect(box(t)).toEqual([460, 480]);            // the first half of where VIBE will sit
    expect(caret.x).toBeGreaterThanOrEqual(480);   // after the I, not before the V
    expect(caret.x).toBeLessThan(500);
  });

  it('leaves Arabic, and English inside Arabic, to the frame', () => {
    const { p, calls } = painter('rtl');
    p.text('كلود Code', 500, 100);
    p.text('مرحبا', 500, 200);
    expect(calls.filter((c) => c.op === 'text').map((c) => c.dir)).toEqual(['rtl', 'rtl']);
  });

  it('changes nothing in a left-to-right frame', () => {
    const { p, calls } = painter('ltr');
    p.text('#VIBE', 500, 100, { align: 'end' });
    const t = calls.find((c) => c.op === 'text')!;
    expect(t.dir).toBe('ltr');
    expect(box(t)).toEqual([450, 500]);
  });
});
