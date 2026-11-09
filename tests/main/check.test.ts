import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { USAGE, parseCliArgs, checkProject } from '../../src/main/check';

describe('parseCliArgs', () => {
  it('reads the command, the project, times and the output', () => {
    expect(parseCliArgs(['snapshot', 'demo', '--at', '1,4.5,8', '-o', 'x.png'])).toEqual({ command: 'snapshot', project: 'demo', at: [1, 4.5, 8], out: 'x.png' });
  });
  it('rejects bad times', () => {
    expect(() => parseCliArgs(['snapshot', 'demo', '--at', '1,abc'])).toThrow(/--at/);
  });
  it('needs a project for check, snapshot and render', () => {
    expect(() => parseCliArgs(['render'])).toThrow(/project/);
    expect(() => parseCliArgs(['matte'])).toThrow(/project/);
  });
  it('documents vibe matte', () => {
    expect(USAGE).toContain('vibe matte <project>');
  });
});

describe('checkProject', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vibe-check-'));
    mkdirSync(join(root, 'library/styles/flat9k'), { recursive: true });
    mkdirSync(join(root, 'library/components/stat'), { recursive: true });
    writeFileSync(join(root, 'library/components/stat/component.json'), JSON.stringify({ name: 'Stat', description: '', duration: 3, defaults: {}, schema: { value: { type: 'text', label: 'Value' } } }));
    mkdirSync(join(root, 'projects/p'), { recursive: true });
  });
  const write = (o: object) => writeFileSync(join(root, 'projects/p/vibe.json'), JSON.stringify(o));

  it('reports no issues for a clean project', () => {
    write({ style: 'flat9k', tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 2, props: { value: '3x' } }] } });
    expect(checkProject(root, 'p')).toEqual([]);
  });
  it('reports a wrong prop type and missing media', () => {
    write({ style: 'flat9k', tracks: { footage: [{ id: 'f1', src: 'media/nope.mov', in: 0, out: 2 }], graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 2, props: { value: 3 } }] } });
    const msgs = checkProject(root, 'p').map((i) => i.message).join(' | ');
    expect(msgs).toMatch(/missing media "media\/nope.mov"/);
    expect(msgs).toMatch(/value should be text/);
  });
  it('reports half-written JSON as one error instead of throwing', () => {
    writeFileSync(join(root, 'projects/p/vibe.json'), '{"style": "flat9k", "tracks": {');
    const issues = checkProject(root, 'p');
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('error');
  });
  it('reports a broken component.json', () => {
    writeFileSync(join(root, 'library/components/stat/component.json'), '{oops');
    write({ style: 'flat9k', tracks: {} });
    expect(checkProject(root, 'p').map((i) => i.path)).toContain('library/components/stat/component.json');
  });

  it('reports fields vibe.json had wrong, which the app would otherwise replace with defaults', () => {
    write({ style: 'flat9k', tracks: { graphics: [{ id: 'g1', type: 'stat', at: '3.2', dur: 2, props: {} }] } });
    const issues = checkProject(root, 'p');
    expect(issues).toContainEqual({ level: 'error', path: 'tracks.graphics[0].at', message: 'tracks.graphics[0].at should be a number (got "3.2")' });
  });
});
