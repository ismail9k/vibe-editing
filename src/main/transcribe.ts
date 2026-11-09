// Transcripts for `vibe transcribe`: whisper.cpp's word timings for each footage file, kept at
// media/.transcript/<file>.json and trusted while the file, model and language stay the same. The model is
// one already on the machine or one downloaded once into the app's own data folder, never the workspace.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Project } from '../core/model';
import { cleanWords, parseWhisperWords, phrases, snapToSpeech, wordsOnTimeline, type SourceWord, type TimelineWord } from '../core/transcript';
import { resolveInside } from './workspace';

/** Multilingual and fast; good enough for Arabic and English talking heads. About 1.6 GB, downloaded once. */
export const DEFAULT_MODEL = 'large-v3-turbo';
const KNOWN = ['large-v3-turbo', 'large-v3', 'large-v2', 'medium', 'small', 'base', 'tiny'];

/** Folders that may already hold whisper.cpp models: the app's own first, then other tools' caches. */
export const modelDirs = (userData: string) => [
  join(userData, 'models'),
  join(homedir(), '.cache/whisper.cpp'),
  join(homedir(), '.cache/whisper'),
  join(homedir(), '.cache/hyperframes/whisper/models'),
  '/opt/homebrew/share/whisper-cpp/models',
];

/** The model file to use: a path as given, a known name found in `dirs`, or (with no choice) the best
 *  multilingual model already present. Null when it has to be downloaded. */
export function findModel(choice: string | undefined, dirs: string[]): string | null {
  if (choice && (choice.includes('/') || choice.endsWith('.bin'))) {
    if (!existsSync(choice)) throw new Error(`no whisper model at ${choice}`);
    return choice;
  }
  for (const name of choice ? [choice] : KNOWN) {
    for (const d of dirs) {
      const f = join(d, `ggml-${name}.bin`);
      if (existsSync(f)) return f;
    }
  }
  return null;
}

export const modelUrl = (name: string) =>
  KNOWN.includes(name) ? `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin` : null;

