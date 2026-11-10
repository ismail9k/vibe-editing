// When Claude makes a component while you're in the Studio, the Studio shows it, so you watch it take shape.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VibeApi, WorkspaceInfo } from '../../src/shared/api';

const info: WorkspaceInfo = { root: '/ws', projects: [], styles: ['flat9k'], components: ['card'] };
(globalThis as unknown as { window: { vibe: Partial<VibeApi> } }).window = {
  vibe: { info: async () => ({ ...info, components: [...info.components] }), read: async () => null, exists: async () => ({}) },
};
// The library as the workspace lists it: a component per folder (its code can't load outside the app).
vi.mock('../../src/renderer/library', () => ({
  loadLibrary: async (i: WorkspaceInfo) => ({
    brand: {}, styles: { flat9k: { id: 'flat9k', meta: { name: 'Flat', description: '', params: {} } } },
    components: Object.fromEntries(i.components.map((id) => [id, { id, meta: { name: id, description: '', duration: 2, defaults: {}, schema: {} } }])),
  }),
}));

const { useStore } = await import('../../src/renderer/store');
const made = async (id: string) => {
  info.components.push(id);
  await useStore.getState().onDiskChange({ kind: 'component', id, rel: `library/components/${id}/component.js` });
};

beforeEach(async () => {
  info.components = ['card'];
  await useStore.getState().reloadLibrary();
  useStore.getState().setStudio({ focus: { kind: 'style', id: 'flat9k' } });
});

describe('a component made on disk', () => {
  it('is focused in the Studio', async () => {
    useStore.getState().setRoom('studio');
    await made('big-number');
    expect(useStore.getState().studio.focus).toEqual({ kind: 'component', id: 'big-number' });
  });

  it('leaves the Studio alone when it is only an edit', async () => {
    useStore.getState().setRoom('studio');
    await useStore.getState().onDiskChange({ kind: 'component', id: 'card', rel: 'library/components/card/component.js' });
    expect(useStore.getState().studio.focus).toEqual({ kind: 'style', id: 'flat9k' });
  });

  it('does not pull you out of the Edit room', async () => {
    useStore.getState().setRoom('edit');
    await made('promo');
    expect(useStore.getState().room).toBe('edit');
    expect(useStore.getState().studio.focus).toEqual({ kind: 'style', id: 'flat9k' });
  });
});
