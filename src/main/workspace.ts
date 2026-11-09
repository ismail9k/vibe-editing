// The workspace on disk (~/Vibe by default): library, projects, media.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';

export const workspaceRoot = () => process.env.VIBE_HOME || join(homedir(), 'Vibe');

/** Absolute path of a workspace-relative path. Throws if it would leave the workspace. */
export function resolveInside(root: string, rel: string): string {
  if (isAbsolute(rel)) throw new Error(`path outside the workspace: ${rel}`);
  const abs = resolve(root, rel), back = relative(root, abs);
  if (back.startsWith('..') || isAbsolute(back)) throw new Error(`path outside the workspace: ${rel}`);
  return abs;
}

/** Copy every preset file that isn't in the workspace yet. Never overwrites. */
export function seedWorkspace(root: string, presetsDir: string) {
  mkdirSync(root, { recursive: true });
  const walk = (rel: string) => {
    for (const name of readdirSync(join(presetsDir, rel))) {
      const r = rel ? `${rel}/${name}` : name, src = join(presetsDir, r), dst = join(root, r);
      if (statSync(src).isDirectory()) { mkdirSync(dst, { recursive: true }); walk(r); }
      else if (!existsSync(dst)) copyFileSync(src, dst);
    }
  };
  walk('');
}

const dirs = (p: string) => (existsSync(p) ? readdirSync(p).filter((n) => !n.startsWith('.') && statSync(join(p, n)).isDirectory()).sort() : []);

export const listLibrary = (root: string) => ({ styles: dirs(join(root, 'library/styles')), components: dirs(join(root, 'library/components')) });
export const listProjects = (root: string) => dirs(join(root, 'projects')).filter((n) => existsSync(join(root, 'projects', n, 'vibe.json')));

export function readText(root: string, rel: string): string | null {
  const abs = resolveInside(root, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

/** Write through a temp file and rename, so a reader never sees half a file. */
export function writeText(root: string, rel: string, text: string): string {
  const abs = resolveInside(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, abs);
  return abs;
}

/** Write `text` only if the file still holds `base` (the text the app last read or wrote; null = must not exist).
 *  Without a base the write is unconditional. Disk wins: a refused write returns what is on disk now. */
export function writeChecked(root: string, rel: string, text: string, base: string | null | undefined, beforeWrite?: () => void):
  { ok: true } | { ok: false; current: string | null } {
  if (base !== undefined) {
    const current = readText(root, rel);
    if (current !== base) return { ok: false, current };
  }
  beforeWrite?.();
  writeText(root, rel, text);
  return { ok: true };
}

export function uniqueName(dir: string, name: string): string {
  const ext = extname(name), stem = basename(name, ext);
  let candidate = name, n = 2;
  while (existsSync(join(dir, candidate))) candidate = `${stem}-${n++}${ext}`;
  return candidate;
}

export function duplicateDir(root: string, fromRel: string, toRel: string) {
  const from = resolveInside(root, fromRel), to = resolveInside(root, toRel);
  if (existsSync(to)) throw new Error(`${toRel} already exists`);
  cpSync(from, to, { recursive: true });
}

export interface Probe { duration: number; hasVideo: boolean; hasAudio: boolean; hdr: boolean }
export function probe(abs: string): Promise<Probe> {
  return new Promise((ok, fail) => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,color_transfer', '-of', 'json', abs], (err, out) => {
      if (err) return fail(new Error(`ffprobe failed on ${basename(abs)}: ${err.message}`));
      const j = JSON.parse(out) as { format?: { duration?: string }; streams?: { codec_type: string; color_transfer?: string }[] };
      const types = (j.streams ?? []).map((s) => s.codec_type);
      const hdr = (j.streams ?? []).some((s) => s.codec_type === 'video' && ['arib-std-b67', 'smpte2084'].includes(s.color_transfer ?? ''));
      ok({ duration: parseFloat(j.format?.duration ?? '0') || 0, hasVideo: types.includes('video'), hasAudio: types.includes('audio'), hdr });
    });
  });
}

export const MEDIA_EXTENSIONS = ['mov', 'mp4', 'm4v', 'webm', 'wav', 'mp3', 'm4a', 'aac'];

/** Only regular files with a video or audio extension may be imported. */
export function importable(abs: string): boolean {
  if (!MEDIA_EXTENSIONS.includes(extname(abs).slice(1).toLowerCase())) return false;
  try { return statSync(abs).isFile(); } catch { return false; }
}

/** Copy files into projects/<name>/media and describe them. */
export async function importMedia(root: string, project: string, paths: string[]) {
  const mediaDir = resolveInside(root, `projects/${project}/media`);
  mkdirSync(mediaDir, { recursive: true });
  const out: { src: string; duration: number; kind: 'video' | 'audio' }[] = [];
  for (const p of paths) {
    if (!importable(p)) throw new Error(`not a video or audio file: ${basename(p)}`);
    const name = uniqueName(mediaDir, basename(p));
    copyFileSync(p, join(mediaDir, name));
    const info = await probe(join(mediaDir, name));
    out.push({ src: `media/${name}`, duration: info.duration, kind: info.hasVideo ? 'video' : 'audio' });
  }
  return out;
}
