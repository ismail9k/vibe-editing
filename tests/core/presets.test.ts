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
