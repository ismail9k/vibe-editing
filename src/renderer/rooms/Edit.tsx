// Edit: library | preview | inspector, timeline below.
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Preview } from '../ui/Preview';
import { Timeline } from '../ui/Timeline';
import { Inspector } from '../ui/Inspector';
import { LibraryPanel, addImported } from '../ui/LibraryPanel';
import { duration } from '../../core/model';
import * as ops from '../../core/ops';

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;

export function Edit() {
  const project = useStore((s) => s.project);
  const name = useStore((s) => s.projectName);
  const playing = useStore((s) => s.playing);
  const exporting = useStore((s) => s.exporting);
  const playhead = useStore((s) => s.playhead);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useStore.getState();
      // Letters are matched by key position (e.code), so S and ⌘Z work on an Arabic layout and with Caps Lock on.
      const cmd = e.metaKey || e.ctrlKey;
      const frame = 1 / (st.project?.format.fps ?? 30);
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (cmd && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? st.redo() : st.undo(); }
      else if (cmd && e.code === 'KeyD' && st.selection) { e.preventDefault(); duplicateSelected(); }
      else if (e.code === 'KeyS' && !cmd && !e.altKey) st.apply((p) => ops.splitFootage(p, st.playhead));
      else if ((e.key === 'Backspace' || e.key === 'Delete') && st.selection) { const s = st.selection; st.apply((p) => ops.deleteItem(p, s.track, s.id)); st.select(null); }
      else if (e.key === 'ArrowLeft') st.seek(st.playhead - (e.shiftKey ? 1 : frame));
      else if (e.key === 'ArrowRight') st.seek(st.playhead + (e.shiftKey ? 1 : frame));
      else if (e.key === 'Home') st.seek(0);
      else if (e.key === 'End' && st.project) st.seek(duration(st.project));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!project || !name) return <div className="empty">No project open.</div>;

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDropping(false);
    const paths = [...e.dataTransfer.files].map((f) => window.vibe.pathForFile(f)).filter(Boolean);
    if (!paths.length) return;
    try { addImported(await window.vibe.importMedia(name, paths)); } catch (err) { alert((err as Error).message); }
  };

  return (
    <div className={`edit ${dropping ? 'dropping' : ''}`} onDragOver={(e) => { e.preventDefault(); setDropping(true); }} onDragLeave={() => setDropping(false)} onDrop={onDrop}>
      <aside className="panel left"><LibraryPanel /></aside>
      <main className="center">
        <Preview />
        <div className="transport">
          <button className="play" onClick={togglePlay}>{playing ? '❚❚' : '▶'}</button>
          <span className="time">{fmt(playhead)} <i>/ {fmt(duration(project))}</i></span>
          <span className="muted">{project.format.w}×{project.format.h} · {project.format.fps} fps</span>
          <span className="spacer" />
          <button className="ghost" onClick={() => useStore.getState().undo()} title="Undo (⌘Z)">↶</button>
          <button className="ghost" onClick={() => useStore.getState().redo()} title="Redo (⇧⌘Z)">↷</button>
          <button className="primary" disabled={exportBusy(exporting)} onClick={() => startExport(name)}>{exportBusy(exporting) ? 'Exporting…' : 'Export'}</button>
        </div>
      </main>
      <aside className="panel right"><Inspector /></aside>
      <Timeline />
    </div>
  );
}

/** ⌘D: a copy of the selected item, right after it, selected in its place. */
function duplicateSelected() {
  const st = useStore.getState(), sel = st.selection;
  if (!sel) return;
  let id = '';
  st.apply((p) => {
    const a = sel.track === 'audio' ? p.tracks.audio.find((x) => x.id === sel.id) : undefined;
    const r = ops.duplicateItem(p, sel.track, sel.id, st.media.find((m) => m.src === a?.src)?.duration);
    if (!r) return p;
    id = r.id;
    return r.project;
  });
  if (id) st.select({ track: sel.track, id });
}

function togglePlay() {
  const st = useStore.getState();
  if (!st.project) return;
  if (!st.playing && st.playhead >= duration(st.project) - 0.01) st.seek(0);
  st.setPlaying(!st.playing);
}

const exportBusy = (x: { stage: string } | null) => !!x && (x.stage === 'frames' || x.stage === 'encoding');

async function startExport(name: string) {
  if (exportBusy(useStore.getState().exporting)) return; // one export at a time
  useStore.setState({ exporting: { done: 0, total: 1, stage: 'frames' } });
  try { await window.vibe.exportProject(name); }
  catch (e) { useStore.setState({ exporting: { done: 0, total: 1, stage: 'error', message: (e as Error).message } }); }
}
