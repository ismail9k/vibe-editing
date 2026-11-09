// The timeline: footage (magnetic), graphics (stacked in lanes), captions, sounds.
// Drag a body to move (or reorder footage), drag an edge to trim, click empty space to seek.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { duration, footageSpans, type Project, type TrackName } from '../../core/model';
import * as ops from '../../core/ops';

type Mode = 'move' | 'start' | 'end';
interface Drag { track: TrackName; id: string; mode: Mode; x0: number; dx: number }
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

function blocksFor(p: Project, track: TrackName, libNames: Record<string, string>): Block[] {
  if (track === 'footage') return footageSpans(p).map((s) => ({ id: s.clip.id, start: s.start, end: s.end, label: s.clip.src.replace(/^media\//, ''), lane: 0, color: 'var(--clip-footage)' }));
  if (track === 'audio') return p.tracks.audio.map((a) => ({ id: a.id, start: a.at, end: a.at + 1, label: a.src.replace(/^media\//, ''), lane: 0, color: 'var(--clip-audio)' }));
  const items = [...p.tracks[track]].sort((a, b) => a.at - b.at);
  const ls = lanes(items);
  return items.map((it, i) => ({
    id: it.id, start: it.at, end: it.at + it.dur, lane: ls[i],
    label: track === 'graphics' ? `${libNames[(it as { type: string }).type] ?? (it as { type: string }).type}` : (it as { text: string }).text,
    color: track === 'graphics' ? 'var(--clip-graphic)' : 'var(--clip-caption)',
  }));
}

export function Timeline() {
  const project = useStore((s) => s.project)!;
  const lib = useStore((s) => s.lib);
  const selection = useStore((s) => s.selection);
  const playhead = useStore((s) => s.playhead);
  const { select, seek, apply } = useStore.getState();
  const [pps, setPps] = useState(60);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  const total = duration(project);
  const width = Math.max(total + 6, 20) * pps;
  const names = Object.fromEntries(Object.entries(lib?.components ?? {}).map(([k, v]) => [k, v.meta.name]));

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, dx: e.clientX - d.x0 } : d));
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d && Math.abs(d.dx) > 1) commit(d, pps);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag !== null, pps]);

  const commit = (d: Drag, pps: number) => {
    const dt = d.dx / pps;
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
    select({ track, id });
    if (mode === 'move' && track !== 'footage') seek(Math.max(b.start, Math.min(b.end - 0.01, (e.clientX - r.left) / pps + b.start)));
    setDrag({ track, id, mode, x0: e.clientX, dx: 0 });
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

  const tickEvery = pps >= 80 ? 1 : pps >= 30 ? 2 : pps >= 12 ? 5 : 10;
  const tracks: [TrackName, string][] = [['footage', 'Footage'], ['graphics', 'Graphics'], ['captions', 'Captions'], ['audio', 'Sounds']];

  return (
    <section className="timeline">
      <div className="tl-heads">
        <div className="tl-ruler-head">
          <input type="range" min={8} max={200} value={pps} onChange={(e) => setPps(Number(e.target.value))} title="Zoom" />
        </div>
        {tracks.map(([t, label]) => {
          const n = t === 'graphics' || t === 'captions' ? Math.max(1, ...blocksFor(project, t, names).map((b) => b.lane + 1)) : 1;
          return (
            <div key={t} className="tl-head" style={{ height: n * ROW + 8 }}>
              <span>{label}</span>
              {t === 'captions' && <button className="tiny" onClick={addCaption} title="Add a caption at the playhead">+</button>}
            </div>
          );
        })}
      </div>
      <div className="tl-scroll">
        <div className="tl-content" style={{ width }}>
          <div className="tl-ruler" onPointerDown={scrubFrom}>
            {Array.from({ length: Math.ceil(width / pps / tickEvery) }, (_, i) => (
              <span key={i} className="tick" style={{ left: i * tickEvery * pps }}>{i * tickEvery}s</span>
            ))}
          </div>
          {tracks.map(([track]) => {
            const blocks = blocksFor(project, track, names);
            const n = Math.max(1, ...blocks.map((b) => b.lane + 1));
            return (
              <div key={track} className="tl-track" style={{ height: n * ROW + 8 }} onPointerDown={scrubFrom}>
                {blocks.map((b) => {
                  let left = b.start * pps, w = (b.end - b.start) * pps;
                  if (drag && drag.track === track && drag.id === b.id) {
                    if (drag.mode === 'move') left += drag.dx;
                    else if (drag.mode === 'start') { left += drag.dx; w -= drag.dx; }
                    else w += drag.dx;
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
          <div className="tl-playhead" style={{ left: playhead * pps }} />
        </div>
      </div>
    </section>
  );
}
