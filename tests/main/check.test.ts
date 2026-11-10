import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { USAGE, parseCliArgs, checkProject, snapTimes } from '../../src/main/check';
import { stampMatte } from '../../src/main/matte';

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
  it('reads the transcribe options', () => {
    expect(parseCliArgs(['transcribe', 'demo', '--lang', 'ar', '--model', 'small', '--force']))
      .toEqual({ command: 'transcribe', project: 'demo', lang: 'ar', model: 'small', force: true });
    expect(() => parseCliArgs(['transcribe'])).toThrow(/project/);
    expect(() => parseCliArgs(['transcribe', 'demo', '--lang'])).toThrow(/--lang/);
    expect(USAGE).toContain('vibe transcribe <project>');
  });
  it('documents vibe matte', () => {
    expect(USAGE).toContain('vibe matte <project>');
  });
  it('reads vibe presets and the files to take', () => {
    expect(parseCliArgs(['presets'])).toEqual({ command: 'presets' });
    expect(parseCliArgs(['presets', '--take', 'CLAUDE.md', 'library/brand.json'])).toEqual({ command: 'presets', take: ['CLAUDE.md', 'library/brand.json'] });
    expect(() => parseCliArgs(['presets', '--take'])).toThrow(/--take/);
    expect(() => parseCliArgs(['presets', 'demo'])).toThrow(/--take/);
    expect(USAGE).toContain('vibe presets --take');
  });
});

const DRAW = 'export default { draw(p, { props }) { p.text(String(props.value), 0, 0); } };';

describe('parseCliArgs for components', () => {
  it('reads vibe component new, with a source and a name', () => {
    expect(parseCliArgs(['component', 'new', 'big-number'])).toEqual({ command: 'component', sub: 'new', component: 'big-number' });
    expect(parseCliArgs(['component', 'new', 'deal', '--from', 'card', '--name', 'Deal card']))
      .toEqual({ command: 'component', sub: 'new', component: 'deal', from: 'card', name: 'Deal card' });
  });
  it('reads vibe component snap and how to draw it', () => {
    expect(parseCliArgs(['component', 'snap', 'card', '--at', '0.5,1', '--style', 'noir', '--mode', 'light', '--dir', 'rtl', '--props', '{"title":"Hi"}', '-o', 'x.png']))
      .toEqual({ command: 'component', sub: 'snap', component: 'card', at: [0.5, 1], style: 'noir', mode: 'light', dir: 'rtl', props: { title: 'Hi' }, out: 'x.png' });
  });
  it('takes the folder name a tab completion gives', () => {
    expect(parseCliArgs(['component', 'snap', 'library/components/card/']).component).toBe('card');
  });
  it('rejects what it cannot draw', () => {
    expect(() => parseCliArgs(['component'])).toThrow(/new.*snap/);
    expect(() => parseCliArgs(['component', 'snap'])).toThrow(/component/);
    expect(() => parseCliArgs(['component', 'snap', 'card', '--mode', 'neon'])).toThrow(/--mode/);
    expect(() => parseCliArgs(['component', 'snap', 'card', '--dir', 'up'])).toThrow(/--dir/);
    expect(() => parseCliArgs(['component', 'snap', 'card', '--props', '[1]'])).toThrow(/--props/);
    expect(() => parseCliArgs(['component', 'snap', 'card', '--props', '{oops'])).toThrow(/--props/);
    expect(() => parseCliArgs(['component', 'new', 'x', '--style', 'noir'])).toThrow(/--style/);
  });
  it('documents both', () => {
    expect(USAGE).toContain('vibe component new <id>');
    expect(USAGE).toContain('vibe component snap <id>');
  });
});

