// Loads the workspace library: brand.json, styles and components (their JS over vibe://).
import type { Brand } from '../core/brand';
import type { ComponentModule, Library, LibComponent, LibStyle, StyleMeta } from '../core/render';
import type { ComponentMeta } from '../core/validate';
import type { StyleModule } from '../core/painter';
import type { WorkspaceInfo } from '../shared/api';
import { readDisk } from './disk';

async function json<T>(rel: string): Promise<T> {
  const text = await readDisk(rel);
  if (text === null) throw new Error(`${rel} is missing`);
  try { return JSON.parse(text) as T; } catch (e) { throw new Error(`${rel}: ${(e as Error).message}`); }
}

async function mod<T>(rel: string, stamp: number): Promise<T> {
  const m = await import(/* @vite-ignore */ `vibe://ws/${rel}?v=${stamp}`);
  if (!m.default) throw new Error(`${rel} has no default export`);
  return m.default as T;
}

async function loadStyle(id: string, stamp: number): Promise<LibStyle> {
  const s: LibStyle = { id, meta: { name: id, description: '', params: {} } };
  try { s.meta = await json<StyleMeta>(`library/styles/${id}/style.json`); s.meta.params ??= {}; } catch (e) { s.error = (e as Error).message; }
  try { s.mod = await mod<StyleModule>(`library/styles/${id}/style.js`, stamp); } catch (e) { s.error = `${id}/style.js: ${(e as Error).message}`; }
  return s;
}

async function loadComponent(id: string, stamp: number): Promise<LibComponent> {
  const c: LibComponent = { id, meta: { name: id, description: '', duration: 2, defaults: {}, schema: {} } };
  try { c.meta = { ...c.meta, ...(await json<ComponentMeta>(`library/components/${id}/component.json`)) }; } catch (e) { c.error = (e as Error).message; }
  try { c.mod = await mod<ComponentModule>(`library/components/${id}/component.js`, stamp); } catch (e) { c.error = `${id}/component.js: ${(e as Error).message}`; }
  return c;
}

/** Load the whole library. A broken brand.json throws (the caller keeps its last good library); broken modules load as errors. */
export async function loadLibrary(info: WorkspaceInfo): Promise<Library> {
  const stamp = Date.now();
  const brand = await json<Brand>('library/brand.json');
  const [styles, components] = await Promise.all([
    Promise.all(info.styles.map((id) => loadStyle(id, stamp))),
    Promise.all(info.components.map((id) => loadComponent(id, stamp))),
  ]);
  return {
    brand,
    styles: Object.fromEntries(styles.map((s) => [s.id, s])),
    components: Object.fromEntries(components.map((c) => [c.id, c])),
  };
}
