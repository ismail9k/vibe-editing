// The hidden render window: draws frames for the export and snapshots with the same renderer as the preview.
import { parseProject } from '../core/model';
import { renderFrame } from '../core/render';
import { loadLibrary } from './library';
import type { FrameMedia } from '../core/media';

/** Raw footage from main as canvases the painter can draw: the frame as-is, the grey matte as an alpha mask. */
function mediaMaker(W: number, H: number) {
  const frame = new OffscreenCanvas(W, H), fg = frame.getContext('2d')!;
  const mw = Math.round(W / 2), mh = Math.round(H / 2);
  const matte = new OffscreenCanvas(mw, mh), mg = matte.getContext('2d')!;
  const mid = new ImageData(mw, mh);
  return async (i: number): Promise<FrameMedia> => {
    const m = await window.vibe.headlessMedia(i);
    if (m.frame) fg.putImageData(new ImageData(new Uint8ClampedArray(m.frame.buffer as ArrayBuffer, m.frame.byteOffset, W * H * 4), W, H), 0, 0);
    if (m.matte) {
      const d = mid.data, g = m.matte;
      for (let k = 0, j = 0; k < g.length; k++, j += 4) { d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = g[k]; }
      mg.putImageData(mid, 0, 0);
    }
    return { frame: m.frame ? frame : null, matte: m.matte ? matte : null, matteIsAlpha: true };
  };
}

export async function runHeadless() {
  const job = await window.vibe.headlessJob();
  if (!job) return;
  const errors = new Set<string>();
  try {
    const lib = await loadLibrary(await window.vibe.info());
    for (const s of Object.values(lib.styles)) if (s.error) errors.add(s.error);
    for (const c of Object.values(lib.components)) if (c.error) errors.add(c.error);
    const { project, error } = parseProject((await window.vibe.read(`projects/${job.project}/vibe.json`)) ?? '');
    if (!project) throw new Error(error);
    const { w: W, h: H, fps } = project.format;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const media = mediaMaker(W, H);
    const draw = async (t: number, i: number) => renderFrame(ctx, project, lib, t, await media(i)).forEach((e) => errors.add(e));
    if (job.kind === 'frames') {
      for (let i = job.from; i < job.from + job.count; i++) {
        await draw(i / fps, i);
        await window.vibe.frameReady(ctx.getImageData(0, 0, W, H).data.buffer as ArrayBuffer);
      }
      await window.vibe.headlessDone({ errors: [...errors] });
    } else {
      const pngs: ArrayBuffer[] = [];
      for (let i = 0; i < job.times.length; i++) {
        await draw(job.times[i], i);
        const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), 'image/png'));
        pngs.push(await blob.arrayBuffer());
      }
      await window.vibe.headlessDone({ errors: [...errors], pngs });
    }
  } catch (e) {
    await window.vibe.headlessDone({ errors: [...errors], fatal: (e as Error).message });
  }
}
