// Turns the JSON lines Claude Code prints (`claude -p --output-format stream-json --verbose --include-partial-messages`)
// into the entries the Claude panel shows: streamed text, one line per tool call, and notes for errors and refusals.
// Thinking and what helper agents do inside their own task are left out: the panel is for what Claude did, not how.
import { homedir } from 'node:os';
import type { ChatItem, ChatState } from '../shared/api';

type Json = Record<string, any>;

const COMMAND_MAX = 80;

// A Claude Code session id is a UUID. Nothing else may become one: the id goes on claude's command line, and a
// project someone sends you carries its own .vibe/chat.json, so "--dangerously-skip-permissions" must stay data.
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isSessionId = (v: unknown): v is string => typeof v === 'string' && SESSION_ID.test(v);

/** Reads one turn's lines into a project's chat. Keep one per turn: it remembers which messages were streamed. */
export class ChatReader {
  /** The turn ended with a result message (a turn that dies without one needs its own note). */
  sawResult = false;
  /** The conversation it was told to resume doesn't exist (deleted, or made on another machine): start a new one. */
  sessionMissing = false;
  private streamed = new Set<string>();
  private open: { kind: 'text'; text: string } | null = null;
  private sawError = false;

  constructor(private root: string) {}

  read(state: ChatState, line: string): void {
    let m: Json;
    try { m = JSON.parse(line); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.parent_tool_use_id) return; // inside a helper agent's task
    if (m.type === 'system' && m.subtype === 'init' && isSessionId(m.session_id)) state.sessionId = m.session_id;
    else if (m.type === 'stream_event') this.stream(state, m.event ?? {});
    else if (m.type === 'assistant') this.assistant(state, m);
    else if (m.type === 'user') this.toolResults(state, m.message?.content);
    else if (m.type === 'result') this.result(state, m);
  }

  private stream(state: ChatState, e: Json) {
    if (e.type === 'message_start' && e.message?.id) this.streamed.add(e.message.id);
    else if (e.type === 'content_block_start' && e.content_block?.type === 'text') this.open = this.push(state, { kind: 'text', text: e.content_block.text ?? '' });
    else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') {
      if (!this.open) this.open = this.push(state, { kind: 'text', text: '' });
      this.open.text += e.delta.text ?? '';
    } else if (e.type === 'content_block_stop' && this.open) {
      if (!this.open.text) state.items.splice(state.items.indexOf(this.open), 1);
      this.open = null;
    }
  }

  private assistant(state: ChatState, m: Json) {
    const content: Json[] = Array.isArray(m.message?.content) ? m.message.content : [];
    if (m.error || m.is_api_error_message) {
      const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || String(m.error);
      this.push(state, { kind: 'note', tone: 'error', text });
      this.sawError = true;
      return;
    }
    const streamed = this.streamed.has(m.message?.id);
    for (const b of content) {
      if (b.type === 'text' && !streamed && b.text) this.push(state, { kind: 'text', text: b.text });
      else if (b.type === 'tool_use') this.push(state, { kind: 'tool', id: b.id, label: toolLabel(b.name, b.input ?? {}, this.root), state: 'running' });
    }
  }

  private toolResults(state: ChatState, content: unknown) {
    if (!Array.isArray(content)) return;
    for (const b of content as Json[]) {
      if (b.type !== 'tool_result') continue;
      const item = state.items.findLast((i): i is Extract<ChatItem, { kind: 'tool' }> => i.kind === 'tool' && i.id === b.tool_use_id);
      if (!item) continue;
      item.state = b.is_error ? 'error' : 'done';
      if (b.is_error) item.detail = firstLine(resultText(b.content));
    }
  }

  private result(state: ChatState, m: Json) {
    this.sawResult = true;
    if (m.is_error && Array.isArray(m.errors) && m.errors.some((e: unknown) => /no conversation found/i.test(String(e)))) {
      this.sessionMissing = true; // not an error to show: the runner starts a new conversation and says so
      return;
    }
    if (isSessionId(m.session_id)) state.sessionId = m.session_id;
    const denied: Json[] = Array.isArray(m.permission_denials) ? m.permission_denials : [];
    if (denied.length) {
      const what = denied.map((d) => `\`${toolTarget(d.tool_name, d.tool_input ?? {}, this.root)}\``).join(', ');
      this.push(state, { kind: 'note', tone: 'info', text: `Not allowed from the app: ${what}. Run it in a terminal, or allow it in your Claude Code permissions.` });
    }
    if (m.is_error && !this.sawError) {
      const why = typeof m.result === 'string' && m.result ? m.result : Array.isArray(m.errors) && m.errors.length ? m.errors.join('\n') : `Claude stopped: ${m.subtype}`;
      this.push(state, { kind: 'note', tone: 'error', text: why });
    }
  }

  private push<T extends ChatItem>(state: ChatState, item: T): T {
    state.items.push(item);
    return item;
  }
}

/** "Edited projects/demo.vibe/vibe.json", "Ran vibe check demo": one tool call in plain words. */
export function toolLabel(name: string, input: Json, root: string): string {
  const target = toolTarget(name, input, root);
  switch (name) {
    case 'Read': return `Read ${target}`;
    case 'Write': return `Wrote ${target}`;
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return `Edited ${target}`;
    case 'Bash': return `Ran ${target}`;
    case 'Grep': return `Searched for ${target}`;
    case 'Glob': return `Looked for ${target}`;
    case 'WebSearch': return `Searched the web for ${target}`;
    case 'WebFetch': return `Fetched ${target}`;
    case 'TodoWrite': return 'Updated its to-do list';
    case 'Task': case 'Agent': return `Asked a helper: ${target}`;
    case 'Skill': return `Used the ${target} skill`;
    default: return `Used ${target}`;
  }
}

/** The thing a tool call acts on: a workspace path, a command, a pattern. */
function toolTarget(name: string, input: Json, root: string): string {
  const path = input.file_path ?? input.notebook_path ?? input.path;
  if (name === 'Bash') return clip(firstLine(String(input.command ?? '')));
  if (typeof path === 'string' && name !== 'Grep' && name !== 'Glob') return shortPath(path, root);
  if (typeof input.pattern === 'string') return clip(input.pattern);
  if (typeof input.query === 'string') return clip(input.query);
  if (typeof input.url === 'string') return clip(input.url);
  if (typeof input.description === 'string') return clip(input.description);
  if (typeof input.skill === 'string') return input.skill;
  return name.startsWith('mcp__') ? name.split('__').slice(2).join('__') : name;
}

function shortPath(path: string, root: string): string {
  if (path.startsWith(root + '/')) return path.slice(root.length + 1);
  const home = homedir();
  return path.startsWith(home + '/') ? `~${path.slice(home.length)}` : path;
}

const firstLine = (s: string) => s.trim().split('\n')[0].trim();
const clip = (s: string) => (s.length > COMMAND_MAX ? s.slice(0, COMMAND_MAX - 1) + '…' : s);

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c: Json) => (typeof c?.text === 'string' ? c.text : '')).join('\n');
  return '';
}
