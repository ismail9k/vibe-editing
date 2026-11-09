// Guards on the components the app seeds into a new workspace.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentMeta } from '../../src/core/validate';

const dir = 'presets/library/components';
const components = readdirSync(dir).map((id) => ({
  id,
  meta: JSON.parse(readFileSync(join(dir, id, 'component.json'), 'utf8')) as ComponentMeta,
  code: readFileSync(join(dir, id, 'component.js'), 'utf8'),
}));
const TYPES = ['text', 'number', 'bool', 'list', 'select'];

describe('preset components', () => {
  it('ships the reel effects', () => {
    const ids = components.map((c) => c.id);
    for (const id of ['checklist', 'chart-grow', 'digital-zoom', 'phone', 'zoom-cut', 'backdrop', 'paper-cut', 'doodle-boil',
      'cover-story', 'frame-break', 'orbit', 'vertigo', 'wall', 'glass-type']) expect(ids).toContain(id);
  });

  it.each(components.map((c) => [c.id, c] as const))('%s has a complete schema with matching defaults', (_id, { meta }) => {
    expect(meta.name && meta.description && meta.duration > 0).toBeTruthy();
    for (const [k, spec] of Object.entries(meta.schema)) {
      expect(TYPES, `${k}`).toContain(spec.type);
      if (spec.type === 'select') expect(spec.options!.length).toBeGreaterThan(0);
    }
    for (const [k, v] of Object.entries(meta.defaults)) {
      const spec = meta.schema[k];
      expect(spec, `default ${k} has no schema entry`).toBeDefined();
      if (spec.type === 'list') expect(Array.isArray(v)).toBe(true);
      if (spec.type === 'select') expect(spec.options).toContain(v);
    }
  });

  it.each(components.map((c) => [c.id, c] as const))('%s declares what it draws: footage → scene, cutout → matte', (_id, { meta, code }) => {
    if (/\bp\.footage\(/.test(code)) expect(meta.scene, 'draws the footage, so it must be a scene').toBe(true);
    if (/\bp\.subject\(/.test(code)) expect(meta.matte, 'draws the cutout, so it needs a matte').toBe(true);
    if (/\bsubjectBox\(/.test(code)) expect(meta.matte || meta.aims, 'aims at the speaker, so it wants a matte (matte or aims)').toBe(true);
    expect(code).not.toMatch(/Math\.random/);
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
