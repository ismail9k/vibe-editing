// More than one brand: the workspace's own, and the extra ones a film can ask for by id.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { allBrands, brandFile, brandOf, fillBrand, MAIN_BRAND, type Brand } from '../../src/core/brand';
import { parseProject, serializeProject } from '../../src/core/model';
import { makePainter, tileProject, type Library } from '../../src/core/render';

const main: Brand = JSON.parse(readFileSync('presets/library/brand.json', 'utf8'));

describe('brands', () => {
  it('keeps the workspace brand where it was and puts the others beside it', () => {
    expect(brandFile(MAIN_BRAND)).toBe('library/brand.json');
    expect(brandFile('client')).toBe('library/brands/client.json');
  });

  it('gives a film the brand it names, or the workspace brand when it names none or one that is gone', () => {
    const client = { ...main, name: 'Client' };
    const lib = { brand: main, brands: { client } };
    expect(brandOf(lib, 'client')).toBe(client);
    expect(brandOf(lib)).toBe(main);
    expect(brandOf(lib, 'gone')).toBe(main);
    expect(brandOf({ brand: main }, 'client')).toBe(main);
  });

  it('fills what a hand-written brand leaves out from the workspace brand', () => {
    const b = fillBrand(main, { colors: { primary: '#ff0000' }, modes: { dark: { bg: '#000001' } } } as unknown as Partial<Brand>, 'client');
    expect(b.name).toBe('client');
    expect(b.colors).toEqual({ ...main.colors, primary: '#ff0000' });
    expect(b.modes.dark).toEqual({ ...main.modes.dark, bg: '#000001' });
    expect(b.modes.light).toEqual(main.modes.light);
    expect(b.fonts).toEqual(main.fonts);
    expect(main.colors.primary).not.toBe('#ff0000');
  });

  it('reads and writes the brand a film names, and leaves it out when there is none', () => {
    const named = parseProject('{"brand":"client"}');
    expect(named.project!.brand).toBe('client');
    expect(JSON.parse(serializeProject(named.project!)).brand).toBe('client');
    expect('brand' in parseProject('{}').project!).toBe(false);
    expect(parseProject('{"brand":3}').coerced).toEqual(['brand should be text (got 3)']);
  });

  it('draws a film in its own brand', () => {
    const client = { ...main, name: 'Client' };
    const lib = { brand: main, brands: { client }, styles: {}, components: {} } as unknown as Library;
    const ctx = {} as CanvasRenderingContext2D;
    expect(makePainter(ctx, tileProject(lib, 'flat9k', 'dark', 'ltr', 'x', {}, 10, 10, 'client'), lib, 0).p.brand).toBe(client);
    expect(makePainter(ctx, tileProject(lib, 'flat9k', 'dark', 'ltr', 'x', {}, 10, 10), lib, 0).p.brand).toBe(main);
  });

  it('lists the workspace brand first, then the others', () => {
    const client = fillBrand(main, { name: 'Client' }, 'client');
    expect(allBrands({ brand: main, brands: { client } }).map(([id]) => id)).toEqual([MAIN_BRAND, 'client']);
    expect(allBrands({ brand: main })).toEqual([[MAIN_BRAND, main]]);
  });
});

// The app ships more than one brand, so the brand menu has something to switch to on first run.
describe('preset brands', () => {
  const dir = 'presets/library/brands';
  const extra = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Brand] as const);
  const keys = (o: object) => Object.keys(o).sort();
  const bundled = ['IBM Plex Sans', 'IBM Plex Mono', 'IBM Plex Serif', 'IBM Plex Sans Arabic'];

  it('ships at least three brands, each under its own name', () => {
    const names = [main.name, ...extra.map(([, b]) => b.name)];
    expect(names.length).toBeGreaterThanOrEqual(3);
    expect(new Set(names).size).toBe(names.length);
  });

  // A whole brand, not a patch on 9k: nothing of the green may show through in a film that picked another.
  it.each(extra)('%s is complete and uses only fonts the app bundles', (_id, b) => {
    expect(keys(b.colors)).toEqual(keys(main.colors));
    expect(keys(b.fonts)).toEqual(keys(main.fonts));
    expect(keys(b.modes)).toEqual(keys(main.modes));
    for (const m of ['dark', 'light', 'green'] as const) {
      for (const k of ['bg', 'text', 'muted', 'primaryText', 'surface', 'raised', 'sunken', 'border', 'selected', 'glow', 'glowOpacity']) expect(b.modes[m]).toHaveProperty(k);
      expect(b.modes[m].glow).toHaveLength(3);
    }
    expect(b.modes.green.bg).toBe(b.colors.primary);
    for (const list of Object.values(b.fonts)) for (const f of list.split(',')) expect(bundled).toContain(f.trim());
    expect(b.rules).toContain(b.colors.primary);
  });
});
