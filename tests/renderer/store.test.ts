import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { VibeApi } from '../../src/shared/api';

// An in-memory workspace with the same compare-and-swap rule as the main process.
const disk = new Map<string, string>();
const REL = 'projects/p/vibe.json';
const film = (value: string) => JSON.stringify({ name: 'p', style: 'flat9k', tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 2, props: { value } }] } });

(globalThis as unknown as { window: { vibe: Partial<VibeApi> } }).window = {
  vibe: {
    read: async (rel) => disk.get(rel) ?? null,
    write: async (rel, text, base) => {
      const current = disk.get(rel) ?? null;
      if (base !== undefined && current !== base) return { ok: false, current };
      disk.set(rel, text);
      return { ok: true };
    },
    exists: async () => ({}),
  },
};

const { useStore } = await import('../../src/renderer/store');
const ops = await import('../../src/core/ops');
const valueOnDisk = () => JSON.parse(disk.get(REL)!).tracks.graphics[0].props.value;
const valueInApp = () => useStore.getState().project!.tracks.graphics[0].props.value;

beforeEach(async () => {
  vi.useFakeTimers();
  disk.clear();
  disk.set(REL, film('1'));
  await useStore.getState().openProject('p');
});
afterEach(() => vi.useRealTimers());

describe('saving never overwrites an outside edit', () => {
  it('drops the app edit and shows the disk when Claude wrote in between', async () => {
    useStore.getState().apply((p) => ops.updateItem(p, 'graphics', 'g1', { props: { value: 'app' } }));
    disk.set(REL, film('claude')); // Claude's write lands before the 300 ms save (the watcher hasn't fired yet)
    await vi.advanceTimersByTimeAsync(400);
    expect(valueOnDisk()).toBe('claude');
    expect(valueInApp()).toBe('claude');
    expect(useStore.getState().diskNote?.text).toMatch(/not saved/);
  });

  it('saves normally when nothing else touched the file', async () => {
    useStore.getState().apply((p) => ops.updateItem(p, 'graphics', 'g1', { props: { value: 'app' } }));
    await vi.advanceTimersByTimeAsync(400);
    expect(valueOnDisk()).toBe('app');
    useStore.getState().apply((p) => ops.updateItem(p, 'graphics', 'g1', { props: { value: 'app2' } }));
    await vi.advanceTimersByTimeAsync(400);
    expect(valueOnDisk()).toBe('app2');
  });
});

describe('a broken vibe.json on disk', () => {
  it('pauses app edits so the broken file is never replaced by an autosave', async () => {
    disk.set(REL, '{"name": "p", "tracks": {');
    await useStore.getState().onDiskChange({ kind: 'project', id: 'p', rel: REL });
    expect(useStore.getState().parseError).toBeTruthy();
    useStore.getState().apply((p) => ops.updateItem(p, 'graphics', 'g1', { props: { value: 'app' } }));
    await vi.advanceTimersByTimeAsync(400);
    expect(disk.get(REL)).toBe('{"name": "p", "tracks": {');
    expect(valueInApp()).toBe('1');
    expect(useStore.getState().diskNote?.text).toMatch(/fix/i);
  });
});
