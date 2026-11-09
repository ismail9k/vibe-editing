import { describe, it, expect } from 'vitest';
import { SelfWriteGuard, classify } from '../../src/main/watch';

describe('SelfWriteGuard', () => {
  it('recognises the app’s own write by its content', () => {
    const g = new SelfWriteGuard();
    g.mark('/w/projects/demo/vibe.json', 'x');
    expect(g.isSelf('/w/projects/demo/vibe.json', 'x')).toBe(true);
  });

  it('treats different content at the same path as an outside change', () => {
    const g = new SelfWriteGuard();
    g.mark('/w/projects/demo/vibe.json', 'x');
    expect(g.isSelf('/w/projects/demo/vibe.json', 'y')).toBe(false);
  });

  it('forgets a write after the window passes', () => {
    let now = 0;
    const g = new SelfWriteGuard(2000, () => now);
    g.mark('/a', 'x');
    now = 2500;
    expect(g.isSelf('/a', 'x')).toBe(false);
  });
});

describe('classify', () => {
  it('maps workspace paths to what changed', () => {
    expect(classify('projects/demo/vibe.json')).toEqual({ kind: 'project', id: 'demo' });
    expect(classify('library/styles/chalkboard/style.js')).toEqual({ kind: 'style', id: 'chalkboard' });
    expect(classify('library/components/stat/component.json')).toEqual({ kind: 'component', id: 'stat' });
    expect(classify('library/brand.json')).toEqual({ kind: 'brand', id: 'brand' });
  });

  it('ignores the app’s session file, renders and media', () => {
    expect(classify('projects/demo/.vibe/session.json')).toBeNull();
    expect(classify('projects/demo/out/snap.png')).toBeNull();
    expect(classify('projects/demo/media/a.mov')).toBeNull();
  });
});

describe('classify ignores temp and swap files', () => {
  it('drops the atomic-write temp file and editor swap files', () => {
    expect(classify('library/styles/flat9k/style.json.4821.tmp')).toBeNull();
    expect(classify('library/components/stat/.component.js.swp')).toBeNull();
    expect(classify('library/components/stat/component.js~')).toBeNull();
    expect(classify('library/styles/flat9k/style.json')).toEqual({ kind: 'style', id: 'flat9k' });
  });
});
