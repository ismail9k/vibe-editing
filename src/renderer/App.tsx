import { useEffect } from 'react';
import { flushSave, useStore } from './store';
import { cancelWriteLater, flushWriteLater } from './writeLater';
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
    const offOpen = window.vibe.onOpenProject(async (name) => {
      if (name === useStore.getState().projectName) return;
      await useStore.getState().refreshInfo(); // a project made since the app started isn't in the list yet
      await useStore.getState().openProject(name);
    });
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
      const json = s.projectName + JSON.stringify(session); // a switched-to project gets its own session.json
      if (json === lastJson || s.playing) return;
      lastJson = json;
      if (timer) clearTimeout(timer);
      const name = s.projectName;
      timer = setTimeout(() => window.vibe.writeSession(name, { ...session, updatedAt: new Date().toISOString() }), 500);
    });
    // Closing the window inside a save's 300 ms delay would lose the last edit: send it now (the write request
    // leaves before the page goes away).
    const onUnload = () => { flushSave(); flushWriteLater(); };
    window.addEventListener('beforeunload', onUnload);
    // A file dropped anywhere the Edit room doesn't take it would make the window navigate to the file and lose the
    // app. Refuse it there (no copy cursor), and never navigate.
    const noDrop = (e: DragEvent) => {
      if (e.defaultPrevented) return; // the Edit room took it
      if (!e.dataTransfer?.types.includes('Files')) return; // text dragged into a field still works
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', noDrop);
    window.addEventListener('drop', noDrop);
    return () => {
      offChange(); offOpen(); offExport(); offMatte(); offSession();
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('dragover', noDrop);
      window.removeEventListener('drop', noDrop);
    };
  }, []);

  return (
    <div className="app">
      <TopBar />
      {room === 'studio' ? <Studio /> : <Edit />}
    </div>
  );
}
