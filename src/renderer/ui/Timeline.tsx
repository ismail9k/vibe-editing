// The timeline: footage (magnetic), graphics (stacked in lanes), captions, sounds.
// Drag a body to move (or reorder footage), drag an edge to trim, click empty space to seek.
// Dragged edges snap onto other items, cuts and the playhead; hold Option to drag freely.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { duration, footageSpans, type Project, type TrackName } from '../../core/model';
import * as ops from '../../core/ops';
import { SNAP_PX, snapDelta, snapTargets } from '../../core/snap';

type Mode = 'move' | 'start' | 'end';
// points: the times this drag moves (a block's edges, or the one being trimmed); targets: where they can snap.
interface Drag { track: TrackName; id: string; mode: Mode; x0: number; dx: number; free: boolean; points: number[]; targets: number[] }
interface Block { id: string; start: number; end: number; label: string; lane: number; color: string }

const ROW = 34, EDGE = 7;

function lanes<T extends { at: number; dur: number }>(items: T[]): number[] {
  const ends: number[] = [];
  return items.map((it) => {
    let lane = ends.findIndex((e) => e <= it.at + 1e-6);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = it.at + it.dur;
    return lane;
  });
}

/** How long a sound's block is while its real length isn't known (the file is missing, or not listed yet). */
const UNKNOWN_SOUND = 1;

