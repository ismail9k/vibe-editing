// Starting a film: the project, with the video you handed over already on its timeline and the frame shaped to it.
import { existsSync, rmSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { parseProject, projectDir, serializeProject, type Format } from '../core/model';
import { addAudio, addClip } from '../core/ops';
import { rotationOf } from './matte';
import { importable, importMedia, resolveInside, writeText } from './workspace';

/** The folder name a typed project name gets: lowercase Latin or Arabic letters and digits, joined by dashes. */
export const projectSlug = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-|-$/g, '') || 'untitled';

/** The frame for a video as it's seen (after its rotation): a phone take makes a 9:16 film, a camera take 16:9,
 *  and something near square a square one. Nothing to go on gives 9:16. */
export function formatFor(w: number, h: number, rotation = 0): Format {
  const [uw, uh] = Math.abs(rotation) % 180 === 90 ? [h, w] : [w, h];
  const ratio = uw > 0 && uh > 0 ? uw / uh : 0;
  if (ratio > 1.2) return { w: 1920, h: 1080, fps: 30 };
  if (ratio >= 0.85) return { w: 1080, h: 1080, fps: 30 };
  return { w: 1080, h: 1920, fps: 30 };
}

export interface StartedProject { project: string; media: string[] }

/** Makes projects/<slug>.vibe. With files, copies them into its media folder and puts them on the timeline: videos
 *  back to back on the footage track, sounds at the start. Named after the first file when no name is given.
 *  Nothing is left behind if a file can't be used. */
export async function startProject(root: string, name: string, paths: string[] = []): Promise<StartedProject> {
  for (const p of paths) if (!importable(p)) throw new Error(`not a video or audio file: ${basename(p)}`);
  const project = projectSlug(name.trim() || (paths[0] ? basename(paths[0], extname(paths[0])) : ''));
  const dir = resolveInside(root, projectDir(project));
  if (existsSync(dir)) throw new Error(`a project called ${project} already exists`);
  try {
    const media = await importMedia(root, project, paths);
    const firstVideo = media.find((m) => m.kind === 'video');
    const shape = firstVideo ? await rotationOf(resolveInside(root, `${projectDir(project)}/${firstVideo.src}`)).catch(() => null) : null;
    const format = shape ? formatFor(shape.w, shape.h, shape.rotation) : formatFor(0, 0);
    let film = parseProject(JSON.stringify({ name: project, format, style: 'flat9k', mode: 'dark', dir: 'ltr', tracks: { footage: [], graphics: [], captions: [], audio: [] } })).project!;
    for (const m of media) film = m.kind === 'video' ? addClip(film, m.src, m.duration) : addAudio(film, m.src, 0).project;
    writeText(root, `${projectDir(project)}/vibe.json`, serializeProject(film));
    return { project, media: media.map((m) => m.src) };
  } catch (e) {
    rmSync(dir, { recursive: true, force: true }); // ours alone: it didn't exist a moment ago
    throw e;
  }
}
