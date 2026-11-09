import { describe, it, expect } from 'vitest';
import { parseProject } from '../../src/core/model';
import { validateProject, type ComponentMeta } from '../../src/core/validate';

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
