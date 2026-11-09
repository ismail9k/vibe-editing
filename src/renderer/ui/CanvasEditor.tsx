// Moving graphics with the mouse on the Edit preview. Click a graphic's pixels to select it, drag it to move it,
// drag the side handles to change its width. While dragging the project changes live without saving; letting go
// saves once, so a whole drag is one undo step and one change on disk. Snaps to the frame's centre lines (hold
// Alt for a free drag).
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import * as ops from '../../core/ops';
import { probeGraphic } from '../../core/render';
import { alphaBounds, drawnNear, inside, moved, resized, type Box, type Pos } from '../../core/drag';
import type { FrameMedia } from '../../core/media';
import type { Project } from '../../core/model';

type Mode = 'move' | 'left' | 'right';
interface Shown { id: string; box: Box; pos: Pos }
interface Drag { mode: Mode; id: string; orig: Project; draft: Project | null; pos: Pos; box: Box; sx: number; sy: number; scale: number; pointer: number }

/** A pointer movement shorter than this (in screen pixels) is a click, not a drag. */
const CLICK = 3;
/** How far from a stroke (in screen pixels) a click still grabs it. */
const REACH = 6;

export function CanvasEditor({ media }: { media: () => FrameMedia | null }) {
  const project = useStore((s) => s.project);
  const lib = useStore((s) => s.lib);
  const selection = useStore((s) => s.selection);
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);
  const ref = useRef<HTMLDivElement>(null);
  const probeRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);
  const drag = useRef<Drag | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [guides, setGuides] = useState({ v: false, h: false });

  /** Draw one graphic alone and read back its pixels; null when it can't be moved. */
  const probe = (p: Project, id: string, t: number) => {
    const { w: W, h: H } = p.format;
    let ctx = probeRef.current;
    if (!ctx || ctx.canvas.width !== W || ctx.canvas.height !== H) ctx = probeRef.current = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true })!;
    const at = lib && probeGraphic(ctx as unknown as CanvasRenderingContext2D, p, lib, t, id, media());
    if (!at) return null;
    const data = ctx.getImageData(0, 0, W, H).data;
    return { pos: { x: at.x / W, y: at.y / H, w: at.w / W }, data, box: alphaBounds(data, W, H) };
  };

  // Outline the selected graphic where it's drawn now. Hidden while playing: it would trail the picture.
  useEffect(() => {
    if (!project || !lib || playing || selection?.track !== 'graphics') { setShown(null); return; }
    const r = probe(project, selection.id, playhead);
    setShown(r?.box ? { id: selection.id, box: r.box, pos: r.pos } : null);
  }, [project, lib, selection, playhead, playing]);

  // Escape puts a graphic back where the drag started.
  const endRef = useRef<(keep: boolean) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && drag.current) { e.preventDefault(); endRef.current(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!project) return null;
  const { w: W, h: H } = project.format;

  /** Frame pixels under a pointer event, and frame pixels per screen pixel. */
  const frameAt = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, scale: W / r.width };
  };

  const begin = (e: React.PointerEvent, mode: Mode, id: string, pos: Pos, box: Box) => {
    const at = frameAt(e);
    const st = useStore.getState();
    if (st.playing) st.setPlaying(false);
    drag.current = { mode, id, orig: st.project!, draft: null, pos, box, sx: at.x, sy: at.y, scale: at.scale, pointer: e.pointerId };
    ref.current!.setPointerCapture(e.pointerId);
  };

  const onDown = (e: React.PointerEvent, mode: Mode = 'move') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = useStore.getState(), p = st.project;
    if (!p) return;
    const at = frameAt(e);
    // The selected graphic can be grabbed anywhere inside its outline; a handle resizes it.
    if (shown && (mode !== 'move' || inside(shown.box, at.x, at.y, REACH * at.scale))) { begin(e, mode, shown.id, shown.pos, shown.box); return; }
    // Otherwise pick the topmost graphic drawn under the pointer (later starts draw on top).
    const t = st.playhead;
    const showing = p.tracks.graphics.filter((g) => t >= g.at && t < g.at + g.dur).sort((a, b) => a.at - b.at).reverse();
    for (const g of showing) {
      const r = probe(p, g.id, t);
      if (r?.box && drawnNear(r.data, W, H, at.x, at.y, REACH * at.scale)) {
        st.select({ track: 'graphics', id: g.id });
        setShown({ id: g.id, box: r.box, pos: r.pos });
        begin(e, 'move', g.id, r.pos, r.box);
        return;
      }
    }
    st.select(null);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const at = frameAt(e), dx = at.x - d.sx, dy = at.y - d.sy;
    if (!d.draft && Math.hypot(dx, dy) < CLICK * d.scale) return;
    let pos: Pos;
    if (d.mode === 'move') { const r = moved(d.pos, d.box, dx, dy, W, H, e.altKey); pos = r.pos; setGuides(r.guides); }
    else pos = resized(d.pos, d.box, d.mode, dx, W);
    const st = useStore.getState();
    // Something else replaced the project mid-drag (Claude edited vibe.json): disk wins, the drag stops.
    if (st.project !== (d.draft ?? d.orig)) { drag.current = null; setGuides({ v: false, h: false }); return; }
    d.draft = ops.updateItem(d.orig, 'graphics', d.id, { ...pos });
    useStore.setState({ project: d.draft });
  };

  const end = (keep: boolean) => {
    const d = drag.current;
    drag.current = null;
    setGuides({ v: false, h: false });
    if (d && ref.current?.hasPointerCapture(d.pointer)) ref.current.releasePointerCapture(d.pointer);
    if (!d?.draft) return;
    const st = useStore.getState();
    if (st.project !== d.draft) return; // replaced from disk meanwhile
    // Put the original back, then apply the result as one edit: one undo step, one save.
    useStore.setState({ project: d.orig });
    if (!keep) return;
    const g = d.draft.tracks.graphics.find((x) => x.id === d.id)!;
    st.apply((p) => ops.updateItem(p, 'graphics', d.id, { x: g.x, y: g.y, w: g.w }));
  };

  endRef.current = end;

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const box = shown?.box;
  return (
    <div ref={ref} className="canvas-editor" onPointerDown={(e) => onDown(e)} onPointerMove={onMove}
      onPointerUp={() => end(true)} onPointerCancel={() => end(false)}>
      {guides.v && <div className="guide v" />}
      {guides.h && <div className="guide h" />}
      {box && (
        <div className="outline" style={{ left: pct(box.x, W), top: pct(box.y, H), width: pct(box.w, W), height: pct(box.h, H) }}>
          <div className="handle left" onPointerDown={(e) => onDown(e, 'left')} title="Drag to change the width" />
          <div className="handle right" onPointerDown={(e) => onDown(e, 'right')} title="Drag to change the width" />
        </div>
      )}
    </div>
  );
}
