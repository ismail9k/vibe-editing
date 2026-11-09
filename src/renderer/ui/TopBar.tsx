import { useEffect, useState } from 'react';
import { useStore } from '../store';

const ago = (at: number) => { const s = Math.round((Date.now() - at) / 1000); return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`; };

export function TopBar() {
  const { info, projectName, room, setRoom, openProject, diskNote, parseError, libError, issues, exporting, project, mattes } = useStore();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(i); }, []);
  const errors = issues.filter((i) => i.level === 'error');

  const newProject = async () => {
    const name = prompt('New project name');
    if (!name) return;
    try { const slug = await window.vibe.createProject(name); await useStore.getState().refreshInfo(); await openProject(slug); }
    catch (e) { alert((e as Error).message); }
  };

  return (
    <header className="topbar">
      <div className="brandmark">vibe<b>_</b></div>
      <select className="project-select" value={projectName ?? ''} onChange={(e) => e.target.value === '+new' ? newProject() : openProject(e.target.value)}>
        {(info?.projects ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
        <option value="+new">+ New project…</option>
      </select>
      <nav className="rooms">
        <button className={room === 'studio' ? 'on' : ''} onClick={() => setRoom('studio')}>Studio</button>
        <button className={room === 'edit' ? 'on' : ''} onClick={() => setRoom('edit')}>Edit</button>
      </nav>
      {project && <span className="chip">Style: {project.style}</span>}
      <div className="status">
        {parseError && <span className="bad" title={parseError}>● {parseError}</span>}
        {libError && <span className="bad" title={libError}>● library: {libError}</span>}
        {!parseError && errors.length > 0 && <span className="bad" title={errors.map((e) => `${e.path}: ${e.message}`).join('\n')}>● {errors.length} problem{errors.length > 1 ? 's' : ''}: {errors[0].message}</span>}
        {!parseError && !libError && !errors.length && diskNote && <span className="ok">● {diskNote.text} · {ago(diskNote.at)}</span>}
        {!parseError && !libError && !errors.length && !diskNote && <span className="muted">● watching ~/Vibe for Claude Code</span>}
      </div>
      {mattes?.state === 'working' && (
        <span className="chip" title={`Apple Vision is cutting you out of ${mattes.src}. Cutout effects show the whole frame until it's done.`}>
          Cutting you out · {Math.round((100 * (mattes.done ?? 0)) / Math.max(1, mattes.total ?? 1))}%
        </span>
      )}
      {mattes?.state === 'error' && <span className="chip bad" title={mattes.message}>No cutouts: {mattes.message}</span>}
      {exporting && (
        <ExportChip exporting={exporting} />
      )}
    </header>
  );
}

/** Export progress, and how it ended. Frames that drew with errors (a broken component's red box) still export,
 *  so the chip says so instead of a plain "Exported". */
function ExportChip({ exporting: x }: { exporting: NonNullable<ReturnType<typeof useStore.getState>['exporting']> }) {
  const file = x.out?.split('/').slice(-2).join('/');
  if (x.stage === 'error') return <span className="chip bad" title={x.message}>Export failed: {x.message}</span>;
  if (x.stage !== 'done') return <span className="chip export-chip">Exporting {Math.round((100 * x.done) / Math.max(1, x.total))}%</span>;
  const errors = x.errors ?? [];
  if (!errors.length) return <span className="chip export-chip" title={x.out}>Exported · {file}</span>;
  return (
    <span className="chip bad" title={errors.join('\n')}>
      Exported with {errors.length} render error{errors.length > 1 ? 's' : ''} · {file}
    </span>
  );
}
