// The ffmpeg commands for an export: a decoder that turns the footage track (and its cutout mattes) into raw
// frames for the render window, a mixer and a meter for the sound, and an encoder that takes the finished frames
// plus the mastered sound to H.264 + AAC.
import { resolveInside } from './workspace';
import { duration, matteSrc, type Project } from '../core/model';

const n = (v: number) => String(+v.toFixed(3));

/** Scale and crop a clip to fill W×H. HDR (iPhone HLG, PQ) is tone-mapped to SDR bt709 so the export
 *  matches what the preview shows; reinhard was the closest match to Chromium's own tone mapping. */
export function fitFilter(W: number, H: number, hdr: boolean): string {
  const fill = `${W}:${H}:force_original_aspect_ratio=increase`;
  const fit = hdr
    ? `scale=w=${W}:h=${H}:force_original_aspect_ratio=increase:out_transfer=linear:out_primaries=bt709,format=gbrpf32le,`
      + `tonemap=tonemap=reinhard:desat=0,scale=out_transfer=bt709:out_primaries=bt709:out_color_matrix=bt709:out_range=tv,format=yuv420p`
    : `scale=${fill}`;
  return `${fit},crop=${W}:${H},setsar=1`;
}

/** Decoder for the footage track: every clip trimmed, fitted to the frame and joined, as raw frames on stdout.
 *  'video' gives RGBA at W×H (HDR clips tone-mapped); 'matte' gives the clips' cutout mattes as grey at W/2×H/2.
 *  Null when there is no footage. */
