import { describe, it, expect } from 'vitest';
import { parseProject } from '../../src/core/model';
import { lettersToRead, validateProject, type ComponentMeta } from '../../src/core/validate';

const stat: ComponentMeta = {
  name: 'Stat', description: '', duration: 3,
  defaults: { value: '90%', count: true },
  schema: { value: { type: 'text', label: 'Value' }, size: { type: 'number', label: 'Size' }, count: { type: 'bool', label: 'Count up' } },
};
const ctx = (exists = true) => ({ components: { stat }, styles: ['flat9k'], mediaExists: () => exists });
const proj = (o: object) => parseProject(JSON.stringify(o)).project!;

describe('validateProject', () => {
  it('passes a clean project', () => {
    expect(validateProject(proj({ tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 2, props: { value: '1' } }] } }), ctx())).toEqual([]);
  });

  it('flags an unknown component type', () => {
    const issues = validateProject(proj({ tracks: { graphics: [{ id: 'g1', type: 'nope', at: 0, dur: 2, props: {} }] } }), ctx());
    expect(issues[0]).toMatchObject({ level: 'error', path: 'tracks.graphics[0].type' });
  });

  it('flags an unknown style', () => {
    expect(validateProject(proj({ style: 'clay3d' }), ctx())[0]).toMatchObject({ level: 'error', path: 'style' });
  });

  it('flags missing media', () => {
    const issues = validateProject(proj({ tracks: { footage: [{ id: 'f1', src: 'media/gone.mov', in: 0, out: 2 }] } }), ctx(false));
    expect(issues[0]).toMatchObject({ level: 'error', path: 'tracks.footage[0].src' });
  });

  it('flags a prop of the wrong type', () => {
    const issues = validateProject(proj({ tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 2, props: { size: 'big' } }] } }), ctx());
    expect(issues[0]).toMatchObject({ level: 'error', path: 'tracks.graphics[0].props.size' });
  });

  it('warns about a prop the component does not know', () => {
    const issues = validateProject(proj({ tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 2, props: { colour: 'red' } }] } }), ctx());
    expect(issues[0]).toMatchObject({ level: 'warn', path: 'tracks.graphics[0].props.colour' });
  });

  it('flags a clip whose out is not after its in', () => {
    const issues = validateProject(proj({ tracks: { footage: [{ id: 'f1', src: 'media/a.mov', in: 3, out: 3 }] } }), ctx());
    expect(issues[0]).toMatchObject({ level: 'error', path: 'tracks.footage[0].out' });
  });
});

describe('reading time', () => {
  const card: ComponentMeta = {
    name: 'Card', description: '', duration: 3, defaults: { title: 'A title', body: '' },
    schema: { title: { type: 'text', label: 'Title' }, body: { type: 'text', label: 'Body' }, underline: { type: 'text', label: 'Underlined word' }, n: { type: 'number', label: 'N' } },
  };
  const words = 'You describe the film, Claude writes it'; // 33 letters: 2.2 s to read
  const run = (dur: number, props: object) => validateProject(proj({ tracks: { graphics: [{ id: 'g1', type: 'card', at: 0, dur, props }] } }), { ...ctx(), components: { card } });

  it('counts the letters of the text props, given or default, without spaces', () => {
    expect(lettersToRead(card, {})).toBe(6);
    expect(lettersToRead(card, { title: 'كل يوم AI', n: 12345 })).toBe(7);
  });

  it('counts a value repeated inside another one once', () => {
    expect(lettersToRead(card, { title: 'Make your own style', underline: 'own' })).toBe(16);
    expect(lettersToRead(card, { title: 'STYLE', body: 'STYLE' })).toBe(5);
  });

  it('warns when a graphic leaves before its text can be read', () => {
    expect(run(1.5, { title: words })).toEqual([expect.objectContaining({ level: 'warn', path: 'tracks.graphics[0].dur',
      message: 'card has 33 letters to read in 1.5 s: hold it at least 2.2 s, or cut words' })]);
    expect(run(2.2, { title: words })).toEqual([]);
  });
});

describe('clips past the end of their media', () => {
  it('is an error when out passes the recorded media length', () => {
    const issues = validateProject(proj({ tracks: { footage: [{ id: 'f1', src: 'media/a.mov', in: 0, out: 22, srcDur: 20 }] } }), ctx());
    expect(issues).toContainEqual({ level: 'error', path: 'tracks.footage[0].out', message: 'out (22) is past the end of media/a.mov (20 s)' });
  });
});
