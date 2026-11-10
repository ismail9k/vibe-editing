// Export (MP4) and snapshots (PNG), shared by the app's Export button and the vibe CLI.
import { ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { duration, footageAt, matteSrc, parseProject, projectDir, type Dir, type Mode, type Project } from '../core/model';
import { validateComponent, type Issue } from '../core/validate';
import { snapTimes } from './check';
import { buildDecodeArgs, buildEncodeArgs, buildMeasureArgs, buildMixArgs, buildStillArgs, clipOverruns, masterGain, parseLoudness } from './ffmpeg';
import { FrameReader } from './frames';
import { componentMetas, ensureMattes, matteReady, usesMatte, wantsMatte } from './matte';
import { matteTools } from './paths';
import { runHeadless, type MediaSource } from './headless';
import { listLibrary, probe, resolveInside } from './workspace';
import type { ExportProgress } from '../shared/api';

export function loadProject(root: string, name: string): { project: Project; dir: string } {
  const dir = resolveInside(root, projectDir(name));
  const file = join(dir, 'vibe.json');
  if (!existsSync(file)) throw new Error(`no project "${name}" (${file})`);
  const { project, error } = parseProject(readFileSync(file, 'utf8'));
  if (!project) throw new Error(error);
  return { project, dir };
}

function checkMedia(project: Project, dir: string) {
  for (const x of [...project.tracks.footage, ...project.tracks.audio]) {
    if (!x.src || !existsSync(resolveInside(dir, x.src))) throw new Error(`missing media "${x.src}" (${x.id})`);
  }
}

/** Whether the film's effects want mattes (cutouts or aiming), and which clips have one ready. A clip without a
 *  ready matte draws as if it had none: the preview, the export and snapshots all follow this rule. */
function matteState(root: string, project: Project, dir: string) {
  const metas = componentMetas(root, project.tracks.graphics.map((g) => g.type));
  const wants = wantsMatte(project, metas);
  const ready = () => new Set(wants ? project.tracks.footage.map((c) => c.src).filter((src) => matteReady(dir, src)) : []);
  return { needs: usesMatte(project, metas), wants, ready };
}

async function probeMedia(project: Project, dir: string) {
  const srcs = [...new Set([...project.tracks.footage, ...project.tracks.audio].map((x) => x.src))];
  const hasAudio: Record<string, boolean> = {}, hdr: Record<string, boolean> = {}, lengths: Record<string, number> = {};
  for (const s of srcs) { const info = await probe(resolveInside(dir, s)); hasAudio[s] = info.hasAudio; hdr[s] = info.hdr; lengths[s] = info.duration; }
  return { hasAudio, hdr, lengths };
}

/** An ffmpeg child process with its exit code and the tail of its errors. */
function ffmpeg(args: string[], stdin: boolean) {
  const proc = spawn('ffmpeg', args, { stdio: [stdin ? 'pipe' : 'ignore', stdin ? 'ignore' : 'pipe', 'pipe'] });
  const state = { stderr: '', exited: false };
  proc.stderr!.on('data', (d) => { state.stderr = (state.stderr + d).slice(-4000); });
  proc.stdin?.on('error', () => {}); // EPIPE when ffmpeg stops early: reported through the exit code
  const exit = new Promise<number>((r) => {
    proc.on('error', (e) => { state.stderr += `\n${e.message}`; state.exited = true; r(1); }); // e.g. ffmpeg not installed
    proc.on('close', (code) => { state.exited = true; r(code ?? 1); });
  });
  const lastError = () => state.stderr.trim().split('\n').slice(-3).join(' ');
  const stop = async () => { if (!state.exited) proc.kill('SIGKILL'); await exit; };
  return { proc, exit, state, lastError, stop };
}

/** Waits for an ffmpeg run that has no output to stream, and throws with its error if it fails. */
async function finish(f: ReturnType<typeof ffmpeg>, what: string) {
  if (await f.exit !== 0) throw new Error(`ffmpeg couldn't ${what}: ${f.lastError()}`);
}

/** One frame of `file` at a source time, decoded by ffmpeg (snapshots). */
async function still(args: string[], size: number): Promise<Buffer> {
  const f = ffmpeg(args, false);
  const frame = await new FrameReader(f.proc.stdout!, size, 2).next();
  await f.stop();
  if (!frame) throw new Error(`ffmpeg: ${f.lastError() || 'no frame'}`);
  return Buffer.from(frame);
}

export async function runExport(root: string, name: string, onProgress: (p: ExportProgress) => void, outPath?: string) {
  const { project, dir } = loadProject(root, name);
  checkMedia(project, dir);
  const { hasAudio, hdr, lengths } = await probeMedia(project, dir);
  const overruns = clipOverruns(project, lengths);
  if (overruns.length) throw new Error(`can't export: ${overruns.join('; ')}`);
  const out = outPath ?? join(dir, 'out', `${name}.mp4`);
  mkdirSync(join(out, '..'), { recursive: true });
  const { w: W, h: H, fps } = project.format;
  const mattesFor = matteState(root, project, dir);
  if (mattesFor.wants) {
    try {
      await ensureMattes(matteTools(), project, dir, (m) => onProgress({ stage: 'mattes', done: m.done, total: m.total, message: m.src }));
    } catch (e) {
      // Aiming falls back to a guess; a cutout can't.
      if (mattesFor.needs) throw new Error(`can't export: this film cuts you out of the footage, and ${(e as Error).message}`);
    }
  }
  const ready = mattesFor.ready();

  // Footage (and its cutout mattes) decoded to raw frames; the render window draws every frame over them; the encoder
  // takes the finished frames plus the sound. Encode next to the target and rename at the end: a failed export
  // never replaces the last good file.
  const partial = out.replace(/\.mp4$/i, '') + '.partial.mp4';
  const mix = out.replace(/\.mp4$/i, '') + '.partial.wav';
  // Every process is started inside the try, so whatever fails, the finally stops all of them and removes the
  // partial file.
  let enc: ReturnType<typeof ffmpeg> | null = null, dec: ReturnType<typeof ffmpeg> | null = null, mdec: ReturnType<typeof ffmpeg> | null = null;
  let frames: FrameReader | null = null, mattes: FrameReader | null = null;
  let ok = false;
  let loudness: { from: number; gain: number } | null = null;

  // Frames are asked for in order; past the end of a decoder (a rounding frame short) the last one holds.
  let next = 0, lastFrame: Buffer | null = null, lastMatte: Buffer | null = null;
  const media: MediaSource = async (i) => {
    if (i !== next) throw new Error(`frames out of order: wanted ${next}, got ${i}`);
    next++;
    const hit = footageAt(project, i / fps);
    if (!hit) return { frame: null, matte: null };
    if (frames) {
      lastFrame = (await frames.next()) ?? lastFrame;
      if (!lastFrame) throw new Error(`ffmpeg couldn't decode the footage: ${dec!.lastError()}`);
    }
    if (mattes) lastMatte = (await mattes.next()) ?? lastMatte;
    return { frame: lastFrame, matte: ready.has(hit.clip.src) ? lastMatte : null };
  };

  try {
    const videoArgs = buildDecodeArgs(project, dir, 'video', hdr);
    const matteArgs = ready.size ? buildDecodeArgs(project, dir, 'matte', hdr, (src) => ready.has(src)) : null;
    // The sound is mixed and measured first, so the encoder can bring it to a standard loudness in one go.
    await finish(ffmpeg(buildMixArgs(project, dir, mix, hasAudio), false), 'mix the sound');
    const meter = ffmpeg(buildMeasureArgs(mix), false);
    await finish(meter, 'measure the sound');
    const measured = parseLoudness(meter.state.stderr);
    const gain = masterGain(measured);
    if (measured && gain) loudness = { from: measured.i, gain };
    const encoder = enc = ffmpeg(buildEncodeArgs(project, partial, mix, gain), true);
    dec = videoArgs ? ffmpeg(videoArgs, false) : null;
    mdec = matteArgs ? ffmpeg(matteArgs, false) : null;
    frames = dec && new FrameReader(dec.proc.stdout!, W * H * 4);
    mattes = mdec && new FrameReader(mdec.proc.stdout!, Math.round(W / 2) * Math.round(H / 2));
    const total = Math.ceil(duration(project) * fps);
    let done = 0;
    onProgress({ stage: 'frames', done, total });
    const result = await runHeadless({ kind: 'frames', project: name, from: 0, count: total }, async (buf) => {
      if (encoder.state.exited) throw new Error(`ffmpeg stopped: ${encoder.lastError()}`);
      if (!encoder.proc.stdin!.write(buf)) await Promise.race([once(encoder.proc.stdin!, 'drain'), encoder.exit]);
      if (++done % 15 === 0) onProgress({ stage: 'frames', done, total });
    }, media);
    if (result.fatal) throw new Error(result.fatal);
    if (done < total) throw new Error(`the render window stopped after ${done} of ${total} frames`);
    encoder.proc.stdin!.end();
    onProgress({ stage: 'encoding', done: total, total });
    const code = await encoder.exit;
    if (code !== 0) throw new Error(`ffmpeg failed: ${encoder.lastError()}`);
    renameSync(partial, out);
    ok = true;
    onProgress({ stage: 'done', done: total, total, out, errors: result.errors });
    return { out, errors: result.errors, mattes: !!mattes, loudness };
  } finally {
    await Promise.all([dec?.stop(), mdec?.stop()]);
    rmSync(mix, { force: true });
    if (!ok) { await enc?.stop(); rmSync(partial, { force: true }); }
  }
}

/** PNGs at the given times, drawn by the render window over the footage frame under each. */
export async function runSnapshot(root: string, name: string, times: number[], outPath?: string) {
  const { project, dir } = loadProject(root, name);
  const { w: W, h: H } = project.format;
  const ready = matteState(root, project, dir).ready();
  const media: MediaSource = async (i) => {
    const hit = footageAt(project, times[i]);
    if (!hit) return { frame: null, matte: null };
    const file = resolveInside(dir, hit.clip.src);
    if (!existsSync(file)) return { frame: null, matte: null };
    const { hdr } = await probe(file);
    const frame = await still(buildStillArgs(file, hit.srcTime, W, H, 'video', hdr), W * H * 4);
    const mfile = resolveInside(dir, matteSrc(hit.clip.src));
    const matte = ready.has(hit.clip.src) ? await still(buildStillArgs(mfile, hit.srcTime, W, H, 'matte', false), Math.round(W / 2) * Math.round(H / 2)) : null;
    return { frame, matte };
  };
  const result = await runHeadless({ kind: 'png', project: name, times }, undefined, media);
  if (result.fatal) throw new Error(result.fatal);
  mkdirSync(join(dir, 'out'), { recursive: true });
  const files: string[] = [];
  for (let i = 0; i < times.length; i++) {
    const dest = outPath && times.length === 1 ? outPath : join(dir, 'out', `snap-${times[i].toFixed(2)}.png`);
    writeFileSync(dest, Buffer.from(result.pngs![i]));
    files.push(dest);
  }
  return { files, errors: result.errors };
}

/** `vibe component snap`: checks a component's files and draws it alone, as a Studio tile does, at each time. */
export async function runComponentSnap(root: string, id: string, o: { at?: number[]; style?: string; mode?: Mode; dir?: Dir; props?: Record<string, unknown>; out?: string } = {}) {
  const rel = `library/components/${id}`, dir = resolveInside(root, rel);
  if (!existsSync(dir)) throw new Error(`no component "${id}" in library/components (\`vibe component new ${id}\` starts one)`);
  const jsFile = join(dir, 'component.js'), code = existsSync(jsFile) ? readFileSync(jsFile, 'utf8') : null;
  let meta: unknown, issues: Issue[];
  try {
    meta = JSON.parse(readFileSync(join(dir, 'component.json'), 'utf8'));
    issues = validateComponent(id, meta, code);
  } catch (e) {
    // Without its JSON only the code can be checked: the rest would be noise about a file that didn't parse.
    issues = [{ level: 'error', path: `${rel}/component.json`, message: (e as Error).message }, ...validateComponent(id, {}, code).filter((i) => i.path.endsWith('.js'))];
  }
  const dur = (meta as { duration?: unknown })?.duration;
  const times = o.at ?? snapTimes(typeof dur === 'number' && dur > 0 ? dur : 2);
  const style = o.style ?? (existsSync(resolveInside(root, 'library/styles/flat9k')) ? 'flat9k' : listLibrary(root).styles[0]);
  const result = await runHeadless({ kind: 'component', component: id, style, mode: o.mode ?? 'dark', dir: o.dir ?? 'ltr', props: o.props ?? {}, times, w: 1080, h: 1920 });
  if (result.fatal) throw new Error(result.fatal);
  const file = o.out ?? resolveInside(root, `.vibe/out/${id}.png`);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, Buffer.from(result.pngs![0]));
  return { file, times, issues, errors: result.errors };
}

export function registerExport(root: string) {
  // The app asks for mattes when the film uses a cutout effect; they're made in the background, one file at a time.
  ipcMain.handle('matte:ensure', async (e, name: string) => {
    try {
      const { project, dir } = loadProject(root, name);
      await ensureMattes(matteTools(), project, dir, (m) => { if (!e.sender.isDestroyed()) e.sender.send('matte:progress', { project: name, ...m }); });
      return {};
    } catch (err) { return { error: (err as Error).message }; }
  });
  ipcMain.handle('export:start', async (e, name: string) => {
    const send = (p: ExportProgress) => { if (!e.sender.isDestroyed()) e.sender.send('export:progress', p); };
    try { return (await runExport(root, name, send)).out; }
    catch (err) { send({ stage: 'error', done: 0, total: 1, message: (err as Error).message }); throw err; }
  });
}
