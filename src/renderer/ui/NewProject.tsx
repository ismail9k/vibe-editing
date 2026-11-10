// The New project sheet: hand over the video, say what you want made of it, and Claude starts on it in the panel.
// Everything but one of the two (a video or a name) is optional: a name alone makes an empty film.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useStore } from '../store';
import { startChat } from '../chat';

/** Whether the sheet is up: the top bar's project list and the menu bar's File ▸ New Project both open it. */
export const useNewProject = create<{ open: boolean }>(() => ({ open: false }));

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
const nameFrom = (path: string) => fileName(path).replace(/\.[^.]+$/, '');
// Electron wraps a main-process error in its own words; show the reason alone.
const reason = (e: unknown) => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

export function NewProject({ onClose }: { onClose: () => void }) {
  const [paths, setPaths] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  const add = (more: string[]) => { setError(null); setPaths((old) => [...old, ...more.filter((p) => p && !old.includes(p))]); };
  const ready = !busy && (paths.length > 0 || !!name.trim());

  const start = async () => {
    if (!ready) return;
    setBusy(true); setError(null);
    try {
      const { project, media } = await window.vibe.startProject(name, paths);
      const st = useStore.getState();
      await st.refreshInfo();
      await st.openProject(project);
      st.setRoom('edit');
      if (ask.trim()) await startChat(project, ask, media);
      onClose();
    } catch (e) { setError(reason(e)); setBusy(false); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="sheet-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="sheet" onSubmit={(e) => { e.preventDefault(); start(); }}
        onDragOver={(e) => { e.preventDefault(); setDropping(true); }} onDragLeave={() => setDropping(false)}
        onDrop={(e) => { e.preventDefault(); setDropping(false); add([...e.dataTransfer.files].map((f) => window.vibe.pathForFile(f))); }}>
        <h2>New project</h2>

        <div className={`sheet-drop ${dropping ? 'on' : ''}`}>
          {paths.map((p) => (
            <div key={p} className="sheet-file" title={p}>
              <span>{fileName(p)}</span>
              <button type="button" disabled={busy} onClick={() => setPaths(paths.filter((x) => x !== p))} aria-label={`Remove ${fileName(p)}`}>×</button>
            </div>
          ))}
          <p className="muted">{paths.length ? 'Drop more here, or' : 'Drop the video you want to edit here, or'}{' '}
            <button type="button" className="sheet-link" disabled={busy} onClick={async () => add(await window.vibe.pickMedia())}>choose a file…</button>
          </p>
        </div>

        <label className="sheet-field">
          <span>Name</span>
          <input autoFocus value={name} disabled={busy} placeholder={paths[0] ? nameFrom(paths[0]) : 'New project name'}
            onChange={(e) => { setName(e.target.value); setError(null); }} />
        </label>

        <label className="sheet-field">
          <span>What should Claude make of it?</span>
          <textarea dir="auto" rows={4} value={ask} disabled={busy}
            placeholder="Cut the pauses, add captions, and open with a hook…"
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); start(); } }} />
        </label>
        <p className="hint">{ask.trim() ? 'Claude starts on this in the panel, and you carry on the conversation there.' : 'Leave this empty to start on your own; Claude is one ⌘L away.'}</p>

        <div className="sheet-foot">
          {error && <span className="bad">{error}</span>}
          <span className="spacer" />
          <button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!ready}>{busy ? (paths.length ? 'Copying the video…' : 'Starting…') : 'Start'}</button>
        </div>
      </form>
    </div>
  );
}
