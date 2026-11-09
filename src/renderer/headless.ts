// The hidden render window: draws frames for the export and snapshots with the same renderer as the preview.
import { parseProject } from '../core/model';
import { renderFrame } from '../core/render';
import { loadLibrary } from './library';

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
    const draw = (t: number) => renderFrame(ctx, project, lib, t).forEach((e) => errors.add(e));
    if (job.kind === 'frames') {
      for (let i = job.from; i < job.from + job.count; i++) {
        draw(i / fps);
        await window.vibe.frameReady(ctx.getImageData(0, 0, W, H).data.buffer as ArrayBuffer);
      }
      await window.vibe.headlessDone({ errors: [...errors] });
    } else {
      const pngs: ArrayBuffer[] = [];
      for (const t of job.times) {
        draw(t);
        const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), 'image/png'));
        pngs.push(await blob.arrayBuffer());
      }
      await window.vibe.headlessDone({ errors: [...errors], pngs });
    }
  } catch (e) {
    await window.vibe.headlessDone({ errors: [...errors], fatal: (e as Error).message });
  }
}
