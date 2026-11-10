// The starting point `vibe component new` and the Studio's "+ New component" write.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { componentId, componentTemplate } from '../../src/core/component-template';
import { validateComponent } from '../../src/core/validate';
import { renderFrame, tileProject, type Library } from '../../src/core/render';

// A 2D context that measures text and ignores drawing: enough for the painter to lay a component out.
const fakeCtx = () => new Proxy({} as Record<string, unknown>, {
  get(t, k) {
    if (k in t) return t[k as string];
    if (k === 'measureText') return (s: string) => ({ width: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
    if (k === 'getLineDash') return () => [];
    return () => {};
  },
  set(t, k, v) { t[k as string] = v; return true; },
}) as unknown as CanvasRenderingContext2D;

describe('componentId', () => {
  it('turns a name into a folder name', () => {
    expect(componentId('Big Number!')).toBe('big-number');
    expect(componentId('  Lower third 2 ')).toBe('lower-third-2');
    expect(componentId('عنوان')).toBe('');
  });
});

describe('componentTemplate', () => {
  it('passes the component check', () => {
    const { meta, code } = componentTemplate('Big Number');
    expect(meta.name).toBe('Big Number');
    expect(validateComponent('big-number', meta, code)).toEqual([]);
  });

  it.each(['ltr', 'rtl'] as const)('draws without errors through its whole duration (%s)', async (dir) => {
    const { meta, code } = componentTemplate('Big Number');
    const file = join(mkdtempSync(join(tmpdir(), 'vibe-tpl-')), 'component.js');
    writeFileSync(file, code);
    const mod = (await import(pathToFileURL(file).href)).default;
    const brand = JSON.parse(readFileSync('presets/library/brand.json', 'utf8'));
    const lib = { brand, styles: {}, components: { 'big-number': { id: 'big-number', meta, mod } } } as unknown as Library;
    const project = tileProject(lib, 'flat9k', 'dark', dir, 'big-number', {}, 1080, 1920);
    expect(project.tracks.graphics[0]).toMatchObject({ type: 'big-number', at: 0, dur: meta.duration });
    for (const t of [0, 0.2, 0.6, 1.2, meta.duration - 0.1]) {
      const errors = renderFrame(fakeCtx(), project, lib, t).filter((e) => e.includes('big-number'));
      expect(errors, `t=${t}`).toEqual([]);
    }
  });
});
