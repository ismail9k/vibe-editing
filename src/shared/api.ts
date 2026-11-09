// The bridge between the app window and the main process (window.vibe).
export interface WorkspaceInfo { root: string; projects: string[]; styles: string[]; components: string[] }
export interface ImportedMedia { src: string; duration: number; kind: 'video' | 'audio' }
export interface WsChange { kind: 'project' | 'style' | 'component' | 'brand'; id: string; rel: string }
export type WriteResult = { ok: true } | { ok: false; current: string | null };
/** At 'done', `errors` lists what went wrong drawing frames (a broken component draws a red box); the file still exists. */
export interface ExportProgress { stage: 'mattes' | 'frames' | 'encoding' | 'done' | 'error'; done: number; total: number; message?: string; out?: string; errors?: string[] }

export interface MatteProgressEvent { project: string; src: string; done: number; total: number }

export interface VibeApi {
  info(): Promise<WorkspaceInfo>;
  read(rel: string): Promise<string | null>;
  /** With `base`, writes only if the file still holds it (see writeChecked). */
  write(rel: string, text: string, base?: string | null): Promise<WriteResult>;
  exists(rels: string[]): Promise<Record<string, boolean>>;
  duplicate(fromRel: string, toRel: string): Promise<void>;
  createProject(name: string): Promise<string>;
  importMedia(project: string, paths?: string[]): Promise<ImportedMedia[]>;
  pathForFile(file: File): string;
  writeSession(project: string, session: unknown): Promise<void>;
  exportProject(project: string): Promise<string>;
  onExportProgress(cb: (p: ExportProgress) => void): () => void;
  onChange(cb: (c: WsChange) => void): () => void;
  /** Makes any missing cutout mattes for a project (macOS); progress arrives through onMatteProgress. */
  ensureMattes(project: string): Promise<{ error?: string }>;
  onMatteProgress(cb: (p: MatteProgressEvent) => void): () => void;
  initialProject(): Promise<string | null>;
  // export window only
  frameReady(rgba: ArrayBuffer): Promise<void>;
  headlessJob(): Promise<HeadlessJob | null>;
  headlessDone(result: HeadlessResult): Promise<void>;
  /** The footage under frame i of a frames job (or time i of a png job): RGBA at W×H and the grey cutout matte at W/2×H/2. */
  headlessMedia(i: number): Promise<HeadlessMedia>;
}

export interface HeadlessMedia { frame: Uint8Array | null; matte: Uint8Array | null }

export interface HeadlessResult { errors: string[]; pngs?: ArrayBuffer[]; fatal?: string }

export type HeadlessJob =
  | { kind: 'frames'; project: string; from: number; count: number }
  | { kind: 'png'; project: string; times: number[] };

declare global {
  interface Window { vibe: VibeApi }
}
