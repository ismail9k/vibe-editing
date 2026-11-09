import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveInside, seedWorkspace, listLibrary, listProjects, uniqueName } from '../../src/main/workspace';

let root: string, presets: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibe-ws-'));
  presets = mkdtempSync(join(tmpdir(), 'vibe-presets-'));
  mkdirSync(join(presets, 'library/styles/flat9k'), { recursive: true });
  mkdirSync(join(presets, 'library/components/stat'), { recursive: true });
  mkdirSync(join(presets, 'projects/demo'), { recursive: true });
  writeFileSync(join(presets, 'library/styles/flat9k/style.json'), '{"preset":true}');
  writeFileSync(join(presets, 'library/components/stat/component.json'), '{}');
  writeFileSync(join(presets, 'projects/demo/vibe.json'), '{}');
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

describe('uniqueName', () => {
  it('adds a number when the name is taken', () => {
    mkdirSync(join(root, 'media'));
    writeFileSync(join(root, 'media/take.mov'), '');
    expect(uniqueName(join(root, 'media'), 'take.mov')).toBe('take-2.mov');
    expect(uniqueName(join(root, 'media'), 'other.mov')).toBe('other.mov');
  });
});
