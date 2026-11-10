// Guards on the components the app seeds into a new workspace.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateComponent, type ComponentMeta } from '../../src/core/validate';

const dir = 'presets/library/components';
const components = readdirSync(dir).map((id) => ({
  id,
  meta: JSON.parse(readFileSync(join(dir, id, 'component.json'), 'utf8')) as ComponentMeta,
  code: readFileSync(join(dir, id, 'component.js'), 'utf8'),
}));

describe('preset components', () => {
  it('ships the reel effects', () => {
    const ids = components.map((c) => c.id);
    for (const id of ['checklist', 'chart-grow', 'digital-zoom', 'phone', 'zoom-cut', 'backdrop', 'paper-cut', 'doodle-boil',
      'cover-story', 'frame-break', 'orbit', 'vertigo', 'wall', 'glass-type']) expect(ids).toContain(id);
  });

  // The same check `vibe component snap` runs on a component Claude writes: schema, defaults, flags, determinism.
  it.each(components.map((c) => [c.id, c] as const))('%s passes the component check', (_id, { id, meta, code }) => {
    expect(meta.name && meta.description).toBeTruthy();
    expect(validateComponent(id, meta, code)).toEqual([]);
  });
});

describe('wall headlines', () => {
  // A stub painter that records where each row of text lands, as a span on screen.
  const rows = async (dir: 'ltr' | 'rtl') => {
    // @ts-expect-error -- preset components are plain JS modules, with no types
    const { default: wall } = await import('../../presets/library/components/wall/component.js');
    const W = 1080, H = 1920, rem = 24, spans: [number, number][] = [];
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
    const p = {
      ctx, W, H, rem, dir, t: 2,
      sx: (x: number) => (dir === 'rtl' ? W - x : x),
      theme: { bg: '#000', border: '#333', muted: '#666' }, brand: { colors: { accent: '#f60' } },
      enter: () => 1, footage: () => {}, subject: () => {}, measure: (str: string) => str.length * 40,
      subjectBox: () => ({ x: 0, y: 0, w: W, h: H, head: { x: W / 2, y: H * 0.4, r: 100 } }),
      text(str: string, x: number, _y: number, o: { align?: string } = {}) {
        const w = str.length * 40, align = o.align ?? 'start';
        const leftAnchored = align === 'center' ? null : (align === 'start') !== (dir === 'rtl');
        spans.push(leftAnchored === null ? [x - w / 2, x + w / 2] : leftAnchored ? [x, x + w] : [x - w, x]);
        return { w, h: 10 };
      },
    };
    wall.draw(p, { t: 2, props: { kind: 'headlines', text: 'نهاية الإنترنت' } });
    return spans;
  };

  it.each(['ltr', 'rtl'] as const)('fills every row across the frame (%s)', async (dir) => {
    const spans = await rows(dir);
    expect(spans.length).toBeGreaterThan(10);
    for (const [a, b] of spans) expect(a < 1080 && b > 0, `row at ${a.toFixed(0)}..${b.toFixed(0)}`).toBe(true);
  });
});
