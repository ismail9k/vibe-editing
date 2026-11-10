// More than one brand: the workspace's own, and the extra ones a film can ask for by id.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { brandFile, brandOf, fillBrand, MAIN_BRAND, type Brand } from '../../src/core/brand';
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
});
