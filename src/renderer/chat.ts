// The Claude panel's state in the window: whether it's open, and the open project's conversation, which lives in the
// main process (src/main/chat.ts) and streams in through onChat.
import { MAIN_BRAND } from '../core/brand';
import { create } from 'zustand';
import type { ChatContext, ChatState } from '../shared/api';
import { useStore } from './store';

interface ChatUi {
  open: boolean;
  project: string | null;
  state: ChatState | null;
  draft: string;
}

export const useChat = create<ChatUi>(() => ({ open: false, project: null, state: null, draft: '' }));

export function setChatOpen(open: boolean) {
  useChat.setState({ open });
  window.vibe.setChatPanelOpen(open); // remembered for the next launch
}

/** Follows the open project and Claude's updates; returns the unsubscribe. Call once from App. */
export function initChat(): () => void {
  const load = async (project: string | null) => {
    useChat.setState({ project, state: null });
    if (!project) return;
    const state = await window.vibe.chatState(project);
    if (useChat.getState().project === project) useChat.setState({ state });
  };
  load(useStore.getState().projectName);
  window.vibe.chatPanelOpen().then((open) => { if (open) useChat.setState({ open }); });
  const offProject = useStore.subscribe((s, prev) => { if (s.projectName !== prev.projectName) load(s.projectName); });
  const offChat = window.vibe.onChat((u) => { if (u.project === useChat.getState().project) useChat.setState({ state: u.state }); });
  // ⌘L opens and closes the panel (and puts the cursor in it).
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'l') return;
    e.preventDefault();
    setChatOpen(!useChat.getState().open);
  };
  window.addEventListener('keydown', onKey);
  return () => { offProject(); offChat(); window.removeEventListener('keydown', onKey); };
}

/** What's open in the app, sent with each message so "this one" and "here" mean something. */
function context(): ChatContext {
  const s = useStore.getState(), f = s.studio.focus;
  return {
    room: s.room, playhead: s.playhead, selection: s.selection,
    focus: !f ? null : f.kind === 'brand' ? (f.id === MAIN_BRAND ? 'the brand' : `brand ${f.id}`) : `${f.kind} ${f.id}`,
  };
}

export async function sendChat(text: string) {
  const { project, state } = useChat.getState();
  if (!project || !text.trim() || state?.busy) return;
  useChat.setState({ draft: '' });
  await window.vibe.chatSend(project, text.trim(), context());
}

export function stopChat() {
  const { project } = useChat.getState();
  if (project) window.vibe.chatStop(project);
}

export async function resetChat() {
  const { project } = useChat.getState();
  if (!project) return;
  const state = await window.vibe.chatReset(project);
  if (useChat.getState().project === project) useChat.setState({ state });
}
