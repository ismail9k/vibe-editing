// The workspace on disk (~/Vibe by default): library, projects, media.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { PROJECT_EXT, projectDir } from '../core/model';

// Absolute even when VIBE_HOME is relative: the self-write guard compares the paths it wrote with the watcher's.
export const workspaceRoot = () => resolve(process.env.VIBE_HOME || join(homedir(), 'Vibe'));

/** Absolute path of a workspace-relative path. Throws if it would leave the workspace. */
export function resolveInside(root: string, rel: string): string {
  if (isAbsolute(rel)) throw new Error(`path outside the workspace: ${rel}`);
  const abs = resolve(root, rel), back = relative(root, abs);
  if (back.startsWith('..') || isAbsolute(back)) throw new Error(`path outside the workspace: ${rel}`);
  return abs;
}

// Which preset files the workspace got from the app, and as what: `.vibe/presets.json` maps each one to the hash of
// the text it was given. A file still holding that text is untouched and can follow the app's updates; one that
// doesn't was changed by you (or Claude) and is never overwritten.
const MANIFEST = '.vibe/presets.json';
const hashOf = (text: Buffer | string) => createHash('sha1').update(text).digest('hex');

function readManifest(root: string): Record<string, string> {
  try { return JSON.parse(readFileSync(join(root, MANIFEST), 'utf8')); } catch { return {}; }
}
function writeManifest(root: string, m: Record<string, string>) {
  mkdirSync(join(root, '.vibe'), { recursive: true });
  writeFileSync(join(root, MANIFEST), JSON.stringify(m, null, 2) + '\n');
}

/** Every file under presets/, workspace-relative, with forward slashes. */
function presetFiles(presetsDir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(join(presetsDir, rel))) {
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(join(presetsDir, r)).isDirectory()) walk(r); else out.push(r);
    }
  };
  walk('');
  return out.sort();
}

/** Films are yours from the moment they're seeded: the app never updates anything under projects/. */
const updatable = (rel: string) => !rel.startsWith('projects/');

export interface PresetSync { added: string[]; updated: string[]; kept: string[] }

/** Bring the workspace up to the app's presets: copy in what's missing, update what nobody has touched since the
 *  app put it there, and keep everything else as it is (`kept` lists the files you changed that the app has a
 *  newer version of). A workspace seeded before this was tracked only records the files that match the app's. */
export function seedWorkspace(root: string, presetsDir: string): PresetSync {
  mkdirSync(root, { recursive: true });
  const manifest = readManifest(root), result: PresetSync = { added: [], updated: [], kept: [] };
  for (const rel of presetFiles(presetsDir)) {
    const src = join(presetsDir, rel), dst = join(root, rel), want = readFileSync(src), wantHash = hashOf(want);
    if (!existsSync(dst)) {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
      manifest[rel] = wantHash; result.added.push(rel);
      continue;
    }
    const have = hashOf(readFileSync(dst));
    if (have === wantHash) { manifest[rel] = wantHash; continue; }
    if (manifest[rel] === have && updatable(rel)) {
      writeText(root, rel, want);
      manifest[rel] = wantHash; result.updated.push(rel);
    } else if (manifest[rel] && updatable(rel)) result.kept.push(rel);
  }
  writeManifest(root, manifest);
  return result;
}

/** Library and guide files that differ from the app's version: `changed` since the app put them there, or
 *  `differs` when the workspace predates tracking (an older copy, or an edit; there's no telling which). */
export function presetStatus(root: string, presetsDir: string): { rel: string; state: 'changed' | 'differs' }[] {
  const manifest = readManifest(root);
  return presetFiles(presetsDir).filter(updatable).flatMap((rel) => {
    const dst = join(root, rel);
    if (!existsSync(dst) || hashOf(readFileSync(dst)) === hashOf(readFileSync(join(presetsDir, rel)))) return [];
    return [{ rel, state: manifest[rel] ? 'changed' as const : 'differs' as const }];
  });
}

