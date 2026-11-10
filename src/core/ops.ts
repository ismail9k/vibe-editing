// Pure edit operations. Each returns a new Project; the input is never mutated (undo keeps old ones).
import { footageAt, footageSpans, type Project, type TimedTrack, type TrackName, type Clip } from './model';
import { propFits, type ComponentMeta } from './validate';

const MIN = 0.1;
const clone = (p: Project): Project => structuredClone(p);
/** Times the app writes are whole milliseconds: a drag or the playhead gives 2.8834999999999993, which nobody
 *  wants to read in vibe.json. */
const ms = (t: number) => Math.round(t * 1000) / 1000;

export function newId(p: Project, prefix: string): string {
  const ids = new Set(Object.values(p.tracks).flat().map((x) => x.id));
  let n = 1;
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function addGraphic(p: Project, type: string, at: number, dur: number, props: Record<string, unknown>) {
  const project = clone(p), id = newId(p, 'g');
  project.tracks.graphics.push({ id, type, at: ms(at), dur, props: structuredClone(props) });
  return { project, id };
}

export function addCaption(p: Project, text: string, at: number, dur: number) {
  const project = clone(p), id = newId(p, 'c');
  project.tracks.captions.push({ id, text, at: ms(at), dur });
  return { project, id };
}

export function addAudio(p: Project, src: string, at: number) {
  const project = clone(p), id = newId(p, 'a');
  project.tracks.audio.push({ id, src, at: ms(at), gain: 1 });
  return { project, id };
}

export function updateItem(p: Project, track: TrackName, id: string, patch: Record<string, unknown>): Project {
  const project = clone(p);
  const list = project.tracks[track] as unknown as Record<string, unknown>[];
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = { ...list[i], ...structuredClone(patch) };
  return project;
}

/** Swap a graphic to another component in place: same id and timing. Props the new component also has, with the
 *  same type, carry over; the rest are dropped, since its schema can't edit them. The position override goes too,
 *  because it was set for the old component's shape. */
export function changeComponent(p: Project, id: string, type: string, meta: Pick<ComponentMeta, 'schema'>): Project {
  const g = p.tracks.graphics.find((x) => x.id === id);
  if (!g || g.type === type) return p;
  const props = Object.fromEntries(Object.entries(g.props).filter(([k, v]) => meta.schema[k] && propFits(meta.schema[k], v)));
  const project = updateItem(p, 'graphics', id, { type, props });
  const it = project.tracks.graphics.find((x) => x.id === id)!;
  delete it.x; delete it.y; delete it.w;
  return project;
}

export function moveItem(p: Project, track: TimedTrack, id: string, at: number): Project {
  return updateItem(p, track, id, { at: ms(Math.max(0, at)) });
}

/** Trim the start (end stays fixed) or the end (start stays fixed) to time t. */
export function trimItem(p: Project, track: 'graphics' | 'captions', id: string, edge: 'start' | 'end', t: number): Project {
  const item = p.tracks[track].find((x) => x.id === id);
  if (!item) return p;
  const end = item.at + item.dur;
  if (edge === 'start') {
    const at = ms(Math.min(Math.max(0, t), end - MIN));
    return updateItem(p, track, id, { at, dur: ms(end - at) });
  }
  return updateItem(p, track, id, { dur: ms(Math.max(MIN, t - item.at)) });
}

type Timed = { at: number; dur: number };
/** Move every graphic, caption and sound through `start` (where an item begins) and `end` (where one stops).
 *  One left with no length is dropped. */
function retime(project: Project, start: (t: number) => number, end: (t: number) => number): void {
  const moved = <T extends Timed>(list: T[]): T[] => list.flatMap((x) => {
    const at = start(x.at), dur = end(x.at + x.dur) - at;
    return dur < 1e-3 ? [] : [{ ...x, at: ms(at), dur: ms(dur) }];
  });
  project.tracks.graphics = moved(project.tracks.graphics);
  project.tracks.captions = moved(project.tracks.captions);
  project.tracks.audio = project.tracks.audio.map((a) => ({ ...a, at: ms(start(a.at)) }));
}

/** Footage from `from` to `to` is gone and what follows has closed up, so everything after comes back with it.
 *  A graphic or caption that only played over the part that's gone goes too; one that reaches past it loses
 *  just that part. Sounds have no length here, so one that started in it is kept, at the cut. */
function closeGap(project: Project, from: number, to: number): void {
  const cut = (t: number) => (t <= from ? t : t >= to ? t - (to - from) : from);
  retime(project, cut, cut);
}

/** `len` more seconds of footage now play from `at`, so what followed moves on by that much. An item that
 *  starts on the cut belongs to what follows; one running across it grows to still end where it did. */
function openGap(project: Project, at: number, len: number): void {
  retime(project, (t) => (t >= at ? t + len : t), (t) => (t > at ? t + len : t));
}

/** Deleting a clip closes the gap it leaves, so the later graphics, captions and sounds stay on the footage
 *  they were made for (see `closeGap`). */
export function deleteItem(p: Project, track: TrackName, id: string): Project {
  const project = clone(p);
  const span = track === 'footage' ? footageSpans(p).find((s) => s.clip.id === id) : undefined;
  if (span && span.end > span.start) closeGap(project, span.start, span.end);
  const list = project.tracks[track] as { id: string }[];
  (project.tracks as unknown as Record<string, unknown>)[track] = list.filter((x) => x.id !== id);
  return project;
}

/** A copy of an item with a new id. A graphic or caption lands right after the original, a sound `gap` seconds
 *  after it starts (its length isn't in vibe.json; the caller knows it), a clip next in the footage order. */
export function duplicateItem(p: Project, track: TrackName, id: string, gap = 1): { project: Project; id: string } | null {
  const i = p.tracks[track].findIndex((x) => x.id === id);
  if (i < 0) return null;
  const project = clone(p), copyId = newId(p, track === 'captions' ? 'c' : track[0]);
  if (track === 'footage') project.tracks.footage.splice(i + 1, 0, { ...structuredClone(p.tracks.footage[i]), id: copyId });
  else if (track === 'audio') project.tracks.audio.push({ ...p.tracks.audio[i], id: copyId, at: ms(p.tracks.audio[i].at + gap) });
  else {
    const it = structuredClone(p.tracks[track][i]);
    (project.tracks[track] as typeof it[]).push({ ...it, id: copyId, at: ms(it.at + it.dur) });
  }
  return { project, id: copyId };
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

/** Move a clip's in point (edge 'start') or out point (edge 'end') by delta source seconds. The clip gets longer
 *  or shorter where that edge is on the timeline, and the graphics, captions and sounds from there on move with
 *  the footage. */
export function trimClip(p: Project, id: string, edge: 'start' | 'end', delta: number): Project {
  const span = footageSpans(p).find((s) => s.clip.id === id);
  if (!span) return p;
  const c = span.clip;
  const to = edge === 'start' ? ms(Math.min(Math.max(0, c.in + delta), c.out - MIN))
    : Math.min(ms(Math.max(c.out + delta, c.in + MIN)), c.srcDur ?? Infinity);
  const project = updateItem(p, 'footage', id, edge === 'start' ? { in: to } : { out: to });
  // How much longer the clip is now, and the point on the timeline where that time went in or came out.
  const grew = edge === 'start' ? c.in - to : to - c.out, at = edge === 'start' ? span.start : span.end;
  if (grew > 0) openGap(project, at, grew);
  else if (grew < 0 && edge === 'start') closeGap(project, at, at - grew);
  else if (grew < 0) closeGap(project, at + grew, at);
  return project;
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
