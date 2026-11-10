// Snapping on the timeline: when a dragged item's start or end comes near another item's edge, a cut,
// the playhead or zero, it lands exactly there. Pure maths in seconds, so the timeline stays thin and this is tested.
import { footageSpans, type Project, type TrackName } from './model';

/** How close (in screen pixels) an edge must come to a target to snap onto it. */
export const SNAP_PX = 8;

/** The times a dragged item can snap to: every other item's start and end, each cut, zero and `extra`
 *  (the playhead). Sorted, without repeats. */
export function snapTargets(p: Project, skip: { track: TrackName; id: string }, extra: number[] = []): number[] {
  const out = [0, ...extra];
  const spans = footageSpans(p);
  const me = skip.track === 'footage' ? spans.find((s) => s.clip.id === skip.id) : undefined;
  for (const s of spans) {
    // Footage is magnetic: trimming a clip moves every clip from it onward, so only the cuts before it stay put.
    if (me && s.start >= me.start - 1e-9) continue;
    out.push(s.start, s.end);
  }
  for (const track of ['graphics', 'captions'] as const) {
    for (const it of p.tracks[track]) if (!(skip.track === track && skip.id === it.id)) out.push(it.at, it.at + it.dur);
  }
  // A sound's length isn't in vibe.json, so only its start is a fixed point.
  for (const a of p.tracks.audio) if (!(skip.track === 'audio' && skip.id === a.id)) out.push(a.at);
  return [...new Set(out.map((t) => Math.round(t * 1e6) / 1e6))].sort((a, b) => a - b);
}

/** Snap a drag of `dt` seconds that moves the times in `points` (a block's start and end, or the one edge
 *  being trimmed): whichever point lands nearest a target within `tol` seconds pulls the whole drag onto it.
 *  `at` is the target it snapped to, or null when nothing was close enough. */
export function snapDelta(points: number[], dt: number, targets: number[], tol: number): { dt: number; at: number | null } {
  let best: { dt: number; at: number | null } = { dt, at: null }, gap = tol;
  for (const pt of points) {
    for (const t of targets) {
      const d = t - (pt + dt);
      if (Math.abs(d) <= gap) { gap = Math.abs(d); best = { dt: dt + d, at: t }; }
    }
  }
  return best;
}
