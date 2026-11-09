import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveInside, seedWorkspace, listLibrary, listProjects, uniqueName, importable, writeChecked } from '../../src/main/workspace';

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
    mkdirSync(join(root, 'projects/p'), { recursive: true });
    writeFileSync(join(root, 'projects/p/vibe.json'), 'A');
    expect(writeChecked(root, 'projects/p/vibe.json', 'B', 'A')).toEqual({ ok: true });
    expect(readFileSync(join(root, 'projects/p/vibe.json'), 'utf8')).toBe('B');
  });
  it('refuses, and returns the disk text, when someone else changed the file', () => {
    mkdirSync(join(root, 'projects/p'), { recursive: true });
    writeFileSync(join(root, 'projects/p/vibe.json'), 'CLAUDE');
    expect(writeChecked(root, 'projects/p/vibe.json', 'APP', 'A')).toEqual({ ok: false, current: 'CLAUDE' });
    expect(readFileSync(join(root, 'projects/p/vibe.json'), 'utf8')).toBe('CLAUDE');
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
