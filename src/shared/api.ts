// The bridge between the app window and the main process (window.vibe).
import type { Dir, Mode } from '../core/model';
export interface WorkspaceInfo { root: string; projects: string[]; styles: string[]; components: string[]; brands: string[] }
export interface ImportedMedia { src: string; duration: number; kind: 'video' | 'audio' }
export interface WsChange { kind: 'project' | 'style' | 'component' | 'brand'; id: string; rel: string }
export type WriteResult = { ok: true } | { ok: false; current: string | null };
/** At 'done', `errors` lists what went wrong drawing frames (a broken component draws a red box); the file still exists. */
export interface ExportProgress { stage: 'mattes' | 'frames' | 'encoding' | 'done' | 'error'; done: number; total: number; message?: string; out?: string; errors?: string[] }

export interface MatteProgressEvent { project: string; src: string; done: number; total: number }

/** One entry in the Claude panel: what you typed, Claude's text, one line per tool it used, or a note from the app. */
export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; label: string; state: 'running' | 'done' | 'error'; detail?: string }
  | { kind: 'note'; tone: 'error' | 'info'; text: string };
/** A project's conversation with Claude Code. `sessionId` is Claude Code's, for `--resume`. */
export interface ChatState { sessionId: string | null; items: ChatItem[]; busy: boolean }
/** What the app has open when you send a message, so "this one" means something to Claude. */
export interface ChatContext { room: 'studio' | 'edit'; playhead: number; selection: { track: string; id: string } | null; focus: string | null }
export interface ChatUpdate { project: string; state: ChatState }

export interface VibeApi {
  info(): Promise<WorkspaceInfo>;
  read(rel: string): Promise<string | null>;
  /** With `base`, writes only if the file still holds it (see writeChecked). */
  write(rel: string, text: string, base?: string | null): Promise<WriteResult>;
  exists(rels: string[]): Promise<Record<string, boolean>>;
  duplicate(fromRel: string, toRel: string): Promise<void>;
  /** Starts library/components/<id>/ from the template, or as a copy of `from` (see createComponent). */
  createComponent(id: string, opts?: { from?: string; name?: string }): Promise<void>;
  createProject(name: string): Promise<string>;
  importMedia(project: string, paths?: string[]): Promise<ImportedMedia[]>;
  /** Every video and sound in the project's media folder, with its length. */
  listMedia(project: string): Promise<ImportedMedia[]>;
  pathForFile(file: File): string;
  writeSession(project: string, session: unknown): Promise<void>;
  exportProject(project: string): Promise<string>;
  onExportProgress(cb: (p: ExportProgress) => void): () => void;
  onChange(cb: (c: WsChange) => void): () => void;
  /** Makes any missing cutout mattes for a project (macOS); progress arrives through onMatteProgress. */
  ensureMattes(project: string): Promise<{ error?: string }>;
  onMatteProgress(cb: (p: MatteProgressEvent) => void): () => void;
  initialProject(): Promise<string | null>;
  /** A project opened from Finder (double-clicking its .vibe) while the app is running. */
  onOpenProject(cb: (name: string) => void): () => void;
  /** The Claude panel: the project's conversation, kept in its .vibe/chat.json. */
  chatState(project: string): Promise<ChatState>;
  /** Starts a turn; returns at once, and the turn streams in through onChat. */
  chatSend(project: string, text: string, ctx: ChatContext): Promise<void>;
  chatStop(project: string): Promise<void>;
  /** New chat: forgets the conversation. */
  chatReset(project: string): Promise<ChatState>;
  onChat(cb: (u: ChatUpdate) => void): () => void;
  /** Whether the Claude panel was open when the app last ran. */
  chatPanelOpen(): Promise<boolean>;
  setChatPanelOpen(open: boolean): Promise<void>;
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
  | { kind: 'png'; project: string; times: number[] }
  | ComponentJob;

/** One component alone, as a Studio tile draws it (no footage: a stand-in speaker), at each time: `vibe component snap`.
 *  Comes back as one PNG: a contact sheet, or the full frame for a single time. */
export interface ComponentJob { kind: 'component'; component: string; style: string; mode: Mode; dir: Dir; props: Record<string, unknown>; times: number[]; w: number; h: number }

declare global {
  interface Window { vibe: VibeApi }
}
