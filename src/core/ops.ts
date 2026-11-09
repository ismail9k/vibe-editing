// Pure edit operations. Each returns a new Project; the input is never mutated (undo keeps old ones).
import { footageAt, type Project, type TimedTrack, type TrackName, type Clip } from './model';

const MIN = 0.1;
const clone = (p: Project): Project => structuredClone(p);

export function newId(p: Project, prefix: string): string {
  const ids = new Set(Object.values(p.tracks).flat().map((x) => x.id));
  let n = 1;
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function addGraphic(p: Project, type: string, at: number, dur: number, props: Record<string, unknown>) {
  const project = clone(p), id = newId(p, 'g');
  project.tracks.graphics.push({ id, type, at, dur, props: structuredClone(props) });
  return { project, id };
}

export function addCaption(p: Project, text: string, at: number, dur: number) {
  const project = clone(p), id = newId(p, 'c');
  project.tracks.captions.push({ id, text, at, dur });
  return { project, id };
}

export function addAudio(p: Project, src: string, at: number) {
  const project = clone(p), id = newId(p, 'a');
  project.tracks.audio.push({ id, src, at, gain: 1 });
  return { project, id };
}

export function updateItem(p: Project, track: TrackName, id: string, patch: Record<string, unknown>): Project {
  const project = clone(p);
  const list = project.tracks[track] as unknown as Record<string, unknown>[];
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = { ...list[i], ...structuredClone(patch) };
  return project;
}

export function moveItem(p: Project, track: TimedTrack, id: string, at: number): Project {
  return updateItem(p, track, id, { at: Math.max(0, at) });
}

/** Trim the start (end stays fixed) or the end (start stays fixed) to time t. */
export function trimItem(p: Project, track: 'graphics' | 'captions', id: string, edge: 'start' | 'end', t: number): Project {
  const item = p.tracks[track].find((x) => x.id === id);
  if (!item) return p;
  const end = item.at + item.dur;
  if (edge === 'start') {
    const at = Math.min(Math.max(0, t), end - MIN);
    return updateItem(p, track, id, { at, dur: end - at });
  }
  return updateItem(p, track, id, { dur: Math.max(MIN, t - item.at) });
}

export function deleteItem(p: Project, track: TrackName, id: string): Project {
  const project = clone(p);
  const list = project.tracks[track] as { id: string }[];
  (project.tracks as unknown as Record<string, unknown>)[track] = list.filter((x) => x.id !== id);
  return project;
}

/** Split the footage clip under output time t into two clips. No-op on a clip edge. */
export function splitFootage(p: Project, t: number): Project {
  const hit = footageAt(p, t);
  if (!hit || hit.srcTime - hit.clip.in < 1e-3 || hit.clip.out - hit.srcTime < 1e-3) return p;
  const project = clone(p);
  const a: Clip = { ...hit.clip, out: hit.srcTime };
  const b: Clip = { ...hit.clip, id: newId(p, 'f'), in: hit.srcTime };
  project.tracks.footage.splice(hit.index, 1, a, b);
  return project;
}

/** Move a clip's in point (edge 'start') or out point (edge 'end') by delta source seconds. */
export function trimClip(p: Project, id: string, edge: 'start' | 'end', delta: number): Project {
  const c = p.tracks.footage.find((x) => x.id === id);
  if (!c) return p;
  if (edge === 'start') return updateItem(p, 'footage', id, { in: Math.min(Math.max(0, c.in + delta), c.out - MIN) });
  return updateItem(p, 'footage', id, { out: Math.min(Math.max(c.out + delta, c.in + MIN), c.srcDur ?? Infinity) });
}

export function moveClip(p: Project, id: string, toIndex: number): Project {
  const project = clone(p), list = project.tracks.footage;
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return p;
  const [c] = list.splice(i, 1);
  list.splice(Math.max(0, Math.min(list.length, toIndex)), 0, c);
  return project;
}

export function addClip(p: Project, src: string, sourceDuration: number): Project {
  const project = clone(p);
  project.tracks.footage.push({ id: newId(p, 'f'), src, in: 0, out: sourceDuration, srcDur: sourceDuration });
  return project;
}
