// The window's side of the Mac menu bar: does what a menu item asks, the way the app's own buttons and keys do,
// and tells the main process what's open so the menu can tick and grey the right items.
import * as ops from '../core/ops';
import { duration } from '../core/model';
import type { MenuCommand, MenuState } from '../shared/api';
import { setChatOpen, useChat } from './chat';
import { duplicateSelected, startExport, togglePlay } from './rooms/Edit';
import { useStore } from './store';
import { addImported } from './ui/LibraryPanel';
import { useNewProject } from './ui/NewProject';

const typing = () => { const el = document.activeElement; return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement; };

export async function runMenuCommand(c: MenuCommand) {
  const st = useStore.getState(), name = st.projectName;
  if (c.startsWith('open:')) { await st.refreshInfo(); return st.openProject(c.slice('open:'.length)); }
  switch (c) {
    case 'new-project': return useNewProject.setState({ open: true });
    case 'import-media':
      if (!name) return;
      st.setRoom('edit');
      try { addImported(await window.vibe.importMedia(name)); } catch (e) { alert((e as Error).message); }
      return;
    case 'export': return name ? startExport(name) : undefined;
    // In a text field these are the field's own undo; anywhere else, the film's.
    case 'undo': return typing() ? void document.execCommand('undo') : st.undo();
    case 'redo': return typing() ? void document.execCommand('redo') : st.redo();
    case 'duplicate': return duplicateSelected();
    case 'delete': { const s = st.selection; if (s) { st.apply((p) => ops.deleteItem(p, s.track, s.id)); st.select(null); } return; }
    case 'split': return st.apply((p) => ops.splitFootage(p, st.playhead));
    case 'play': return togglePlay();
    case 'start': return st.seek(0);
    case 'end': return st.project ? st.seek(duration(st.project)) : undefined;
    case 'room:studio': return st.setRoom('studio');
    case 'room:edit': return st.setRoom('edit');
    case 'toggle-chat': return setChatOpen(!useChat.getState().open);
  }
}

/** Listens for menu commands and keeps the menu's ticks in step; returns the unsubscribe. Call once from App. */
export function initMenu(): () => void {
  let last = '';
  const report = () => {
    const s = useStore.getState();
    const state: MenuState = { projects: s.info?.projects ?? [], project: s.projectName, room: s.room, chatOpen: useChat.getState().open, selected: !!s.selection };
    const key = JSON.stringify(state);
    if (key === last) return;
    last = key;
    window.vibe.menuState(state);
  };
  report();
  const offs = [window.vibe.onMenu(runMenuCommand), useStore.subscribe(report), useChat.subscribe(report)];
  return () => offs.forEach((off) => off());
}
