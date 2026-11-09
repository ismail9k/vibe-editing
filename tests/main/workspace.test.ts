import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { resolveInside, workspaceRoot, seedWorkspace, presetStatus, takePresets, listLibrary, listProjects, uniqueName, importable, writeChecked, migrateProjects, projectAtPath } from '../../src/main/workspace';
import { projectName } from '../../src/core/model';

let root: string, presets: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibe-ws-'));
  presets = mkdtempSync(join(tmpdir(), 'vibe-presets-'));
  mkdirSync(join(presets, 'library/styles/flat9k'), { recursive: true });
  mkdirSync(join(presets, 'library/components/stat'), { recursive: true });
  mkdirSync(join(presets, 'projects/demo.vibe'), { recursive: true });
  writeFileSync(join(presets, 'library/styles/flat9k/style.json'), '{"preset":true}');
  writeFileSync(join(presets, 'library/components/stat/component.json'), '{}');
  writeFileSync(join(presets, 'projects/demo.vibe/vibe.json'), '{}');
});

describe('resolveInside', () => {
  it('resolves a path inside the workspace', () => {
    expect(resolveInside(root, 'library/brand.json')).toBe(join(root, 'library/brand.json'));
  });
  it('refuses paths that escape the workspace', () => {
    expect(() => resolveInside(root, '../etc/passwd')).toThrow(/outside/);
    expect(() => resolveInside(root, '/etc/passwd')).toThrow(/outside/);
    expect(() => resolveInside(root, 'projects/../../x')).toThrow(/outside/);
  });
});

describe('seedWorkspace', () => {
  it('copies presets into an empty workspace', () => {
    seedWorkspace(root, presets);
    expect(existsSync(join(root, 'library/styles/flat9k/style.json'))).toBe(true);
    expect(listLibrary(root)).toEqual({ styles: ['flat9k'], components: ['stat'] });
    expect(listProjects(root)).toEqual(['demo']);
  });
  it('never overwrites a file the user changed', () => {
    mkdirSync(join(root, 'library/styles/flat9k'), { recursive: true });
    writeFileSync(join(root, 'library/styles/flat9k/style.json'), '{"mine":true}');
    seedWorkspace(root, presets);
    expect(readFileSync(join(root, 'library/styles/flat9k/style.json'), 'utf8')).toBe('{"mine":true}');
  });
});

