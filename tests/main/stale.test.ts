import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staleReason } from '../../bin/stale.mjs';

let app: string;
const touch = (rel: string, secondsAgo: number) => {
  const f = join(app, rel);
  mkdirSync(join(f, '..'), { recursive: true });
  writeFileSync(f, '');
  const t = Date.now() / 1000 - secondsAgo;
  utimesSync(f, t, t);
};
const built = (secondsAgo: number) => ['out/main/index.js', 'out/preload/index.mjs', 'out/renderer/index.html'].forEach((f) => touch(f, secondsAgo));

beforeEach(() => { app = mkdtempSync(join(tmpdir(), 'vibe-app-')); });

describe('staleReason', () => {
  it('builds when out/ is missing or partial', () => {
    touch('src/main/index.ts', 100);
    expect(staleReason(app)).toMatch(/building/);
    touch('out/main/index.js', 10);
    expect(staleReason(app)).toMatch(/building/);
  });

  it('rebuilds when a source file is newer than the build', () => {
    built(100);
    touch('src/core/render.ts', 10);
    expect(staleReason(app)).toMatch(/rebuilding/);
  });

  it('runs the build as it is when nothing changed since', () => {
    touch('src/core/render.ts', 100);
    touch('electron.vite.config.ts', 100);
    built(10);
    expect(staleReason(app)).toBeNull();
  });

  it('runs an installed copy without its source as it is', () => {
    built(10);
    expect(staleReason(app)).toBeNull();
  });
});
