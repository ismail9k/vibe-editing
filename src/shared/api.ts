// The bridge between the app window and the main process (window.vibe).
export interface WorkspaceInfo { root: string; projects: string[]; styles: string[]; components: string[] }
export interface ImportedMedia { src: string; duration: number; kind: 'video' | 'audio' }
export interface WsChange { kind: 'project' | 'style' | 'component' | 'brand'; id: string; rel: string }
export interface ExportProgress { stage: 'frames' | 'encoding' | 'done' | 'error'; done: number; total: number; message?: string; out?: string }

export interface VibeApi {
  info(): Promise<WorkspaceInfo>;
  read(rel: string): Promise<string | null>;
  write(rel: string, text: string): Promise<void>;
  exists(rels: string[]): Promise<Record<string, boolean>>;
  duplicate(fromRel: string, toRel: string): Promise<void>;
  createProject(name: string): Promise<string>;
  importMedia(project: string, paths?: string[]): Promise<ImportedMedia[]>;
  pathForFile(file: File): string;
  writeSession(project: string, session: unknown): Promise<void>;
  exportProject(project: string): Promise<string>;
  onExportProgress(cb: (p: ExportProgress) => void): () => void;
  onChange(cb: (c: WsChange) => void): () => void;
  initialProject(): Promise<string | null>;
  // export window only
  frameReady(rgba: ArrayBuffer): Promise<void>;
  headlessJob(): Promise<HeadlessJob | null>;
  headlessDone(result: HeadlessResult): Promise<void>;
}

export interface HeadlessResult { errors: string[]; pngs?: ArrayBuffer[]; fatal?: string }

export type HeadlessJob =
  | { kind: 'frames'; project: string; from: number; count: number }
  | { kind: 'png'; project: string; times: number[] };

declare global {
  interface Window { vibe: VibeApi }
}
