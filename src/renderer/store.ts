// App state. The project on disk is the source of truth: app edits are saved back to vibe.json,
// and changes Claude makes on disk replace what the app shows (disk wins).
import { create } from 'zustand';
import { parseProject, serializeProject, duration, type Project, type TrackName, type Mode, type Dir } from '../core/model';
import { validateProject, type Issue } from '../core/validate';
import type { Library } from '../core/render';
import type { WorkspaceInfo, WsChange } from '../shared/api';
import { loadLibrary } from './library';
import { lastSeen, readDisk, writeDisk } from './disk';

export type Room = 'studio' | 'edit';
export interface Selection { track: TrackName; id: string }
export type StudioFocus = { kind: 'style'; id: string } | { kind: 'component'; id: string } | { kind: 'brand' };

interface State {
  info: WorkspaceInfo | null;
  lib: Library | null;
  libError: string | null;
  projectName: string | null;
  project: Project | null;
  parseError: string | null;
  issues: Issue[];
  room: Room;
  selection: Selection | null;
  playhead: number;
  playing: boolean;
  diskNote: { text: string; at: number } | null;
  history: Project[];
  future: Project[];
  studio: { style: string; mode: Mode; dir: Dir; focus: StudioFocus | null; sample: Record<string, Record<string, unknown>> };
  exporting: { done: number; total: number; stage: string; message?: string; out?: string } | null;

