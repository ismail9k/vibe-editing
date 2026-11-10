// The hidden render window: draws frames for the export and snapshots with the same renderer as the preview.
import { parseProject, projectDir } from '../core/model';
import { renderFrame, tileProject, type Library } from '../core/render';
import { loadLibrary } from './library';
import type { FrameMedia } from '../core/media';
import type { ComponentJob, HeadlessResult } from '../shared/api';

const png = async (canvas: HTMLCanvasElement) => (await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), 'image/png'))).arrayBuffer();

/** A component drawn alone at each time, side by side with the time under each frame (one time: the full frame).
 *  Errors carry the first time they happened, so a component that breaks mid-way says where. */
async function componentSheet(lib: Library, job: ComponentJob): Promise<HeadlessResult> {
  const comp = lib.components[job.component], style = lib.styles[job.style];
  if (!comp) return { errors: [], fatal: `no component "${job.component}" in library/components` };
  if (!style) return { errors: [], fatal: `no style "${job.style}" (have: ${Object.keys(lib.styles).join(', ')})` };
  const errors = new Map<string, number>();
  for (const e of [style.error, comp.error]) if (e) errors.set(e, -1);
  const project = tileProject(lib, job.style, job.mode, job.dir, job.component, job.props, job.w, job.h);
  const frame = document.createElement('canvas');
  frame.width = job.w; frame.height = job.h;
  const ctx = frame.getContext('2d')!;
  const one = job.times.length === 1, scale = one ? 1 : 1 / 3, gap = one ? 0 : 16, label = one ? 0 : 40;
  const tw = Math.round(job.w * scale), th = Math.round(job.h * scale);
  const cols = Math.min(job.times.length, 6), rows = Math.ceil(job.times.length / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * tw + (cols + 1) * gap;
  sheet.height = rows * (th + label) + (rows + 1) * gap;
  const sc = sheet.getContext('2d')!;
  sc.fillStyle = '#262626';
  sc.fillRect(0, 0, sheet.width, sheet.height);
  job.times.forEach((t, i) => {
    for (const e of renderFrame(ctx, project, lib, t)) if (!errors.has(e)) errors.set(e, t);
    const x = gap + (i % cols) * (tw + gap), y = gap + Math.floor(i / cols) * (th + label + gap);
    sc.drawImage(frame, x, y, tw, th);
    if (!one) {
      sc.fillStyle = '#d8d8d8';
      sc.font = '600 24px "IBM Plex Mono"';
      sc.fillText(`${t.toFixed(2)} s`, x, y + th + 30);
    }
  });
  return { errors: [...errors].map(([e, t]) => (t < 0 ? e : `at ${t.toFixed(2)} s: ${e}`)), pngs: [await png(sheet)] };
}

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
    if (job.kind === 'component') { await window.vibe.headlessDone(await componentSheet(lib, job)); return; }
    for (const s of Object.values(lib.styles)) if (s.error) errors.add(s.error);
    for (const c of Object.values(lib.components)) if (c.error) errors.add(c.error);
    const { project, error } = parseProject((await window.vibe.read(`${projectDir(job.project)}/vibe.json`)) ?? '');
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
        pngs.push(await png(canvas));
      }
      await window.vibe.headlessDone({ errors: [...errors], pngs });
    }
  } catch (e) {
    await window.vibe.headlessDone({ errors: [...errors], fatal: (e as Error).message });
  }
}