function blocksFor(p: Project, track: TrackName, libNames: Record<string, string>, lengths: Record<string, number> = {}): Block[] {
  if (track === 'footage') return footageSpans(p).map((s) => ({ id: s.clip.id, start: s.start, end: s.end, label: s.clip.src.replace(/^media\//, ''), lane: 0, color: 'var(--clip-footage)' }));
  if (track === 'audio') {
    // Sounds overlap freely (a whoosh under a riser), so they stack in lanes like graphics.
    const items = [...p.tracks.audio].sort((a, b) => a.at - b.at).map((a) => ({ ...a, dur: lengths[a.src] || UNKNOWN_SOUND }));
    const ls = lanes(items);
    return items.map((a, i) => ({ id: a.id, start: a.at, end: a.at + a.dur, label: a.src.replace(/^media\//, ''), lane: ls[i], color: 'var(--clip-audio)' }));
  }
  const items = [...p.tracks[track]].sort((a, b) => a.at - b.at);
  const ls = lanes(items);
  return items.map((it, i) => ({
    id: it.id, start: it.at, end: it.at + it.dur, lane: ls[i],
    label: track === 'graphics' ? `${libNames[(it as { type: string }).type] ?? (it as { type: string }).type}` : (it as { text: string }).text,
    color: track === 'graphics' ? 'var(--clip-graphic)' : 'var(--clip-caption)',
  }));
}

/** The drag in seconds after snapping (none while Option is held). */
function snapped(d: Drag, pps: number): { dt: number; at: number | null } {
  const dt = d.dx / pps;
  return d.free ? { dt, at: null } : snapDelta(d.points, dt, d.targets, SNAP_PX / pps);
}

export function Timeline() {
  const project = useStore((s) => s.project)!;
  const lib = useStore((s) => s.lib);
  const selection = useStore((s) => s.selection);
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);
  const media = useStore((s) => s.media);
  const { select, seek, apply } = useStore.getState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(60);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  const total = duration(project);
  const width = Math.max(total + 6, 20) * pps;
  const names = Object.fromEntries(Object.entries(lib?.components ?? {}).map(([k, v]) => [k, v.meta.name]));
  const lengths = Object.fromEntries(media.filter((m) => m.kind === 'audio').map((m) => [m.src, m.duration]));

  // While playing, the view follows the playhead: when it runs off the right edge, the timeline pages on.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = playhead * pps;
    if (x > el.scrollLeft + el.clientWidth - 24 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 48);
  }, [playhead, playing, pps]);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, dx: e.clientX - d.x0, free: e.altKey } : d));
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d && Math.abs(d.dx) > 1) commit(d, snapped(d, pps).dt);
    };
    // Escape drops the drag and leaves the item where it was.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrag(null); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('keydown', key); };
  }, [drag !== null, pps]);

  const commit = (d: Drag, dt: number) => {
    apply((p) => {
      if (d.track === 'footage') {
        if (d.mode !== 'move') return ops.trimClip(p, d.id, d.mode, dt);
        const spans = footageSpans(p), me = spans.find((s) => s.clip.id === d.id)!;
        const centre = (me.start + me.end) / 2 + dt;
        const to = spans.filter((s) => s.clip.id !== d.id && (s.start + s.end) / 2 < centre).length;
        return ops.moveClip(p, d.id, to);
      }
      const item = p.tracks[d.track].find((x) => x.id === d.id) as { at: number; dur?: number } | undefined;
      if (!item) return p;
      if (d.mode === 'move' || d.track === 'audio') return ops.moveItem(p, d.track as 'graphics', d.id, item.at + dt);
      const edgeT = d.mode === 'start' ? item.at + dt : item.at + (item.dur ?? 0) + dt;
      return ops.trimItem(p, d.track as 'graphics' | 'captions', d.id, d.mode, edgeT);
    });
  };

  const startDrag = (e: React.PointerEvent, track: TrackName, id: string, b: Block) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const mode: Mode = track !== 'audio' && x < EDGE ? 'start' : track !== 'audio' && x > r.width - EDGE ? 'end' : 'move';
    // Snap to where the playhead was, not where this click is about to put it.
    const targets = snapTargets(project, { track, id }, [useStore.getState().playhead]);
    // Reordering footage doesn't land on a time, and trimming a clip's start moves the cut at its end.
    const points = track === 'footage' ? (mode === 'end' ? [b.end] : [])
      : track === 'audio' ? [b.start]
      : mode === 'move' ? [b.start, b.end] : [mode === 'start' ? b.start : b.end];
    select({ track, id });
    if (mode === 'move' && track !== 'footage') seek(Math.max(b.start, Math.min(b.end - 0.01, (e.clientX - r.left) / pps + b.start)));
    setDrag({ track, id, mode, x0: e.clientX, dx: 0, free: e.altKey, points, targets });
  };

  const scrubFrom = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const at = (x: number) => seek((x - r.left) / pps);
    at(e.clientX);
    select(null);
    const move = (ev: PointerEvent) => at(ev.clientX);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true });
  };

  const addCaption = () => {
    let id = '';
    apply((p) => { const r = ops.addCaption(p, 'New caption', useStore.getState().playhead, 1.5); id = r.id; return r.project; });
    select({ track: 'captions', id });
  };

  const snap = drag ? snapped(drag, pps) : null;
  const dx = snap ? snap.dt * pps : 0;

  const tickEvery = pps >= 80 ? 1 : pps >= 30 ? 2 : pps >= 12 ? 5 : 10;
  const tracks: [TrackName, string][] = [['footage', 'Footage'], ['graphics', 'Graphics'], ['captions', 'Captions'], ['audio', 'Sounds']];

  return (
    <section className="timeline">
      <div className="tl-heads">
        <div className="tl-ruler-head">
          <input type="range" min={8} max={200} value={pps} onChange={(e) => setPps(Number(e.target.value))} title="Zoom" />
        </div>
        {tracks.map(([t, label]) => {
          const n = Math.max(1, ...blocksFor(project, t, names, lengths).map((b) => b.lane + 1));
          return (
            <div key={t} className="tl-head" style={{ height: n * ROW + 8 }}>
              <span>{label}</span>
              {t === 'captions' && <button className="tiny" onClick={addCaption} title="Add a caption at the playhead">+</button>}
            </div>
          );
        })}
      </div>
      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-content" style={{ width }}>
          <div className="tl-ruler" onPointerDown={scrubFrom}>
            {Array.from({ length: Math.ceil(width / pps / tickEvery) }, (_, i) => (
              <span key={i} className="tick" style={{ left: i * tickEvery * pps }}>{i * tickEvery}s</span>
            ))}
          </div>
          {tracks.map(([track]) => {
            const blocks = blocksFor(project, track, names, lengths);
            const n = Math.max(1, ...blocks.map((b) => b.lane + 1));
            return (
              <div key={track} className="tl-track" style={{ height: n * ROW + 8 }} onPointerDown={scrubFrom}>
                {blocks.map((b) => {
                  let left = b.start * pps, w = (b.end - b.start) * pps;
                  if (drag && drag.track === track && drag.id === b.id) {
                    if (drag.mode === 'move') left += dx;
                    else if (drag.mode === 'start') { left += dx; w -= dx; }
                    else w += dx;
                  }
                  const sel = selection?.track === track && selection.id === b.id;
                  return (
                    <div key={b.id} className={`tl-block ${sel ? 'sel' : ''} ${drag?.id === b.id ? 'dragging' : ''}`}
                      style={{ left, width: Math.max(4, w), top: 4 + b.lane * ROW, height: ROW - 4, background: b.color }}
                      onPointerDown={(e) => startDrag(e, track, b.id, b)} title={b.label}>
                      <span dir="auto">{b.label}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {snap?.at != null && <div className="tl-snap" style={{ left: snap.at * pps }} />}
          <div className="tl-playhead" style={{ left: playhead * pps }} />
        </div>
      </div>
    </section>
  );
}