describe('projects as .vibe packages', () => {
  const project = (dir: string, text = '{}') => { mkdirSync(join(root, 'projects', dir), { recursive: true }); writeFileSync(join(root, 'projects', dir, 'vibe.json'), text); };

  it('lists only .vibe folders that hold a vibe.json, by name', () => {
    project('a.vibe'); project('b');
    mkdirSync(join(root, 'projects/empty.vibe'), { recursive: true });
    expect(listProjects(root)).toEqual(['a']);
  });

  it('gives old project folders the .vibe ending, and leaves one alone whose new name is taken', () => {
    project('old', 'OLD'); project('both', 'FOLDER'); project('both.vibe', 'PACKAGE');
    mkdirSync(join(root, 'projects/not-a-project'), { recursive: true });
    expect(migrateProjects(root)).toEqual(['old']);
    expect(readFileSync(join(root, 'projects/old.vibe/vibe.json'), 'utf8')).toBe('OLD');
    expect(existsSync(join(root, 'projects/old'))).toBe(false);
    expect(readFileSync(join(root, 'projects/both/vibe.json'), 'utf8')).toBe('FOLDER');
    expect(readFileSync(join(root, 'projects/both.vibe/vibe.json'), 'utf8')).toBe('PACKAGE');
    expect(existsSync(join(root, 'projects/not-a-project'))).toBe(true);
  });

  it('migrates before seeding without seeding a second demo beside the old one', () => {
    seedWorkspace(root, presets);
    // A workspace from before: the demo in a plain folder, edited by the user.
    renameSync(join(root, 'projects/demo.vibe'), join(root, 'projects/demo'));
    writeFileSync(join(root, 'projects/demo/vibe.json'), '{"mine":true}');
    const manifest = readFileSync(join(root, '.vibe/presets.json'), 'utf8');
    writeFileSync(join(root, '.vibe/presets.json'), manifest.replaceAll('projects/demo.vibe/', 'projects/demo/'));
    migrateProjects(root);
    seedWorkspace(root, presets);
    expect(listProjects(root)).toEqual(['demo']);
    expect(readFileSync(join(root, 'projects/demo.vibe/vibe.json'), 'utf8')).toBe('{"mine":true}');
    const keys = Object.keys(JSON.parse(readFileSync(join(root, '.vibe/presets.json'), 'utf8')));
    expect(keys).toContain('projects/demo.vibe/vibe.json');
    expect(keys).not.toContain('projects/demo/vibe.json');
  });

  it('finds the project a path from Finder belongs to, only inside this workspace', () => {
    project('film.vibe');
    expect(projectAtPath(root, join(root, 'projects/film.vibe'))).toBe('film');
    expect(projectAtPath(root, join(root, 'projects/film.vibe/'))).toBe('film');
    expect(projectAtPath(root, join(root, 'projects/film.vibe/vibe.json'))).toBe('film');
    expect(projectAtPath(root, join(root, 'projects/gone.vibe'))).toBeNull();
    expect(projectAtPath(root, '/Users/someone/Desktop/film.vibe')).toBeNull();
    expect(projectAtPath(root, join(root, 'library'))).toBeNull();
  });

  it('reads a project name however it was typed', () => {
    for (const arg of ['demo', 'demo.vibe', 'demo.vibe/', 'projects/demo.vibe', '/Users/me/Vibe/projects/demo.vibe/']) expect(projectName(arg)).toBe('demo');
  });
});

describe('importable', () => {
  it('accepts regular video and audio files only', () => {
    writeFileSync(join(root, 'take.MOV'), '');
    writeFileSync(join(root, 'notes.txt'), '');
    mkdirSync(join(root, 'folder.mp4'));
    expect(importable(join(root, 'take.MOV'))).toBe(true);
    expect(importable(join(root, 'notes.txt'))).toBe(false);
    expect(importable(join(root, 'folder.mp4'))).toBe(false);
    expect(importable(join(root, 'missing.wav'))).toBe(false);
  });
});

describe('uniqueName', () => {
  it('adds a number when the name is taken', () => {
    mkdirSync(join(root, 'media'));
    writeFileSync(join(root, 'media/take.mov'), '');
    expect(uniqueName(join(root, 'media'), 'take.mov')).toBe('take-2.mov');
    expect(uniqueName(join(root, 'media'), 'other.mov')).toBe('other.mov');
  });
});

describe('writeChecked', () => {
  it('writes when the disk still holds the text the app last saw', () => {
    mkdirSync(join(root, 'projects/p.vibe'), { recursive: true });
    writeFileSync(join(root, 'projects/p.vibe/vibe.json'), 'A');
    expect(writeChecked(root, 'projects/p.vibe/vibe.json', 'B', 'A')).toEqual({ ok: true });
    expect(readFileSync(join(root, 'projects/p.vibe/vibe.json'), 'utf8')).toBe('B');
  });
  it('refuses, and returns the disk text, when someone else changed the file', () => {
    mkdirSync(join(root, 'projects/p.vibe'), { recursive: true });
    writeFileSync(join(root, 'projects/p.vibe/vibe.json'), 'CLAUDE');
    expect(writeChecked(root, 'projects/p.vibe/vibe.json', 'APP', 'A')).toEqual({ ok: false, current: 'CLAUDE' });
    expect(readFileSync(join(root, 'projects/p.vibe/vibe.json'), 'utf8')).toBe('CLAUDE');
  });
  it('treats a null base as "the file should not exist yet"', () => {
    expect(writeChecked(root, 'library/styles/new/style.json', '{}', null)).toEqual({ ok: true });
    expect(writeChecked(root, 'library/styles/new/style.json', '{"x":1}', null)).toEqual({ ok: false, current: '{}' });
  });
  it('writes unconditionally without a base', () => {
    expect(writeChecked(root, 'a.json', '1', undefined)).toEqual({ ok: true });
    expect(writeChecked(root, 'a.json', '2', undefined)).toEqual({ ok: true });
  });
});

