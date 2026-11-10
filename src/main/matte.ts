// Cutout mattes: one grey video per footage file (white = the speaker), made once with Apple Vision through
// native/vibe-matte.swift and kept at media/.matte/<file>.matte.mp4. ffmpeg decodes the footage upright (and
// tone-mapped when it's HDR), the helper cuts out each frame, and ffmpeg encodes the mattes at 30 fps.
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

/** Matte frame n is the footage at n/30 s of the file's own clock, counted from its zero rather than its first
 *  picture: in a file whose video starts after its audio, the first picture is held over the gap. */
export function matteDecodeArgs(file: string, w: number, h: number, hdr: boolean): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-i', file, '-an',
    '-vf', `${fitFilter(w, h, hdr)},fps=${MATTE_FPS}:start_time=0,format=bgra`, '-f', 'rawvideo', '-pix_fmt', 'bgra', 'pipe:1'];
}

export function matteEncodeArgs(w: number, h: number, out: string): string[] {
  return ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${w}x${h}`, '-r', String(MATTE_FPS), '-i', 'pipe:0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'fast', '-movflags', '+faststart', out];
}

export interface MatteMeta { matte?: boolean; aims?: boolean }

/** Whether any graphic on the timeline is a component that cuts the speaker out (it needs a matte to export). */
export function usesMatte(p: Project, metas: Record<string, MatteMeta>): boolean {
  return p.tracks.graphics.some((g) => metas[g.type]?.matte === true);
}

/** Whether any graphic cuts the speaker out or aims at them (a zoom on the face). Aiming uses a matte when there
 *  is one and guesses without; the app and the export make mattes for both, but only cutouts refuse to go on
 *  without one. */
export function wantsMatte(p: Project, metas: Record<string, MatteMeta>): boolean {
  return p.tracks.graphics.some((g) => metas[g.type]?.matte === true || metas[g.type]?.aims === true);
}

/** Footage files with no ready matte, each once. */
export function missingMattes(p: Project, ready: (src: string) => boolean): string[] {
  return [...new Set(p.tracks.footage.map((c) => c.src))].filter((src) => !ready(src));
}

// A matte is trusted only with a stamp of the footage it was cut from (size and mtime) next to it: a run that
// died leaves no stamp, and replacing a file under the same name changes the stamp.
const stampPath = (projectDir: string, src: string) => resolveInside(projectDir, matteSrc(src)).replace(/\.mp4$/, '.json');
const footageStamp = (projectDir: string, src: string) => {
  const st = statSync(resolveInside(projectDir, src));
  return { size: st.size, mtimeMs: st.mtimeMs };
};

/** Records that the matte for src was cut from the footage as it is now (or as `stamp` says it was). */
export function stampMatte(projectDir: string, src: string, stamp = footageStamp(projectDir, src)) {
  writeFileSync(stampPath(projectDir, src), JSON.stringify(stamp));
}

/** True when src's matte exists and was cut from the footage file that's there now. */
export function matteReady(projectDir: string, src: string): boolean {
  try {
    if (!existsSync(resolveInside(projectDir, matteSrc(src)))) return false;
    const want = footageStamp(projectDir, src), got = JSON.parse(readFileSync(stampPath(projectDir, src), 'utf8'));
    return got.size === want.size && got.mtimeMs === want.mtimeMs;
  } catch { return false; }
}

const tag = () => `${process.pid}.${randomBytes(4).toString('hex')}`;

/** Where a run writes its matte until it's done: unique per run, so the app and the CLI never share a file. */
export function partialPath(out: string): string {
  return out.replace(/\.mp4$/, `.${tag()}.partial.mp4`);
}

/** Component metas from the workspace library (main has no renderer-side library). */
export function componentMetas(root: string, types: string[]): Record<string, MatteMeta> {
  const out: Record<string, MatteMeta> = {};
  for (const t of new Set(types)) {
    try { out[t] = JSON.parse(readFileSync(resolveInside(root, `library/components/${t}/component.json`), 'utf8')); } catch { /* reported by check */ }
  }
  return out;
}

/** Where the helper is built and what it's built from. binDir must be the app's own folder (userData), never the
 *  workspace: the workspace holds files other tools write, and a binary planted there would be run. */
export interface MatteTools { appDir: string; binDir: string }

type Compile = (source: string, out: string) => Promise<void>;
const swiftc: Compile = (source, out) => new Promise((ok, fail) => execFile('swiftc', ['-O', source, '-o', out], (err, _o, se) => {
  if (!err) return ok();
  fail(new Error((err as NodeJS.ErrnoException).code === 'ENOENT'
    ? 'cutouts need the Swift compiler: run `xcode-select --install`'
    : `couldn't build the cutout helper: ${se || err.message}`));
}));

// One build per helper version in this process; other processes build into their own temp names.
const builds = new Map<string, Promise<string>>();

