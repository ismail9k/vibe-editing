// Cutout mattes: one grey video per footage file (white = the speaker), made once with Apple Vision through
// native/vibe-matte.swift and kept at media/.matte/<file>.matte.mp4. ffmpeg decodes the footage upright (and
// tone-mapped when it's HDR), the helper cuts out each frame, and ffmpeg encodes the mattes at 30 fps.
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { matteSrc, type Project } from '../core/model';
import { fitFilter } from './ffmpeg';
import { probe, resolveInside } from './workspace';

export const MATTE_FPS = 30;
const LONG_SIDE = 960;

export interface MatteProgress { src: string; done: number; total: number }

/** The matte's size: upright (ffmpeg rotates the frames), long side 960 at most, even sides. */
export function matteSize(w: number, h: number, rotation: number): [number, number] {
  const [uw, uh] = Math.abs(rotation) % 180 === 90 ? [h, w] : [w, h];
  const k = Math.min(1, LONG_SIDE / Math.max(uw, uh));
  const even = (v: number) => Math.max(2, Math.round((v * k) / 2) * 2);
  return [even(uw), even(uh)];
}

export function matteDecodeArgs(file: string, w: number, h: number, hdr: boolean): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-i', file, '-an',
    '-vf', `${fitFilter(w, h, hdr)},fps=${MATTE_FPS},format=bgra`, '-f', 'rawvideo', '-pix_fmt', 'bgra', 'pipe:1'];
}

export function matteEncodeArgs(w: number, h: number, out: string): string[] {
  return ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${w}x${h}`, '-r', String(MATTE_FPS), '-i', 'pipe:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'fast', '-movflags', '+faststart', out];
}

/** Whether any graphic on the timeline is a component that cuts the speaker out. */
export function usesMatte(p: Project, metas: Record<string, { matte?: boolean }>): boolean {
  return p.tracks.graphics.some((g) => metas[g.type]?.matte === true);
}

/** Footage files that have no matte yet, each once. `exists` takes a project-relative path. */
export function missingMattes(p: Project, exists: (rel: string) => boolean): string[] {
  return [...new Set(p.tracks.footage.map((c) => c.src))].filter((src) => !exists(matteSrc(src)));
}

/** Component metas from the workspace library (main has no renderer-side library). */
export function componentMetas(root: string, types: string[]): Record<string, { matte?: boolean }> {
  const out: Record<string, { matte?: boolean }> = {};
  for (const t of new Set(types)) {
    try { out[t] = JSON.parse(readFileSync(resolveInside(root, `library/components/${t}/component.json`), 'utf8')); } catch { /* reported by check */ }
  }
  return out;
}

/** Where the helper is built and what it's built from. binDir must be the app's own folder (userData), never the
 *  workspace: the workspace holds files other tools write, and a binary planted there would be run. */
export interface MatteTools { appDir: string; binDir: string }

/** The compiled helper in binDir, rebuilt when its source changes. */
async function helper({ appDir, binDir }: MatteTools): Promise<string> {
  if (process.platform !== 'darwin') throw new Error('cutouts need macOS (they use Apple Vision)');
  const source = join(appDir, 'native', 'vibe-matte.swift');
  const hash = createHash('sha1').update(readFileSync(source)).digest('hex').slice(0, 8);
  const bin = join(binDir, `vibe-matte-${hash}`);
  if (existsSync(bin)) return bin;
  mkdirSync(dirname(bin), { recursive: true });
  const tmp = `${bin}.${process.pid}.tmp`;
  await new Promise<void>((ok, fail) => execFile('swiftc', ['-O', source, '-o', tmp], (err, _o, se) => {
    if (!err) return ok();
    fail(new Error((err as NodeJS.ErrnoException).code === 'ENOENT'
      ? 'cutouts need the Swift compiler: run `xcode-select --install`'
      : `couldn't build the cutout helper: ${se || err.message}`));
  }));
  renameSync(tmp, bin);
  for (const old of readdirSync(dirname(bin))) if (old.startsWith('vibe-matte-') && join(dirname(bin), old) !== bin) rmSync(join(dirname(bin), old), { force: true });
  return bin;
}

