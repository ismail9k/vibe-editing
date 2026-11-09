// Export (MP4) and snapshots (PNG), shared by the app's Export button and the vibe CLI.
import { ipcMain } from 'electron';
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { duration, footageAt, parseProject, type Project } from '../core/model';
import { buildFfmpegArgs, clipOverruns, fitFilter } from './ffmpeg';
import { runHeadless } from './headless';
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

export async function runExport(root: string, name: string, onProgress: (p: ExportProgress) => void, outPath?: string) {
  const { project, dir } = loadProject(root, name);
  checkMedia(project, dir);
  const srcs = [...new Set([...project.tracks.footage, ...project.tracks.audio].map((x) => x.src))];
  const hasAudio: Record<string, boolean> = {}, hdr: Record<string, boolean> = {}, lengths: Record<string, number> = {};
  for (const s of srcs) { const info = await probe(resolveInside(dir, s)); hasAudio[s] = info.hasAudio; hdr[s] = info.hdr; lengths[s] = info.duration; }
  const overruns = clipOverruns(project, lengths);
  if (overruns.length) throw new Error(`can't export: ${overruns.join('; ')}`);
  const out = outPath ?? join(dir, 'out', `${name}.mp4`);
  mkdirSync(join(out, '..'), { recursive: true });

  // Encode next to the target and rename at the end: a failed export never replaces the last good file.
  const partial = out.replace(/\.mp4$/i, '') + '.partial.mp4';
  const ff = spawn('ffmpeg', buildFfmpegArgs(project, dir, partial, hasAudio, hdr), { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '', exited = false, ok = false;
  ff.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
  ff.stdin.on('error', () => {}); // EPIPE when ffmpeg stops early: reported through the exit code
  const exit = new Promise<number>((r) => {
    ff.on('error', (e) => { stderr += `\n${e.message}`; exited = true; r(1); }); // e.g. ffmpeg not installed
    ff.on('close', (code) => { exited = true; r(code ?? 1); });
  });

  try {
    const total = Math.ceil(duration(project) * project.format.fps);
    let done = 0;
    onProgress({ stage: 'frames', done, total });
    const result = await runHeadless({ kind: 'frames', project: name, from: 0, count: total }, async (buf) => {
      if (exited) throw new Error(`ffmpeg stopped: ${stderr.trim().split('\n').pop()}`);
      if (!ff.stdin.write(buf)) await Promise.race([once(ff.stdin, 'drain'), exit]);
      if (++done % 15 === 0) onProgress({ stage: 'frames', done, total });
    });
    if (result.fatal) throw new Error(result.fatal);
    if (done < total) throw new Error(`the render window stopped after ${done} of ${total} frames`);
    ff.stdin.end();
    onProgress({ stage: 'encoding', done: total, total });
    const code = await exit;
    if (code !== 0) throw new Error(`ffmpeg failed: ${stderr.trim().split('\n').slice(-3).join(' ')}`);
    renameSync(partial, out);
    ok = true;
    onProgress({ stage: 'done', done: total, total, out });
    return { out, errors: result.errors };
  } finally {
    if (!ok) {
      if (!exited) ff.kill('SIGKILL');
      await exit;
      rmSync(partial, { force: true });
    }
  }
}

/** PNGs at the given times: the overlay over the footage frame under it. */
export async function runSnapshot(root: string, name: string, times: number[], outPath?: string) {
  const { project, dir } = loadProject(root, name);
  const result = await runHeadless({ kind: 'png', project: name, times });
  if (result.fatal) throw new Error(result.fatal);
  const { w: W, h: H } = project.format;
  mkdirSync(join(dir, 'out'), { recursive: true });
  const files: string[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const dest = outPath && times.length === 1 ? outPath : join(dir, 'out', `snap-${t.toFixed(2)}.png`);
    const png = Buffer.from(result.pngs![i]);
    const hit = footageAt(project, t);
    if (!hit || !existsSync(resolveInside(dir, hit.clip.src))) { writeFileSync(dest, png); files.push(dest); continue; }
    const { hdr } = await probe(resolveInside(dir, hit.clip.src));
    const tmp = join(tmpdir(), `vibe-overlay-${process.pid}-${i}.png`);
    writeFileSync(tmp, png);
    await new Promise<void>((ok, fail) => execFile('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(hit.srcTime), "-i", resolveInside(dir, hit.clip.src), '-i', tmp,
      '-filter_complex', `[0:v]${fitFilter(W, H, hdr)}[b];[b][1:v]overlay`, '-frames:v', '1', dest],
      (err, _o, se) => (err ? fail(new Error(`ffmpeg: ${se || err.message}`)) : ok())));
    rmSync(tmp, { force: true });
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