/** The compiled helper in binDir, rebuilt when its source changes. */
export function helper(tools: MatteTools, compile: Compile = swiftc): Promise<string> {
  if (process.platform !== 'darwin') return Promise.reject(new Error('cutouts need macOS (they use Apple Vision)'));
  const source = join(tools.appDir, 'native', 'vibe-matte.swift');
  const hash = createHash('sha1').update(readFileSync(source)).digest('hex').slice(0, 8);
  const bin = join(tools.binDir, `vibe-matte-${hash}`);
  if (existsSync(bin)) return Promise.resolve(bin);
  let build = builds.get(bin);
  if (!build) {
    build = (async () => {
      mkdirSync(tools.binDir, { recursive: true });
      const tmp = `${bin}.${tag()}.tmp`;
      try { await compile(source, tmp); renameSync(tmp, bin); }
      finally { rmSync(tmp, { force: true }); }
      // Old versions go; anything else (another run's .tmp) is left alone.
      for (const old of readdirSync(tools.binDir)) {
        if (/^vibe-matte-[0-9a-f]{8}$/.test(old) && join(tools.binDir, old) !== bin) rmSync(join(tools.binDir, old), { force: true });
      }
      return bin;
    })().finally(() => builds.delete(bin));
    builds.set(bin, build);
  }
  return build;
}

interface ProbedStream { width?: number; height?: number; side_data_list?: { rotation?: number }[]; tags?: { rotate?: string } }

/** A video stream's stored size and rotation from ffprobe's JSON. Newer files say it in a display matrix
 *  (counter-clockwise degrees); older ones in a `rotate` tag (clockwise), so the tag's sign is flipped. */
export function parseRotation(json: { streams?: ProbedStream[] }): { w: number; h: number; rotation: number } {
  const s = json.streams?.[0] ?? {};
  const matrix = s.side_data_list?.find((d) => d.rotation !== undefined)?.rotation;
  const tag = Number(s.tags?.rotate);
  const rotation = matrix ?? (Number.isFinite(tag) && tag ? -tag : 0);
  return { w: s.width ?? 0, h: s.height ?? 0, rotation };
}

export function rotationOf(file: string): Promise<{ w: number; h: number; rotation: number }> {
  const entries = 'stream=width,height:stream_side_data=rotation:stream_tags=rotate';
  return new Promise((ok, fail) => execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', entries, '-of', 'json', file], (err, out) => {
    if (err) return fail(new Error(`ffprobe failed: ${err.message}`));
    ok(parseRotation(JSON.parse(out)));
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
  procs[procs.length - 1].stdout?.resume(); // nobody reads the last step's output: don't let it fill up
  const running = procs.map(() => true);
  let failed = -1;
  return new Promise((ok, fail) => {
    let left = procs.length;
    // Fail fast on 'exit'; settle on 'close', once stderr is in. A killed chain leaves data buffered between the
    // steps, so their stdouts are destroyed or 'close' would never come.
    const settle = () => {
      if (--left) return;
      if (failed < 0) return ok();
      const why = errs[failed].trim().split('\n').pop() || 'stopped early';
      fail(new Error(`${names[failed]} ${why}`));
    };
    procs.forEach((p, i) => {
      let exited = false, closed = false;
      const exit = (code: number | null) => {
        if (exited) return; exited = true;
        running[i] = false;
        if (failed < 0 && (code !== 0 || running.slice(0, i).some(Boolean))) {
          failed = i;
          procs.forEach((q, j) => { if (running[j]) q.kill('SIGKILL'); q.stdout?.destroy(); });
        }
      };
      const close = () => { if (closed) return; closed = true; settle(); };
      p.on('exit', (c) => exit(c));
      p.on('error', () => { exit(1); close(); });
      p.on('close', (c) => { exit(c); close(); });
    });
  });
}

async function makeMatte(bin: string, projectDir: string, src: string, onProgress: (p: MatteProgress) => void) {
  const file = resolveInside(projectDir, src), out = resolveInside(projectDir, matteSrc(src));
  const partial = partialPath(out);
  mkdirSync(dirname(out), { recursive: true });
  const stamp = footageStamp(projectDir, src);
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
  stampMatte(projectDir, src, stamp);
  onProgress({ src, done: total, total });
}

// One job per matte file, shared by the app's background run and the export. Everyone waiting on a job hears its
// progress, so an export that joins the app's run still shows how far along it is.
const jobs = new Map<string, { done: Promise<void>; listeners: Set<(p: MatteProgress) => void> }>();

interface MatteDeps { helper: (tools: MatteTools) => Promise<string>; make: typeof makeMatte }

/** Makes the missing mattes for a project, one file at a time. A clip whose file is missing is skipped (the check
 *  reports it), and one that fails doesn't stop the rest: every other file gets its matte, then the failures are
 *  reported together. */
export async function ensureMattes(tools: MatteTools, project: Project, projectDir: string, onProgress: (p: MatteProgress) => void = () => {},
  deps: MatteDeps = { helper, make: makeMatte }) {
  const todo = missingMattes(project, (src) => matteReady(projectDir, src)).filter((src) => existsSync(resolveInside(projectDir, src)));
  if (!todo.length) return;
  const bin = await deps.helper(tools);
  const failed: string[] = [];
  for (const src of todo) {
    const key = resolveInside(projectDir, matteSrc(src));
    let job = jobs.get(key);
    if (!job) {
      const listeners = new Set<(p: MatteProgress) => void>();
      const done = deps.make(bin, projectDir, src, (p) => listeners.forEach((l) => l(p))).finally(() => jobs.delete(key));
      jobs.set(key, job = { done, listeners });
    }
    job.listeners.add(onProgress);
    try { await job.done; } catch (e) { failed.push((e as Error).message); }
    finally { job.listeners.delete(onProgress); }
  }
  if (failed.length) throw new Error(failed.join('; '));
}