export function buildDecodeArgs(p: Project, projectDir: string, kind: 'video' | 'matte', hdr: Record<string, boolean>, ready: (src: string) => boolean = () => true): string[] | null {
  const clips = p.tracks.footage;
  if (!clips.length) return null;
  const { w, h, fps: F } = p.format;
  const [W, H] = kind === 'video' ? [w, h] : [Math.round(w / 2), Math.round(h / 2)];
  const args = ['-hide_banner', '-loglevel', 'error'];
  const graph: string[] = [];
  // Frame i is the timeline at i/F, the instant the renderer draws. Each clip gets exactly the frames whose
  // instants fall inside it, starting from its first such instant: a clip trimmed with -t alone runs up to a
  // source frame long, and over many cuts the picture drifts away from the sound (which is cut exactly).
  let start = 0;
  const parts: string[] = [];
  for (const c of clips) {
    const end = start + (c.out - c.in);
    const first = Math.ceil(start * F - 1e-6), frames = Math.ceil(end * F - 1e-6) - first;
    const at = c.in + (first / F - start);
    start = end;
    if (frames <= 0) continue;
    const i = parts.length;
    if (kind === 'video' || ready(c.src)) {
      const src = kind === 'video' ? c.src : matteSrc(c.src);
      args.push('-ss', n(at), '-t', n(frames / F + 2 / F), '-i', resolveInside(projectDir, src));
    } else {
      // No matte for this clip yet: a blank keeps the frames in step (the export ignores it for this clip).
      args.push('-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${F}:d=${n(frames / F + 2 / F)}`);
    }
    const fit = kind === 'video' ? fitFilter(W, H, !!hdr[c.src]) : fitFilter(W, H, false);
    // A clip that runs past its file's end holds the last frame for the rest of its count.
    graph.push(`[${i}:v]${fit},setpts=PTS-STARTPTS,fps=${F}:start_time=0:round=up,tpad=stop_mode=clone:stop=${frames},`
      + `trim=end_frame=${frames},setpts=N/${F}/TB,format=${kind === 'video' ? 'rgba' : 'gray'}[v${i}]`);
    parts.push(`[v${i}]`);
  }
  if (!parts.length) return null;
  graph.push(`${parts.join('')}concat=n=${parts.length}:v=1:a=0[out]`);
  args.push('-filter_complex', graph.join(';'), '-map', '[out]', '-f', 'rawvideo', '-pix_fmt', kind === 'video' ? 'rgba' : 'gray', 'pipe:1');
  return args;
}

/** One frame of a file at a source time (snapshots): RGBA at W×H, or a grey matte at W/2×H/2, on stdout. */
export function buildStillArgs(file: string, at: number, W: number, H: number, kind: 'video' | 'matte', hdr: boolean): string[] {
  const [w, h] = kind === 'video' ? [W, H] : [Math.round(W / 2), Math.round(H / 2)];
  const pix = kind === 'video' ? 'rgba' : 'gray';
  return ['-hide_banner', '-loglevel', 'error', '-ss', n(at), '-i', file,
    '-vf', `${fitFilter(w, h, kind === 'video' && hdr)},format=${pix}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', pix, 'pipe:1'];
}

/** The film's sound on its own: the clips' sound joined in order and the sounds track mixed in, as a WAV exactly as
 *  long as the film. 32-bit float, so a mix that goes over full scale isn't clipped before mastering turns it down.
 *  hasAudio: src → whether that file has an audio stream. */
export function buildMixArgs(p: Project, projectDir: string, out: string, hasAudio: Record<string, boolean>): string[] {
  const D = duration(p);
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  const graph: string[] = [];
  let input = 0;
  const clips = p.tracks.footage.map((c) => {
    if (!hasAudio[c.src]) return { c, index: -1 };
    args.push('-vn', '-ss', n(c.in), '-t', n(c.out - c.in), '-i', resolveInside(projectDir, c.src));
    return { c, index: input++ };
  });
  const sounds = p.tracks.audio.map((a) => { args.push('-i', resolveInside(projectDir, a.src)); return { a, index: input++ }; });

  if (clips.length) {
    clips.forEach(({ c, index }, i) => graph.push(index >= 0
      ? `[${index}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=${n(c.out - c.in)}[a${i}]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${n(c.out - c.in)}[a${i}]`));
    graph.push(`${clips.map((_, i) => `[a${i}]`).join('')}concat=n=${clips.length}:v=0:a=1[basea]`);
  } else {
    graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${n(D)}[basea]`);
  }
  const live = sounds.filter((s) => hasAudio[s.a.src]);
  live.forEach(({ a, index }, k) => {
    const ms = Math.round(a.at * 1000);
    graph.push(`[${index}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${n(a.gain)}[s${k}]`);
  });
  // Padded and cut to the film's length: the footage can end before the last caption.
  graph.push(live.length
    ? `[basea]${live.map((_, k) => `[s${k}]`).join('')}amix=inputs=${live.length + 1}:normalize=0:duration=first,apad[aout]`
    : `[basea]apad[aout]`);
  args.push('-filter_complex', graph.join(';'), '-map', '[aout]', '-t', n(D), '-c:a', 'pcm_f32le', '-f', 'wav', out);
  return args;
}

/** Where mastering takes the sound: the level feeds play shorts at, with peaks kept under full scale so the AAC
 *  encode doesn't clip. A mix quieter than `silent` is room tone or nothing, and is left alone rather than pumped
 *  up; `maxBoost` stops a very quiet narration from bringing its noise floor up with it. */
export const LOUDNESS = { target: -14, ceiling: -1.5, maxBoost: 20, silent: -50 };

/** First mastering pass: measures the mix's integrated loudness and true peak (printed as JSON on stderr). */
export function buildMeasureArgs(wav: string): string[] {
  return ['-hide_banner', '-nostats', '-i', wav, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'];
}

export interface Loudness { i: number; tp: number }

/** The measurement from the first pass's stderr, or null when ffmpeg printed none. -inf (a silent mix) stays -inf. */
export function parseLoudness(stderr: string): Loudness | null {
  const at = stderr.lastIndexOf('"input_i"');
  if (at < 0) return null;
  const json = stderr.slice(stderr.lastIndexOf('{', at), stderr.indexOf('}', at) + 1);
  try {
    const j = JSON.parse(json) as Record<string, string>;
    const db = (v: string) => (/^-inf/.test(v) ? -Infinity : parseFloat(v));
    return { i: db(j.input_i), tp: db(j.input_tp) };
  } catch { return null; }
}

/** The gain in dB that brings a measured mix to the target. A constant gain rather than loudnorm's own levelling,
 *  which rides the volume up and down and audibly pumps under music and sound effects. */
export function masterGain(m: Loudness | null): number {
  if (!m || !Number.isFinite(m.i) || m.i < LOUDNESS.silent) return 0;
  return Math.min(LOUDNESS.target - m.i, LOUDNESS.maxBoost);
}

/** Second mastering pass: the gain, then a limiter that catches the peaks the gain pushed past the ceiling. It runs
 *  at 4× the sample rate so it also catches peaks between samples, and compensates its own delay so the sound stays
 *  on the picture. */
export function masterFilter(gainDb: number): string {
  const limit = n(10 ** (LOUDNESS.ceiling / 20));
  return `volume=${n(gainDb)}dB,aresample=192000,alimiter=limit=${limit}:attack=5:release=50:level=false:latency=1,aresample=48000`;
}

/** Encoder: the finished frames (raw RGBA on stdin) plus the mixed sound (buildMixArgs), mastered, to H.264 + AAC. */
export function buildEncodeArgs(p: Project, out: string, mix: string, gainDb: number): string[] {
  const { w: W, h: H, fps: F } = p.format;
  const D = duration(p);
  return ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(F), '-i', 'pipe:0',
    '-i', mix, '-filter_complex', `[0:v]format=yuv420p[vout];[1:a]${masterFilter(gainDb)}[aout]`, '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '192k', '-t', n(D), '-movflags', '+faststart', out];
}

/** Clips whose out point is past the end of their media (durations from ffprobe). Such a clip would come out
 *  short and pull every later clip, caption and sound out of sync, so export refuses it. */
export function clipOverruns(p: Project, durations: Record<string, number>): string[] {
  return p.tracks.footage
    .filter((c) => durations[c.src] !== undefined && c.out > durations[c.src] + 0.05)
    .map((c) => `${c.id} ends at ${n(c.out)} s but ${c.src} is only ${n(durations[c.src])} s long`);
}