/** Replace workspace files with the app's version. The replaced copies go to .vibe/replaced/<time>/ first. */
export function takePresets(root: string, presetsDir: string, rels: string[]): { backupDir: string | null } {
  const known = new Set(presetFiles(presetsDir));
  for (const rel of rels) if (!known.has(rel)) throw new Error(`${rel} is not a preset file`);
  const manifest = readManifest(root), stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = resolveInside(root, `.vibe/replaced/${stamp}`);
  let backedUp = false;
  for (const rel of rels) {
    const dst = resolveInside(root, rel), want = readFileSync(join(presetsDir, rel));
    if (existsSync(dst)) {
      const keep = join(backupDir, rel);
      mkdirSync(dirname(keep), { recursive: true });
      copyFileSync(dst, keep);
      backedUp = true;
    }
    writeText(root, rel, want);
    manifest[rel] = hashOf(want);
  }
  writeManifest(root, manifest);
  return { backupDir: backedUp ? backupDir : null };
}

const dirs = (p: string) => (existsSync(p) ? readdirSync(p).filter((n) => !n.startsWith('.') && statSync(join(p, n)).isDirectory()).sort() : []);

export const listLibrary = (root: string) => ({ styles: dirs(join(root, 'library/styles')), components: dirs(join(root, 'library/components')) });
export const listProjects = (root: string) => dirs(join(root, 'projects'))
  .filter((n) => n.endsWith(PROJECT_EXT) && existsSync(join(root, 'projects', n, 'vibe.json')))
  .map((n) => n.slice(0, -PROJECT_EXT.length));

/** The project a path Finder hands the app belongs to: <root>/projects/<name>.vibe or anything inside it.
 *  Null for a .vibe anywhere else (a copy on the Desktop, another workspace): the app only opens its own. */
export function projectAtPath(root: string, abs: string): string | null {
  const back = relative(root, resolve(abs));
  if (!back || back.startsWith('..') || isAbsolute(back)) return null;
  const parts = back.split(/[\\/]/);
  if (parts[0] !== 'projects' || !parts[1]?.endsWith(PROJECT_EXT)) return null;
  const name = parts[1].slice(0, -PROJECT_EXT.length);
  return name && existsSync(join(root, projectDir(name), 'vibe.json')) ? name : null;
}

/** Projects used to be plain folders (projects/<name>/). Give each one the .vibe ending so Finder shows it as a
 *  document that opens in the app. A folder whose .vibe name is taken is left alone. Runs before seeding, so the
 *  seeded demos land in the renamed folders instead of beside them. */
export function migrateProjects(root: string): string[] {
  const moved: string[] = [];
  for (const n of dirs(join(root, 'projects'))) {
    if (n.endsWith(PROJECT_EXT) || !existsSync(join(root, 'projects', n, 'vibe.json'))) continue;
    const to = join(root, projectDir(n));
    if (existsSync(to)) continue;
    renameSync(join(root, 'projects', n), to);
    moved.push(n);
  }
  if (moved.length) {
    // Keep the preset record pointing at the same files.
    const manifest = readManifest(root), next: Record<string, string> = {};
    for (const [rel, hash] of Object.entries(manifest)) {
      const n = moved.find((m) => rel.startsWith(`projects/${m}/`));
      next[n ? projectDir(n) + rel.slice(`projects/${n}`.length) : rel] = hash;
    }
    writeManifest(root, next);
  }
  return moved;
}

export function readText(root: string, rel: string): string | null {
  const abs = resolveInside(root, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

/** Write through a temp file and rename, so a reader never sees half a file. */
export function writeText(root: string, rel: string, text: string | Uint8Array): string {
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

/** Copy files into projects/<name>.vibe/media and describe them. */
export async function importMedia(root: string, project: string, paths: string[]) {
  const mediaDir = resolveInside(root, `${projectDir(project)}/media`);
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