describe('workspaceRoot', () => {
  it('makes a relative VIBE_HOME absolute, so paths the watcher reports match the ones the app wrote', () => {
    const was = process.env.VIBE_HOME;
    try {
      process.env.VIBE_HOME = 'scratch/ws';
      expect(isAbsolute(workspaceRoot())).toBe(true);
      expect(workspaceRoot()).toBe(join(process.cwd(), 'scratch/ws'));
    } finally {
      if (was === undefined) delete process.env.VIBE_HOME; else process.env.VIBE_HOME = was;
    }
  });
});

describe('preset updates', () => {
  const STYLE = 'library/styles/flat9k/style.json';
  const ship = (rel: string, text: string) => writeFileSync(join(presets, rel), text); // a newer app version
  const ws = (rel: string) => readFileSync(join(root, rel), 'utf8');

  it('brings a preset nobody touched up to the app\'s version', () => {
    seedWorkspace(root, presets);
    ship(STYLE, '{"preset":2}');
    expect(seedWorkspace(root, presets).updated).toEqual([STYLE]);
    expect(ws(STYLE)).toBe('{"preset":2}');
    ship(STYLE, '{"preset":3}');
    seedWorkspace(root, presets);
    expect(ws(STYLE)).toBe('{"preset":3}');
  });

  it('keeps a preset you changed, and says so', () => {
    seedWorkspace(root, presets);
    writeFileSync(join(root, STYLE), '{"mine":true}');
    ship(STYLE, '{"preset":2}');
    const r = seedWorkspace(root, presets);
    expect(r.updated).toEqual([]);
    expect(r.kept).toEqual([STYLE]);
    expect(ws(STYLE)).toBe('{"mine":true}');
  });

  it('never updates a film', () => {
    seedWorkspace(root, presets);
    ship('projects/demo.vibe/vibe.json', '{"v":2}');
    seedWorkspace(root, presets);
    expect(ws('projects/demo.vibe/vibe.json')).toBe('{}');
  });

  it('lists what differs in a workspace seeded before updates were tracked', () => {
    mkdirSync(join(root, 'library/styles/flat9k'), { recursive: true });
    writeFileSync(join(root, STYLE), '{"old":true}');       // an older copy, or an edit: can't tell
    mkdirSync(join(root, 'library/components/stat'), { recursive: true });
    writeFileSync(join(root, 'library/components/stat/component.json'), '{}'); // the same as the app's
    seedWorkspace(root, presets);
    expect(ws(STYLE)).toBe('{"old":true}');
    expect(presetStatus(root, presets)).toEqual([{ rel: STYLE, state: 'differs' }]);
  });

  it('takes the app\'s version on request, keeping the old one aside', () => {
    mkdirSync(join(root, 'library/styles/flat9k'), { recursive: true });
    writeFileSync(join(root, STYLE), '{"old":true}');
    seedWorkspace(root, presets);
    const r = takePresets(root, presets, [STYLE]);
    expect(ws(STYLE)).toBe('{"preset":true}');
    expect(readFileSync(join(r.backupDir!, STYLE), 'utf8')).toBe('{"old":true}');
    expect(presetStatus(root, presets)).toEqual([]);
    // From now on it follows the app's updates.
    ship(STYLE, '{"preset":2}');
    seedWorkspace(root, presets);
    expect(ws(STYLE)).toBe('{"preset":2}');
  });

  it('refuses to take a file that is not a preset', () => {
    seedWorkspace(root, presets);
    expect(() => takePresets(root, presets, ['library/styles/nope/style.json'])).toThrow(/not a preset/);
  });
});
