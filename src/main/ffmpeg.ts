// The ffmpeg commands for an export: a decoder that turns the footage track (and its cutout mattes) into raw
// frames for the render window, and an encoder that takes the finished frames plus the sound to H.264 + AAC.
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
export function buildDecodeArgs(p: Project, projectDir: string, kind: 'video' | 'matte', hdr: Record<string, boolean>): string[] | null {
  const clips = p.tracks.footage;
  if (!clips.length) return null;
  const { w, h, fps: F } = p.format;
  const [W, H] = kind === 'video' ? [w, h] : [Math.round(w / 2), Math.round(h / 2)];
  const args = ['-hide_banner', '-loglevel', 'error'];
  const graph: string[] = [];
  clips.forEach((c, i) => {
    const src = kind === 'video' ? c.src : matteSrc(c.src);
    args.push('-ss', n(c.in), '-t', n(c.out - c.in), '-i', resolveInside(projectDir, src));
    const fit = kind === 'video' ? fitFilter(W, H, !!hdr[c.src]) : fitFilter(W, H, false);
    graph.push(`[${i}:v]${fit},fps=${F},format=${kind === 'video' ? 'rgba' : 'gray'}[v${i}]`);
  });
  graph.push(`${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[out]`);
  args.push('-filter_complex', graph.join(';'), '-map', '[out]', '-f', 'rawvideo', '-pix_fmt', kind === 'video' ? 'rgba' : 'gray', 'pipe:1');
  return args;
}

/** Encoder: the finished frames (raw RGBA on stdin) plus the clips' sound joined in order and the sounds track mixed
 *  in, to H.264 + AAC. hasAudio: src → whether that file has an audio stream. */
export function buildEncodeArgs(p: Project, projectDir: string, out: string, hasAudio: Record<string, boolean>): string[] {
  const { w: W, h: H, fps: F } = p.format;
  const D = duration(p);
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(F), '-i', 'pipe:0'];
  const graph: string[] = [];
  let input = 1;
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
  graph.push(live.length
    ? `[basea]${live.map((_, k) => `[s${k}]`).join('')}amix=inputs=${live.length + 1}:normalize=0:duration=first[aout]`
    : `[basea]anull[aout]`);
  graph.push('[0:v]format=yuv420p[vout]');

  args.push('-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '192k', '-t', n(D), '-movflags', '+faststart', out);
  return args;
}

/** Clips whose out point is past the end of their media (durations from ffprobe). Such a clip would come out
 *  short and pull every later clip, caption and sound out of sync, so export refuses it. */
export function clipOverruns(p: Project, durations: Record<string, number>): string[] {
  return p.tracks.footage
    .filter((c) => durations[c.src] !== undefined && c.out > durations[c.src] + 0.05)
    .map((c) => `${c.id} ends at ${n(c.out)} s but ${c.src} is only ${n(durations[c.src])} s long`);
}
