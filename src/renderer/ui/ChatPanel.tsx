// The Claude panel: talk to Claude Code from inside the app. Its replies stream in, each file it touches or command it
// runs shows as one line, and its edits land in the workspace, so the preview updates as it works.
import { Fragment, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { ChatItem } from '../../shared/api';
import { resetChat, sendChat, setChatOpen, stopChat, useChat } from '../chat';
import { parseMarkdown, type Block, type Inline } from './markdown';

const STARTERS = ['Check this film for problems', 'Make the hook land in the first second', 'Add a whoosh under each graphic'];

export function ChatPanel() {
  const { project, state, draft } = useChat();
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const items = state?.items ?? [];
  const busy = !!state?.busy;

  // Follow the reply as it streams, unless you've scrolled up to read something.
  useLayoutEffect(() => { const el = log.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [state]);
  useLayoutEffect(() => { input.current?.focus(); }, [project]);
  useLayoutEffect(() => { // grow with the text, up to about eight lines
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const send = () => { stick.current = true; sendChat(draft); };
  const working = busy && items.at(-1)?.kind !== 'text';

  return (
    <aside className="chat">
      <header className="chat-head">
        <b>Claude</b>
        {project && <span className="muted chat-project">{project}</span>}
        <span className="spacer" />
        <button className="ghost chat-small" onClick={resetChat} disabled={!items.length || busy} title="Forget this conversation and start a new one">New chat</button>
        <button className="chat-close" onClick={() => setChatOpen(false)} title="Close (⌘L)" aria-label="Close">×</button>
      </header>

      <div className="chat-log" ref={log} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {!project && <p className="muted">Open a project to talk to Claude about it.</p>}
        {project && !items.length && (
          <div className="chat-intro">
            <p>Ask for a change in plain words. Claude edits the files in your workspace, and you'll see each change here as it lands.</p>
            <p className="muted">It knows which room you're in, where the playhead is and what you've selected.</p>
            <div className="chat-starters">
              {STARTERS.map((s) => <button key={s} className="chip chip-button" onClick={() => { useChat.setState({ draft: s }); input.current?.focus(); }}>{s}</button>)}
            </div>
          </div>
        )}
        {items.map((item, i) => <Item key={i} item={item} />)}
        {working && <div className="chat-working">Claude is working<span className="dots" /></div>}
      </div>

      <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          ref={input} dir="auto" rows={1} value={draft} disabled={!project}
          placeholder={busy ? 'Claude is working…' : 'Ask Claude to change the film…'}
          onChange={(e) => useChat.setState({ draft: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) send(); } }}
        />
        {busy
          ? <button type="button" className="chat-stop" onClick={stopChat} title="Stop Claude">Stop</button>
          : <button type="submit" className="chat-send" disabled={!draft.trim() || !project}>Send</button>}
      </form>
    </aside>
  );
}

function Item({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case 'user': return <div className="msg user" dir="auto">{item.text}</div>;
    case 'text': return <div className="msg claude" dir="auto"><Markdown text={item.text} /></div>;
    case 'tool': return (
      <div className={`tool ${item.state}`} title={item.detail ?? item.label}>
        <i />{item.label}
        {item.detail && <span className="tool-detail">{item.detail}</span>}
      </div>
    );
    case 'note': return <div className={`chat-note ${item.tone}`} dir="auto"><Markdown text={item.text} /></div>;
  }
}

function Markdown({ text }: { text: string }) {
  return <>{parseMarkdown(text).map((b, i) => <MdBlock key={i} b={b} />)}</>;
}

function MdBlock({ b }: { b: Block }) {
  switch (b.t) {
    case 'p': return <p>{inl(b.v)}</p>;
    case 'h': return <p className="md-h">{inl(b.v)}</p>;
    case 'quote': return <blockquote>{inl(b.v)}</blockquote>;
    case 'code': return <pre dir="ltr"><code>{b.v}</code></pre>;
    case 'list': {
      const items = b.items.map((it, i) => <li key={i}>{inl(it)}</li>);
      return b.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
  }
}

// Links show as text: clicking one would navigate the app window away from the editor.
function inl(v: Inline[]): ReactNode {
  return v.map((x, i) => {
    switch (x.t) {
      case 'text': return <Fragment key={i}>{x.v}</Fragment>;
      case 'br': return <br key={i} />;
      case 'code': return <code key={i}>{x.v}</code>;
      case 'bold': return <strong key={i}>{inl(x.v)}</strong>;
      case 'em': return <em key={i}>{inl(x.v)}</em>;
      case 'link': return <span key={i} className="md-link" title={x.href}>{x.v}</span>;
    }
  });
}
