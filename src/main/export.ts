// Export (MP4) and snapshots (PNG), shared by the app's Export button and the vibe CLI.
import { ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { duration, footageAt, matteSrc, parseProject, type Project } from '../core/model';
import { buildDecodeArgs, buildEncodeArgs, buildStillArgs, clipOverruns } from './ffmpeg';
import { FrameReader } from './frames';
import { runHeadless, type MediaSource } from './headless';
import { probe, resolveInside } from './workspace';
import type { ExportProgress } from '../shared/api';

export function loadProject(root: string, name: string): { project: Project; dir: string } {
  const dir = resolveInside(root, `projects/${name}`);
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

/** True when every footage clip has its cutout matte on disk. */
export function mattesReady(project: Project, dir: string): boolean {
  return project.tracks.footage.length > 0 && project.tracks.footage.every((c) => existsSync(resolveInside(dir, matteSrc(c.src))));
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

  // Footage (and its cutout mattes) decoded to raw frames; the render window draws every frame over them; the encoder
  // takes the finished frames plus the sound. Encode next to the target and rename at the end: a failed export
  // never replaces the last good file.
  const partial = out.replace(/\.mp4$/i, '') + '.partial.mp4';
  const enc = ffmpeg(buildEncodeArgs(project, dir, partial, hasAudio), true);
  const videoArgs = buildDecodeArgs(project, dir, 'video', hdr);
  const matteArgs = mattesReady(project, dir) ? buildDecodeArgs(project, dir, 'matte', hdr) : null;
  const dec = videoArgs ? ffmpeg(videoArgs, false) : null;
  const mdec = matteArgs ? ffmpeg(matteArgs, false) : null;
  const frames = dec && new FrameReader(dec.proc.stdout!, W * H * 4);
  const mattes = mdec && new FrameReader(mdec.proc.stdout!, Math.round(W / 2) * Math.round(H / 2));
  let ok = false;

  // Frames are asked for in order; past the end of a decoder (a rounding frame short) the last one holds.
  let next = 0, lastFrame: Buffer | null = null, lastMatte: Buffer | null = null;
  const media: MediaSource = async (i) => {
    if (i !== next) throw new Error(`frames out of order: wanted ${next}, got ${i}`);
    next++;
    if (!footageAt(project, i / fps)) return { frame: null, matte: null };
    if (frames) {
      lastFrame = (await frames.next()) ?? lastFrame;
      if (!lastFrame) throw new Error(`ffmpeg couldn't decode the footage: ${dec!.lastError()}`);
    }
    if (mattes) lastMatte = (await mattes.next()) ?? lastMatte;
    return { frame: lastFrame, matte: lastMatte };
  };

  try {
    const total = Math.ceil(duration(project) * fps);
    let done = 0;
    onProgress({ stage: 'frames', done, total });
    const result = await runHeadless({ kind: 'frames', project: name, from: 0, count: total }, async (buf) => {
      if (enc.state.exited) throw new Error(`ffmpeg stopped: ${enc.lastError()}`);
      if (!enc.proc.stdin!.write(buf)) await Promise.race([once(enc.proc.stdin!, 'drain'), enc.exit]);
      if (++done % 15 === 0) onProgress({ stage: 'frames', done, total });
    }, media);
    if (result.fatal) throw new Error(result.fatal);
    if (done < total) throw new Error(`the render window stopped after ${done} of ${total} frames`);
    enc.proc.stdin!.end();
    onProgress({ stage: 'encoding', done: total, total });
    const code = await enc.exit;
    if (code !== 0) throw new Error(`ffmpeg failed: ${enc.lastError()}`);
    renameSync(partial, out);
    ok = true;
    onProgress({ stage: 'done', done: total, total, out });
    return { out, errors: result.errors, mattes: !!mattes };
  } finally {
    await Promise.all([dec?.stop(), mdec?.stop()]);
    if (!ok) { await enc.stop(); rmSync(partial, { force: true }); }
  }
}

/** PNGs at the given times, drawn by the render window over the footage frame under each. */
export async function runSnapshot(root: string, name: string, times: number[], outPath?: string) {
  const { project, dir } = loadProject(root, name);
  const { w: W, h: H } = project.format;
  const media: MediaSource = async (i) => {
    const hit = footageAt(project, times[i]);
    if (!hit) return { frame: null, matte: null };
    const file = resolveInside(dir, hit.clip.src);
    if (!existsSync(file)) return { frame: null, matte: null };
    const { hdr } = await probe(file);
    const frame = await still(buildStillArgs(file, hit.srcTime, W, H, 'video', hdr), W * H * 4);
    const mfile = resolveInside(dir, matteSrc(hit.clip.src));
    const matte = existsSync(mfile) ? await still(buildStillArgs(mfile, hit.srcTime, W, H, 'matte', false), Math.round(W / 2) * Math.round(H / 2)) : null;
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

export function registerExport(root: string) {
  ipcMain.handle('export:start', async (e, name: string) => {
    const send = (p: ExportProgress) => { if (!e.sender.isDestroyed()) e.sender.send('export:progress', p); };
    try { return (await runExport(root, name, send)).out; }
    catch (err) { send({ stage: 'error', done: 0, total: 1, message: (err as Error).message }); throw err; }
  });
}