describe('snapTimes', () => {
  it('shows the entrance closely, then the hold, ending before the fade', () => {
    expect(snapTimes(3)).toEqual([0.1, 0.3, 0.6, 1.2, 2.1, 2.7]);
  });
  it('stays inside a short component', () => {
    expect(snapTimes(0.8)).toEqual([0.1, 0.3, 0.32, 0.5, 0.56, 0.6]);
    for (const t of snapTimes(0.4)) expect(t).toBeLessThan(0.4);
  });
});

describe('checkProject', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vibe-check-'));
    mkdirSync(join(root, 'library/styles/flat9k'), { recursive: true });
    mkdirSync(join(root, 'library/components/stat'), { recursive: true });
    writeFileSync(join(root, 'library/components/stat/component.json'), JSON.stringify({ name: 'Stat', description: '', duration: 3, defaults: { value: '1' }, schema: { value: { type: 'text', label: 'Value' } } }));
    writeFileSync(join(root, 'library/components/stat/component.js'), DRAW);
    mkdirSync(join(root, 'projects/p.vibe'), { recursive: true });
  });
  const write = (o: object) => writeFileSync(join(root, 'projects/p.vibe/vibe.json'), JSON.stringify(o));

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
    writeFileSync(join(root, 'projects/p.vibe/vibe.json'), '{"style": "flat9k", "tracks": {');
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

  it('warns when a cutout effect has no matte yet, and says how to make one', () => {
    mkdirSync(join(root, 'library/components/orbit'), { recursive: true });
    writeFileSync(join(root, 'library/components/orbit/component.json'), JSON.stringify({ name: 'Orbit', description: '', duration: 3, scene: true, matte: true, defaults: {}, schema: {} }));
    writeFileSync(join(root, 'library/components/orbit/component.js'), 'export default { draw(p) { p.subject(); } };');
    mkdirSync(join(root, 'projects/p.vibe/media'), { recursive: true });
    writeFileSync(join(root, 'projects/p.vibe/media/a.mov'), '');
    write({ style: 'flat9k', tracks: { footage: [{ id: 'f1', src: 'media/a.mov', in: 0, out: 2 }], graphics: [{ id: 'g1', type: 'orbit', at: 0, dur: 2, props: {} }] } });
    expect(checkProject(root, 'p')).toContainEqual({ level: 'warn', path: 'media/a.mov', message: 'no cutout yet (orbit needs one): run `vibe matte p`, or open the film in the app' });
    mkdirSync(join(root, 'projects/p.vibe/media/.matte'), { recursive: true });
    writeFileSync(join(root, 'projects/p.vibe/media/.matte/a.mov.matte.mp4'), '');
    expect(checkProject(root, 'p')).toHaveLength(1); // not stamped: a run that died, or older footage
    stampMatte(join(root, 'projects/p.vibe'), 'media/a.mov');
    expect(checkProject(root, 'p')).toEqual([]);
  });

  it('checks the components the film uses, so a broken one is caught before the export', () => {
    writeFileSync(join(root, 'library/components/stat/component.json'), JSON.stringify({ name: 'Stat', description: '', duration: 3, defaults: { value: 3 }, schema: { value: { type: 'text', label: 'Value' } } }));
    writeFileSync(join(root, 'library/components/stat/component.js'), 'export default { draw(p) { Math.random(); } };');
    write({ style: 'flat9k', tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 2, props: { value: '3x' } }] } });
    const issues = checkProject(root, 'p');
    expect(issues).toContainEqual({ level: 'error', path: 'library/components/stat/component.json', message: 'defaults.value should be text' });
    expect(issues.map((i) => i.path)).toContain('library/components/stat/component.js');
  });

  it('leaves alone components the film doesn\'t use', () => {
    mkdirSync(join(root, 'library/components/draft'), { recursive: true });
    writeFileSync(join(root, 'library/components/draft/component.json'), JSON.stringify({ name: 'Draft', duration: 0, defaults: {}, schema: {} }));
    write({ style: 'flat9k', tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 2, props: { value: '3x' } }] } });
    expect(checkProject(root, 'p')).toEqual([]);
  });
});