  boot(): Promise<void>;
  refreshInfo(): Promise<void>;
  reloadLibrary(): Promise<void>;
  openProject(name: string): Promise<void>;
  onDiskChange(c: WsChange): Promise<void>;
  apply(fn: (p: Project) => Project): void;
  undo(): void;
  redo(): void;
  select(s: Selection | null): void;
  seek(t: number): void;
  setPlaying(v: boolean): void;
  setRoom(r: Room): void;
  setStudio(patch: Partial<State['studio']>): void;
  validate(): Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let validateTimer: ReturnType<typeof setTimeout> | null = null;
const projectRel = (name: string) => `projects/${name}/vibe.json`;

/** "g3, c2" — the ids whose content differs between two projects. */
function changedIds(a: Project | null, b: Project): string[] {
  if (!a) return [];
  const map = (p: Project) => new Map(Object.values(p.tracks).flat().map((x) => [x.id, JSON.stringify(x)]));
  const ma = map(a), mb = map(b), ids = new Set([...ma.keys(), ...mb.keys()]);
  const out = [...ids].filter((id) => ma.get(id) !== mb.get(id));
  for (const k of ['style', 'mode', 'dir', 'name'] as const) if (a[k] !== b[k]) out.unshift(k);
  if (JSON.stringify(a.format) !== JSON.stringify(b.format)) out.unshift('format');
  return out;
}

export const useStore = create<State>((set, get) => ({
  info: null, lib: null, libError: null, projectName: null, project: null, parseError: null, issues: [],
  room: 'edit', selection: null, playhead: 0, playing: false, diskNote: null, history: [], future: [],
  studio: { style: 'flat9k', mode: 'dark', dir: 'ltr', focus: null, sample: {} },
  exporting: null,

  async boot() {
    await get().refreshInfo();
    await get().reloadLibrary();
    const info = get().info!;
    const first = (await window.vibe.initialProject()) ?? (info.projects.includes('demo') ? 'demo' : info.projects[0]);
    if (first) await get().openProject(first);
  },

  async refreshInfo() { set({ info: await window.vibe.info() }); },

  async reloadLibrary() {
    await get().refreshInfo();
    try {
      const lib = await loadLibrary(get().info!);
      set({ lib, libError: null });
      if (!lib.styles[get().studio.style]) set({ studio: { ...get().studio, style: 'flat9k' } });
    } catch (e) {
      set({ libError: (e as Error).message });
    }
    get().validate();
  },

  async openProject(name) {
    const text = await readDisk(projectRel(name));
    const { project, error } = parseProject(text ?? '{}');
    set({ projectName: name, project: project ?? null, parseError: error ?? null, history: [], future: [], selection: null, playhead: 0, playing: false, diskNote: null });
    if (project) set({ studio: { ...get().studio, style: project.style, mode: project.mode, dir: project.dir } });
    get().validate();
  },

  async onDiskChange(c) {
    if (c.kind !== 'project') { await get().reloadLibrary(); set({ diskNote: { text: `${c.rel} changed on disk`, at: Date.now() } }); return; }
    if (c.id !== get().projectName) { await get().refreshInfo(); return; }
    const before = lastSeen(c.rel);
    const text = await readDisk(c.rel);
    if (text === before && get().project && !get().parseError) return; // already showing this version
    if (text === null) { set({ parseError: 'vibe.json was deleted' }); return; }
    const { project, error } = parseProject(text);
    if (!project) { set({ parseError: error ?? 'invalid vibe.json' }); return; } // keep the last good project
    const hadPending = saveTimer !== null;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    const prev = get().project, ids = changedIds(prev, project);
    const sel = get().selection;
    const selStillThere = sel && (project.tracks[sel.track] as { id: string }[]).some((x) => x.id === sel.id);
    set({
      project, parseError: null,
      history: prev ? [...get().history, prev].slice(-200) : get().history, future: [],
      selection: selStillThere ? sel : null,
      playhead: Math.min(get().playhead, duration(project)),
      diskNote: { text: `vibe.json changed on disk${ids.length ? ` · ${ids.slice(0, 6).join(', ')}` : ''}${hadPending ? ' (replaced your unsaved edit)' : ''}`, at: Date.now() },
    });
    get().validate();
  },

  apply(fn) {
    const { project, projectName } = get();
    if (!project || !projectName || pausedForParseError()) return;
    const next = fn(project);
    if (next === project) return;
    set({ project: next, history: [...get().history, project].slice(-200), future: [] });
    scheduleSave();
  },

  undo() {
    const { history, project } = get();
    if (!history.length || !project || pausedForParseError()) return;
    set({ project: history[history.length - 1], history: history.slice(0, -1), future: [project, ...get().future] });
    scheduleSave();
  },

  redo() {
    const { future, project } = get();
    if (!future.length || !project || pausedForParseError()) return;
    set({ project: future[0], future: future.slice(1), history: [...get().history, project] });
    scheduleSave();
  },

  select(selection) { set({ selection }); },
  seek(t) { const p = get().project; set({ playhead: Math.max(0, Math.min(t, p ? duration(p) : 0)) }); },
  setPlaying(playing) { set({ playing }); },
  setRoom(room) { set({ room }); },
  setStudio(patch) { set({ studio: { ...get().studio, ...patch } }); },

  async validate() {
    if (validateTimer) clearTimeout(validateTimer);
    validateTimer = setTimeout(async () => {
      const { project, lib, info, projectName } = get();
      if (!project || !lib || !info || !projectName) return;
      const srcs = [...project.tracks.footage, ...project.tracks.audio].map((x) => `projects/${projectName}/${x.src}`);
      const exists = srcs.length ? await window.vibe.exists(srcs) : {};
      const components = Object.fromEntries(Object.entries(lib.components).map(([k, v]) => [k, v.meta]));
      set({ issues: validateProject(project, { components, styles: info.styles, mediaExists: (s) => !!exists[`projects/${projectName}/${s}`] }) });
    }, 150);
  },
}));

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    const { project, projectName, parseError } = useStore.getState();
    if (!project || !projectName || parseError) return;
    const rel = projectRel(projectName);
    if (await writeDisk(rel, serializeProject(project))) return;
    // vibe.json changed on disk after we last read it: disk wins, the app edit is dropped.
    await useStore.getState().onDiskChange({ kind: 'project', id: projectName, rel });
    const note = useStore.getState().diskNote?.text ?? 'vibe.json changed on disk';
    useStore.setState({ diskNote: { text: `${note} · your last edit was not saved`, at: Date.now() } });
  }, 300);
  useStore.getState().validate();
}

/** While vibe.json on disk can't be read, app edits would replace it with the last good version: pause them. */
function pausedForParseError(): boolean {
  if (!useStore.getState().parseError) return false;
  useStore.setState({ diskNote: { text: 'vibe.json on disk has an error. Fix it (or ask Claude) before editing here', at: Date.now() } });
  return true;
}
