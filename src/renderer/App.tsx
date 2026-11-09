import { useEffect } from 'react';
import { useStore } from './store';
import { cancelWriteLater } from './writeLater';
import { TopBar } from './ui/TopBar';
import { Studio } from './rooms/Studio';
import { Edit } from './rooms/Edit';

if (import.meta.env.DEV) (window as unknown as { __store: typeof useStore }).__store = useStore;

export function App() {
  const room = useStore((s) => s.room);

  useEffect(() => {
    const st = useStore.getState();
    st.boot();
    const offChange = window.vibe.onChange((c) => { cancelWriteLater(c.rel); useStore.getState().onDiskChange(c); });
    const offExport = window.vibe.onExportProgress((p) => useStore.setState({ exporting: p }));
    const offMatte = window.vibe.onMatteProgress((p) => {
      if (p.project !== useStore.getState().projectName) return;
      useStore.setState((s) => ({ mattes: { state: 'working', src: p.src, done: p.done, total: p.total, version: s.mattes?.version ?? 0 } }));
    });
    // Tell Claude what he's looking at: .vibe/session.json in the open project.
    let timer: ReturnType<typeof setTimeout> | null = null, lastJson = '';
    const offSession = useStore.subscribe((s) => {
      if (!s.projectName || !s.project) return;
      const session = { room: s.room, selection: s.selection, playhead: +s.playhead.toFixed(2), style: s.project.style, studio: { style: s.studio.style, mode: s.studio.mode, dir: s.studio.dir, focus: s.studio.focus } };
      const json = JSON.stringify(session);
      if (json === lastJson || s.playing) return;
      lastJson = json;
      if (timer) clearTimeout(timer);
      const name = s.projectName;
      timer = setTimeout(() => window.vibe.writeSession(name, { ...session, updatedAt: new Date().toISOString() }), 500);
    });
    return () => { offChange(); offExport(); offMatte(); offSession(); };
  }, []);

  return (
    <div className="app">
      <TopBar />
      {room === 'studio' ? <Studio /> : <Edit />}
    </div>
  );
}
