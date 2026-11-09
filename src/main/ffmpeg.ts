// The ffmpeg command for an export: footage trimmed and concatenated, the overlay (raw RGBA on stdin)
// composited on top, footage audio plus the sounds track mixed, H.264 + AAC out.
import { join } from 'node:path';
import { duration, type Project } from '../core/model';

const n = (v: number) => String(+v.toFixed(3));

/** hasAudio: src → whether that media file has an audio stream. */
export function buildFfmpegArgs(p: Project, projectDir: string, out: string, hasAudio: Record<string, boolean>): string[] {
  const { w: W, h: H, fps: F } = p.format;
  const D = duration(p);
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  const graph: string[] = [];
  let input = 0;

  const clips = p.tracks.footage;
  clips.forEach((c) => { args.push('-ss', n(c.in), '-t', n(c.out - c.in), '-i', join(projectDir, c.src)); input++; });
  const overlayIn = input++;
  args.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(F), '-i', 'pipe:0');
  const sounds = p.tracks.audio.map((a) => { args.push('-i', join(projectDir, a.src)); return { a, index: input++ }; });

  if (clips.length) {
    clips.forEach((c, i) => {
      graph.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${F},format=yuv420p[v${i}]`);
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
