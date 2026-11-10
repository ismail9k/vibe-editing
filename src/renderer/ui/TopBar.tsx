import { useEffect, useState } from 'react';
import { retryMattes, useStore } from '../store';
import { setChatOpen, useChat } from '../chat';

// The workspace as people type it: ~/Vibe, not /Users/name/Vibe. It's $VIBE_HOME when that's set, so say which.
const short = (root?: string) => (root ? root.replace(/^\/(Users|home)\/[^/]+(?=\/|$)/, '~') : '~/Vibe');
const ago = (at: number) => { const s = Math.round((Date.now() - at) / 1000); return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`; };

export function TopBar() {
  const { info, projectName, room, setRoom, openProject, diskNote, parseError, libError, issues, exporting, project, mattes } = useStore();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(i); }, []);
  const errors = issues.filter((i) => i.level === 'error');

  // Electron has no window.prompt (calling it throws), so a new project is named in the bar itself.
  const [naming, setNaming] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const stopNaming = () => { setNaming(false); setNameError(null); };
  const newProject = async (name: string) => {
    if (!name) return stopNaming();
    try { const slug = await window.vibe.createProject(name); await useStore.getState().refreshInfo(); await openProject(slug); stopNaming(); }
    catch (e) { setNameError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } // the reason, without Electron's wrapping
  };

  return (
    <header className="topbar">
      <div className="brandmark">vibe<b>_</b></div>
      {naming ? (
        <form className="project-new" onSubmit={(e) => { e.preventDefault(); newProject(String(new FormData(e.currentTarget).get('name') ?? '').trim()); }}>
          <input name="name" autoFocus placeholder="New project name" title={nameError ?? 'Enter makes it, Escape cancels'} className={nameError ? 'bad' : ''}
            onChange={() => setNameError(null)} onKeyDown={(e) => { if (e.key === 'Escape') stopNaming(); else if (e.key === 'Enter') { e.preventDefault(); newProject(e.currentTarget.value.trim()); } }} onBlur={(e) => { if (!e.currentTarget.value.trim()) stopNaming(); }} />
          {nameError && <span className="bad">{nameError}</span>}
        </form>
      ) : (
        <select className="project-select" value={projectName ?? ''} onChange={(e) => e.target.value === '+new' ? setNaming(true) : openProject(e.target.value)}>
          {(info?.projects ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
          <option value="+new">+ New project…</option>
        </select>
      )}
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
        {!parseError && !libError && !errors.length && !diskNote && <span className="muted" title={info?.root}>● watching {short(info?.root)} for Claude Code</span>}
      </div>
      {mattes?.state === 'working' && (
        <span className="chip" title={`Apple Vision is cutting you out of ${mattes.src}. Cutout effects show the whole frame until it's done.`}>
          Cutting you out · {Math.round((100 * (mattes.done ?? 0)) / Math.max(1, mattes.total ?? 1))}%
        </span>
      )}
      {mattes?.state === 'error' && (
        <button className="chip bad chip-button" title={`${mattes.message}\n\nClick to try again`} onClick={retryMattes}>No cutouts: {mattes.message} · Retry</button>
      )}
      {exporting && (
        <ExportChip exporting={exporting} />
      )}
      <ChatToggle />
    </header>
  );
}

/** Opens the Claude panel. While it's closed, a dot says Claude is still working. */
function ChatToggle() {
  const { open, state } = useChat();
  return (
    <button className={`chat-toggle ${open ? 'on' : ''}`} onClick={() => setChatOpen(!open)} title={open ? 'Close the Claude panel (⌘L)' : 'Talk to Claude (⌘L)'}>
      {state?.busy && !open && <i className="chat-busy" />}Claude
    </button>
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
