import { describe, expect, it } from 'vitest';
import { ChatReader, toolLabel } from '../../src/main/chat-events';
import type { ChatState } from '../../src/shared/api';

const ROOT = '/Users/me/Vibe';
const SESSION = '11111111-2222-4333-8444-555555555555';
const fresh = (): ChatState => ({ sessionId: null, items: [], busy: true });
const feed = (state: ChatState, ...msgs: unknown[]) => {
  const r = new ChatReader(ROOT);
  for (const m of msgs) r.read(state, JSON.stringify(m));
  return r;
};

// The shapes Claude Code prints with --output-format stream-json --verbose --include-partial-messages.
const ev = (event: unknown, parent: string | null = null) => ({ type: 'stream_event', event, parent_tool_use_id: parent, session_id: 's1' });
const assistant = (id: string, content: unknown[], extra: object = {}) =>
  ({ type: 'assistant', message: { id, role: 'assistant', content }, parent_tool_use_id: null, session_id: 's1', ...extra });
const toolResult = (id: string, content: string, is_error = false) =>
  ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error }] }, parent_tool_use_id: null });

describe('ChatReader', () => {
  it('keeps the session id from the init message', () => {
    const s = fresh();
    feed(s, { type: 'system', subtype: 'init', session_id: SESSION, cwd: ROOT });
    expect(s.sessionId).toBe(SESSION);
  });

  it("refuses a session id that isn't one, so it can't become a flag on the next run", () => {
    const s = fresh();
    feed(s,
      { type: 'system', subtype: 'init', session_id: '--dangerously-skip-permissions' },
      { type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: '--resume', permission_denials: [] },
    );
    expect(s.sessionId).toBeNull();
  });

  it('streams text into one item as it arrives', () => {
    const s = fresh();
    feed(s,
      ev({ type: 'message_start', message: { id: 'm1' } }),
      ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Moved the ' } }),
      ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'stat up.' } }),
      ev({ type: 'content_block_stop', index: 0 }),
    );
    expect(s.items).toEqual([{ kind: 'text', text: 'Moved the stat up.' }]);
  });

  it("doesn't repeat streamed text when the whole message arrives", () => {
    const s = fresh();
    feed(s,
      ev({ type: 'message_start', message: { id: 'm1' } }),
      ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
      ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done.' } }),
      ev({ type: 'content_block_stop', index: 0 }),
      assistant('m1', [{ type: 'text', text: 'Done.' }]),
    );
    expect(s.items).toEqual([{ kind: 'text', text: 'Done.' }]);
  });

  it('shows the text of a message that was never streamed', () => {
    const s = fresh();
    feed(s, assistant('m2', [{ type: 'text', text: 'Hello.' }]));
    expect(s.items).toEqual([{ kind: 'text', text: 'Hello.' }]);
  });

  it('adds a running line for a tool call and marks it done on its result', () => {
    const s = fresh();
    feed(s, assistant('m1', [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: `${ROOT}/projects/demo.vibe/vibe.json` } }]));
    expect(s.items).toEqual([{ kind: 'tool', id: 't1', label: 'Edited projects/demo.vibe/vibe.json', state: 'running' }]);
    feed(s, toolResult('t1', 'ok'));
    expect(s.items[0]).toMatchObject({ state: 'done' });
  });

  it('marks a failed tool and keeps the first line of why', () => {
    const s = fresh();
    feed(s,
      assistant('m1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'vibe check demo' } }]),
      toolResult('t1', 'Exit code 1\ngraphics/g3: unknown component', true),
    );
    expect(s.items[0]).toMatchObject({ state: 'error', detail: 'Exit code 1' });
  });

  it('gives a result to the latest tool call with its id, not one from an earlier turn', () => {
    const s = fresh();
    feed(s, assistant('m1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'vibe check demo' } }]), toolResult('t1', 'ok'));
    feed(s, assistant('m2', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'vibe check demo' } }]), toolResult('t1', 'Exit code 1', true));
    expect(s.items.map((i) => i.kind === 'tool' && i.state)).toEqual(['done', 'error']);
  });

  it("leaves out what a helper agent does inside its own task", () => {
    const s = fresh();
    feed(s,
      ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'inner' } }, 'task1'),
      { ...assistant('m9', [{ type: 'text', text: 'inner' }]), parent_tool_use_id: 'task1' },
    );
    expect(s.items).toEqual([]);
  });

  it('shows an API error, such as an expired login, as an error note once', () => {
    const s = fresh();
    const text = 'Failed to authenticate: this login reached its time limit. Run `claude auth login` to sign in again';
    feed(s,
      assistant('m1', [{ type: 'text', text }], { error: 'authentication_failed', is_api_error_message: true }),
      { type: 'result', subtype: 'success', is_error: true, result: text, session_id: 's1', permission_denials: [] },
    );
    expect(s.items).toEqual([{ kind: 'note', tone: 'error', text }]);
  });

  it('says what the turn failed on when only the result says so', () => {
    const s = fresh();
    feed(s, { type: 'result', subtype: 'error_max_turns', is_error: true, session_id: 's1', permission_denials: [] });
    expect(s.items).toEqual([{ kind: 'note', tone: 'error', text: 'Claude stopped: error_max_turns' }]);
  });

  it('lists the commands Claude Code refused, so you can run them', () => {
    const s = fresh();
    feed(s, {
      type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: SESSION,
      permission_denials: [{ tool_name: 'Bash', tool_use_id: 't1', tool_input: { command: 'vibe render demo' } }],
    });
    expect(s.sessionId).toBe(SESSION);
    expect(s.items).toEqual([{ kind: 'note', tone: 'info', text: 'Not allowed from the app: `vibe render demo`. Run it in a terminal, or allow it in your Claude Code permissions.' }]);
  });

  it('ignores lines that are not JSON and messages it does not show', () => {
    const s = fresh();
    const r = new ChatReader(ROOT);
    r.read(s, 'not json');
    r.read(s, JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: 'x' }));
    r.read(s, JSON.stringify(ev({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hm' } })));
    expect(s.items).toEqual([]);
    expect(r.sawResult).toBe(false);
  });

  it('notices a resumed conversation that no longer exists, without calling it an error', () => {
    const s: ChatState = { sessionId: SESSION, items: [], busy: true };
    const r = feed(s, {
      type: 'result', subtype: 'error_during_execution', is_error: true, session_id: '00000000-0000-4000-8000-000000000000',
      errors: ['No conversation found with session ID: 00000000-0000-4000-8000-000000000000'],
    });
    expect(r.sessionMissing).toBe(true);
    expect(s.items).toEqual([]);
    expect(s.sessionId).toBe(SESSION);
  });

  it('knows when the turn has a result', () => {
    const s = fresh();
    const r = feed(s, { type: 'result', subtype: 'success', is_error: false, result: 'ok', session_id: 's1', permission_denials: [] });
    expect(r.sawResult).toBe(true);
  });
});

describe('toolLabel', () => {
  it('names files inside the workspace by their workspace path', () => {
    expect(toolLabel('Read', { file_path: `${ROOT}/library/brand.json` }, ROOT)).toBe('Read library/brand.json');
    expect(toolLabel('Write', { file_path: `${ROOT}/library/styles/x/style.js` }, ROOT)).toBe('Wrote library/styles/x/style.js');
  });

  it('shows the first line of a command, cut short', () => {
    expect(toolLabel('Bash', { command: 'vibe snapshot demo --at 1,4\necho done' }, ROOT)).toBe('Ran vibe snapshot demo --at 1,4');
    expect(toolLabel('Bash', { command: 'x'.repeat(200) }, ROOT)).toHaveLength(4 + 80);
  });

  it('describes searches and falls back to the tool name', () => {
    expect(toolLabel('Grep', { pattern: 'place\\(' }, ROOT)).toBe('Searched for place\\(');
    expect(toolLabel('Glob', { pattern: 'library/**/*.json' }, ROOT)).toBe('Looked for library/**/*.json');
    expect(toolLabel('mcp__thing__do_it', {}, ROOT)).toBe('Used do_it');
  });
});
