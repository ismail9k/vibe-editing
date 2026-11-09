// Watches the workspace so files Claude changes show up in the app.
import { watch, readFileSync, type FSWatcher } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, sep } from 'node:path';

export type ChangeKind = 'project' | 'style' | 'component' | 'brand';
export interface Change { kind: ChangeKind; id: string; rel: string }

const digest = (s: string) => createHash('sha1').update(s).digest('hex');

/** Remembers what the app itself just wrote, so its own saves don't come back as outside changes. */
export class SelfWriteGuard {
  private writes = new Map<string, { hash: string; at: number }>();
  constructor(private windowMs = 2000, private now: () => number = Date.now) {}
  mark(path: string, content: string) { this.writes.set(path, { hash: digest(content), at: this.now() }); }
  isSelf(path: string, content: string): boolean {
    const w = this.writes.get(path);
    return !!w && this.now() - w.at <= this.windowMs && w.hash === digest(content);
  }
}

/** What a workspace-relative path is, or null for files the app doesn't react to. */
export function classify(rel: string): { kind: ChangeKind; id: string } | null {
  const parts = rel.split(/[\\/]/);
  if (parts[0] === 'library') {
    if (parts[1] === 'brand.json') return { kind: 'brand', id: 'brand' };
    if (parts[1] === 'styles' && parts[2] && parts.length >= 4) return { kind: 'style', id: parts[2] };
    if (parts[1] === 'components' && parts[2] && parts.length >= 4) return { kind: 'component', id: parts[2] };
    return null;
  }
  if (parts[0] === 'projects' && parts[1] && parts[2] === 'vibe.json' && parts.length === 3) return { kind: 'project', id: parts[1] };
  return null;
}

export function watchWorkspace(root: string, guard: SelfWriteGuard, onChange: (c: Change) => void): FSWatcher {
  const timers = new Map<string, NodeJS.Timeout>();
  return watch(root, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const rel = String(filename).split(sep).join('/');
    const what = classify(rel);
    if (!what) return;
    clearTimeout(timers.get(rel));
    timers.set(rel, setTimeout(() => {
      timers.delete(rel);
      if (what.kind === 'project') {
        try { if (guard.isSelf(join(root, rel), readFileSync(join(root, rel), 'utf8'))) return; } catch { /* deleted: still report */ }
      }
      onChange({ ...what, rel });
    }, 120));
  });
}
