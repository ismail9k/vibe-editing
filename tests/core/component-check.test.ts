// validateComponent: the checks `vibe component snap` and `vibe check` run on a component's files.
import { describe, it, expect } from 'vitest';
import { validateComponent } from '../../src/core/validate';

const good = {
  name: 'Stat', description: 'A big number', duration: 3,
  defaults: { value: '90%', size: 2, kind: 'big', items: ['a'], glow: true },
  schema: {
    value: { type: 'text', label: 'Value' },
    size: { type: 'number', label: 'Size' },
    kind: { type: 'select', label: 'Kind', options: ['big', 'small'] },
    items: { type: 'list', label: 'Items' },
    glow: { type: 'bool', label: 'Glow' },
  },
};
const code = 'export default { draw(p, { t, props, place }) { p.text(String(props.value), 0, 0); } };';
const errors = (meta: unknown, js: string | null = code) => validateComponent('stat', meta, js).filter((i) => i.level === 'error');
const messages = (meta: unknown, js: string | null = code) => errors(meta, js).map((i) => i.message).join('\n');

describe('validateComponent', () => {
  it('passes a complete component', () => {
    expect(validateComponent('stat', good, code)).toEqual([]);
  });

  it('points at the file each problem is in', () => {
    const issues = errors({ ...good, duration: 0 }, 'export default { draw(p) { Math.random(); } };');
    expect(issues.map((i) => i.path).sort()).toEqual(['library/components/stat/component.js', 'library/components/stat/component.json']);
  });

  it('needs a positive duration', () => {
    expect(messages({ ...good, duration: 0 })).toMatch(/duration/);
    expect(messages({ ...good, duration: '3' })).toMatch(/duration/);
  });

  it('rejects an unknown prop type and a select without options', () => {
    expect(messages({ ...good, schema: { ...good.schema, value: { type: 'string', label: 'Value' } } })).toMatch(/value.*type/);
    expect(messages({ ...good, defaults: { ...good.defaults, kind: undefined }, schema: { ...good.schema, kind: { type: 'select', label: 'Kind' } } })).toMatch(/kind.*options/);
  });

  it('rejects a default with no schema entry, or of the wrong type', () => {
    expect(messages({ ...good, defaults: { ...good.defaults, colour: 'red' } })).toMatch(/colour/);
    expect(messages({ ...good, defaults: { ...good.defaults, size: '2' } })).toMatch(/size/);
    expect(messages({ ...good, defaults: { ...good.defaults, kind: 'huge' } })).toMatch(/kind/);
  });

  it('warns about a prop with no default', () => {
    const { glow: _, ...defaults } = good.defaults;
    const issues = validateComponent('stat', { ...good, defaults }, code);
    expect(issues).toEqual([expect.objectContaining({ level: 'warn', message: expect.stringMatching(/glow/) })]);
  });

  it('rejects component.json that is not an object', () => {
    expect(messages(null)).toMatch(/component\.json/);
    expect(messages([])).toMatch(/component\.json/);
  });

  it('needs a default export', () => {
    expect(messages(good, 'function draw() {}')).toMatch(/export default/);
    expect(messages(good, null)).toMatch(/missing/);
  });

  it('needs the flags for what the code draws', () => {
    expect(messages(good, 'export default { draw(p) { p.footage({ zoom: 2 }); } };')).toMatch(/scene/);
    expect(messages(good, 'export default { draw(p) { p.subject(); } };')).toMatch(/matte/);
    expect(messages(good, 'export default { draw(p) { const b = p.subjectBox(); } };')).toMatch(/aims/);
    expect(errors({ ...good, scene: true, matte: true }, 'export default { draw(p) { p.footage(); p.subject(); p.subjectBox(); } };')).toEqual([]);
    expect(errors({ ...good, aims: true }, 'export default { draw(p) { p.subjectBox(); } };')).toEqual([]);
  });

  it('rejects randomness and the wall clock, which make preview and export differ', () => {
    expect(messages(good, 'export default { draw(p) { Math.random(); } };')).toMatch(/rng/);
    expect(messages(good, 'export default { draw(p) { Date.now(); } };')).toMatch(/clock/);
    expect(messages(good, 'export default { draw(p) { performance.now(); } };')).toMatch(/clock/);
  });
});