function rotationOf(file: string): Promise<{ w: number; h: number; rotation: number }> {
  return new Promise((ok, fail) => execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation', '-of', 'json', file], (err, out) => {
    if (err) return fail(new Error(`ffprobe failed: ${err.message}`));
    const s = (JSON.parse(out).streams ?? [])[0] ?? {};
    const rot = (s.side_data_list ?? []).find((d: { rotation?: number }) => d.rotation !== undefined)?.rotation ?? 0;
    ok({ w: s.width, h: s.height, rotation: rot });
  }));
}

/** Pipes each process's stdout into the next one's stdin and waits for all of them. If any step fails, or quits
 *  while a step before it is still writing, the whole chain is killed (otherwise the steps upstream would block
 *  on a full pipe forever) and the error names that step with the last line it wrote to stderr. */
export function runChain(procs: ChildProcess[], names: string[]): Promise<void> {
  const errs = procs.map(() => '');
  procs.forEach((p, i) => {
    p.stderr?.on('data', (d) => { errs[i] = (errs[i] + d).slice(-2000); });
    if (i > 0) { p.stdin!.on('error', () => {}); procs[i - 1].stdout!.pipe(p.stdin!); }
  });
  const running = procs.map(() => true);
  let failed = -1;
  return new Promise((ok, fail) => {
    let left = procs.length;
    const finish = () => {
      if (--left) return;
      if (failed < 0) return ok();
      const why = errs[failed].trim().split('\n').pop() || 'stopped early';
      fail(new Error(`${names[failed]} ${why}`));
    };
    procs.forEach((p, i) => {
      let done = false;
      const end = (code: number | null) => {
        if (done) return; done = true;
        running[i] = false;
        if (failed < 0 && (code !== 0 || running.slice(0, i).some(Boolean))) {
          failed = i;
          procs.forEach((q, j) => { if (running[j]) q.kill('SIGKILL'); });
        }
        finish();
      };
      p.on('error', () => end(1));
      p.on('close', (c) => end(c));
    });
  });
}

async function makeMatte(bin: string, projectDir: string, src: string, onProgress: (p: MatteProgress) => void) {
  const file = resolveInside(projectDir, src), out = resolveInside(projectDir, matteSrc(src));
  const partial = out.replace(/\.mp4$/, '.partial.mp4');
  mkdirSync(dirname(out), { recursive: true });
  const [{ w: sw, h: sh, rotation }, info] = await Promise.all([rotationOf(file), probe(file)]);
  if (!info.hasVideo) throw new Error(`${src} has no video`);
  const [w, h] = matteSize(sw, sh, rotation);
  const total = Math.max(1, Math.ceil(info.duration * MATTE_FPS));

  const dec = spawn('ffmpeg', matteDecodeArgs(file, w, h, info.hdr), { stdio: ['ignore', 'pipe', 'pipe'] });
  const cut = spawn(bin, [String(w), String(h)], { stdio: ['pipe', 'pipe', 'pipe'] });
  const enc = spawn('ffmpeg', matteEncodeArgs(w, h, partial), { stdio: ['pipe', 'ignore', 'pipe'] });
  let bytes = 0, last = -1;
  cut.stdout!.on('data', (d: Buffer) => {
    bytes += d.length;
    const done = Math.min(total, Math.floor(bytes / (w * h)));
    if (done !== last && (done % 10 === 0 || done === total)) { last = done; onProgress({ src, done, total }); }
  });
  try { await runChain([dec, cut, enc], ['ffmpeg (decode)', 'vibe-matte', 'ffmpeg (encode)']); }
  catch (err) { rmSync(partial, { force: true }); throw new Error(`couldn't cut out ${src}: ${(err as Error).message}`); }
  renameSync(partial, out);
  onProgress({ src, done: total, total });
}

// One job per matte file, shared by the app's background run and the export.
const jobs = new Map<string, Promise<void>>();

/** Makes the missing mattes for a project, one file at a time. */
export async function ensureMattes(tools: MatteTools, project: Project, projectDir: string, onProgress: (p: MatteProgress) => void = () => {}) {
  const todo = missingMattes(project, (rel) => existsSync(resolveInside(projectDir, rel)));
  if (!todo.length) return;
  const bin = await helper(tools);
  for (const src of todo) {
    const key = resolveInside(projectDir, matteSrc(src));
    if (!jobs.has(key)) jobs.set(key, makeMatte(bin, projectDir, src, onProgress).finally(() => jobs.delete(key)));
    await jobs.get(key);
  }
}