/** Download a known model into `dir`, through a partial file so a broken download is never used. */
export async function downloadModel(name: string, dir: string, progress: (done: number, total: number) => void): Promise<string> {
  const url = modelUrl(name);
  if (!url) throw new Error(`unknown whisper model "${name}" (one of: ${KNOWN.join(', ')}), or pass a path to a ggml .bin`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `ggml-${name}.bin`), partial = `${file}.partial`;
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`downloading the ${name} model failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let done = 0;
  const body = Readable.fromWeb(res.body as never);
  body.on('data', (chunk: Buffer) => { done += chunk.length; progress(done, total); });
  try { await pipeline(body, createWriteStream(partial)); } catch (e) { rmSync(partial, { force: true }); throw e; }
  renameSync(partial, file);
  return file;
}

export const transcriptPath = (projectDir: string, src: string) => {
  const i = src.lastIndexOf('/');
  return resolveInside(projectDir, `${i >= 0 ? src.slice(0, i + 1) : ''}.transcript/${src.slice(i + 1)}.json`);
};

const stamp = (projectDir: string, src: string) => {
  const st = statSync(resolveInside(projectDir, src));
  return { size: st.size, mtimeMs: st.mtimeMs };
};

/** The cached words for a file, or null when there are none for this very file, model and language. */
export function cachedWords(projectDir: string, src: string, model: string, lang: string): SourceWord[] | null {
  try {
    const c = JSON.parse(readFileSync(transcriptPath(projectDir, src), 'utf8'));
    const s = stamp(projectDir, src);
    return c.size === s.size && c.mtimeMs === s.mtimeMs && c.model === model && c.lang === lang && Array.isArray(c.silences) && Array.isArray(c.words) ? cleanWords(c.words) : null;
  } catch { return null; }
}

/** Pauses from ffmpeg's silencedetect log, in seconds; one still open at the end closes at `total`. */
export function parseSilences(log: string, total: number): [number, number][] {
  const out: [number, number][] = [];
  let open: number | null = null;
  for (const m of log.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    const v = Math.round(Math.max(0, Number(m[2])) * 1000) / 1000;
    if (m[1] === 'start') open = v;
    else if (open !== null) { out.push([open, v]); open = null; }
  }
  if (open !== null) out.push([open, total]);
  return out;
}

/** Pauses quieter than -35 dB for a quarter second: the gaps between words, not the soft ends of them. */
const SILENCE = 'silencedetect=n=-35dB:d=0.25';

export function whisperArgs(model: string, wav: string, outBase: string, lang: string): string[] {
  return ['-m', model, '-f', wav, '-of', outBase, '-l', lang, '-ml', '1', '-sow', '-oj', '-np', '-pp'];
}

function run(cmd: string, args: string[], onErr?: (line: string) => void): Promise<string> {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let log = '';
    child.stderr.on('data', (b: Buffer) => {
      const s = b.toString();
      log += s;
      s.split('\n').forEach((l) => onErr?.(l));
    });
    const tail = () => log.slice(-2000);
    child.on('error', (e: NodeJS.ErrnoException) => fail(e.code === 'ENOENT'
      ? new Error(cmd === 'whisper-cli' ? 'whisper-cli is not on PATH. Install it with: brew install whisper-cpp' : `${cmd} is not on PATH`)
      : e));
    child.on('exit', (code) => (code === 0 ? ok(log) : fail(new Error(`${cmd} exited with ${code}: ${tail().trim().split('\n').slice(-3).join(' | ')}`))));
  });
}

/** Transcribe one footage file (the whole file, in source seconds) and cache the words. */
export async function transcribeFile(projectDir: string, src: string, model: string, lang: string, progress: (pct: number) => void): Promise<SourceWord[]> {
  const label = basename(model).replace(/^ggml-|\.bin$/g, '');
  const cached = cachedWords(projectDir, src, label, lang);
  if (cached) { progress(100); return cached; }
  const tmp = mkdtempSync(join(tmpdir(), 'vibe-transcribe-'));
  try {
    const wav = join(tmp, 'audio.wav'), outBase = join(tmp, 'words');
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', resolveInside(projectDir, src), '-vn', '-ar', '16000', '-ac', '1', wav]);
    await run('whisper-cli', whisperArgs(model, wav, outBase, lang), (l) => {
      const m = /progress\s*=\s*(\d+)%/.exec(l);
      if (m) progress(Number(m[1]));
    });
    const pauses = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', SILENCE, '-f', 'null', '-']);
    const heard = parseWhisperWords(JSON.parse(readFileSync(`${outBase}.json`, 'utf8')));
    // A pause still open at the end runs to the end of the speech; that's all the snapping needs.
    const silences = parseSilences(pauses, heard.reduce((m, w) => Math.max(m, w.end), 0));
    const words = snapToSpeech(heard, silences);
    const file = transcriptPath(projectDir, src);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ src, ...stamp(projectDir, src), model: label, lang, silences, words }, null, 1) + '\n');
    return words;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export interface TranscribeOptions { model?: string; lang?: string; force?: boolean; userData: string }
export type TranscribeProgress =
  | { stage: 'download'; model: string; done: number; total: number }
  | { stage: 'transcribe'; src: string; pct: number };

/** Transcribe every footage file of a project and write projects/<p>.vibe/transcript.json: the words the cut keeps,
 *  on the output timeline, and the same words as short timed lines. */
export async function transcribeProject(projectDir: string, project: Project, o: TranscribeOptions,
  progress: (p: TranscribeProgress) => void): Promise<{ words: TimelineWord[]; file: string }> {
  const lang = o.lang || 'auto';
  let model = findModel(o.model, modelDirs(o.userData));
  if (!model) {
    const name = o.model || DEFAULT_MODEL;
    model = await downloadModel(name, join(o.userData, 'models'), (done, total) => progress({ stage: 'download', model: name, done, total }));
  }
  const bySrc: Record<string, SourceWord[]> = {};
  for (const src of [...new Set(project.tracks.footage.map((c) => c.src))]) {
    if (o.force) rmSync(transcriptPath(projectDir, src), { force: true });
    bySrc[src] = await transcribeFile(projectDir, src, model, lang, (pct) => progress({ stage: 'transcribe', src, pct }));
  }
  const words = wordsOnTimeline(project, bySrc);
  const file = join(projectDir, 'transcript.json');
  writeFileSync(file, JSON.stringify({ phrases: phrases(words), words }, null, 1) + '\n');
  return { words, file };
}
