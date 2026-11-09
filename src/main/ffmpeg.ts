// The ffmpeg command for an export: footage trimmed and concatenated, the overlay (raw RGBA on stdin)
// composited on top, footage audio plus the sounds track mixed, H.264 + AAC out.
import { resolveInside } from './workspace';
import { duration, type Project } from '../core/model';

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

/** hasAudio: src → whether that media file has an audio stream; hdr: src → whether its video is HLG/PQ. */
export function buildFfmpegArgs(p: Project, projectDir: string, out: string, hasAudio: Record<string, boolean>, hdr: Record<string, boolean> = {}): string[] {
  const { w: W, h: H, fps: F } = p.format;
  const D = duration(p);
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  const graph: string[] = [];
  let input = 0;

  const clips = p.tracks.footage;
  clips.forEach((c) => { args.push('-ss', n(c.in), '-t', n(c.out - c.in), '-i', resolveInside(projectDir, c.src)); input++; });
  const overlayIn = input++;
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(F), '-i', 'pipe:0');
  const sounds = p.tracks.audio.map((a) => { args.push('-i', resolveInside(projectDir, a.src)); return { a, index: input++ }; });

  if (clips.length) {
    clips.forEach((c, i) => {
      graph.push(`[${i}:v]${fitFilter(W, H, !!hdr[c.src])},fps=${F},format=yuv420p[v${i}]`);
      graph.push(hasAudio[c.src]
        ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${n(c.out - c.in)}[a${i}]`);
    });
    graph.push(`${clips.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${clips.length}:v=1:a=1[base][basea]`);
  } else {
    graph.push(`color=c=black:s=${W}x${H}:r=${F}:d=${n(D)},format=yuv420p[base]`);
    graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${n(D)}[basea]`);
  }
  graph.push(`[base][${overlayIn}:v]overlay=format=auto:eof_action=pass,format=yuv420p[vout]`);

  const live = sounds.filter((s) => hasAudio[s.a.src]);
  live.forEach(({ a, index }, k) => {
    const ms = Math.round(a.at * 1000);
    graph.push(`[${index}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${n(a.gain)}[s${k}]`);
  });
  graph.push(live.length
    ? `[basea]${live.map((_, k) => `[s${k}]`).join('')}amix=inputs=${live.length + 1}:normalize=0:duration=first[aout]`
    : `[basea]anull[aout]`);

  args.push('-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '192k', '-t', n(D), '-movflags', '+faststart', out);
  return args;
}
