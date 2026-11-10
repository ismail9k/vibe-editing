// The Claude panel's back end: runs the user's own Claude Code (`claude -p`, headless) in the workspace, one process
// per message, and keeps each project's conversation in projects/<p>.vibe/.vibe/chat.json. Claude edits files on disk
// as it does from a terminal, so the watcher shows its changes live. No Electron here: index.ts wires it to the window.
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ChatContext, ChatState, ChatUpdate } from '../shared/api';
import { projectDir } from '../core/model';
import { ChatReader, isSessionId } from './chat-events';
import { readText, writeText } from './workspace';
import { TOOL_DIRS, withToolDirs } from './tool-path';

// Told once per conversation (Claude Code keeps the system prompt it started with).
const APP_PROMPT = [
  "You're talking with the user from the Claude panel inside the Vibe Editing app, not from a terminal.",
  'The app shows the workspace live, so they watch your file changes land as you make them: keep replies short and say what you changed.',
  "Each message starts with a bracketed line the app adds, saying what they have open; they didn't type it.",
  "Nobody can answer a permission prompt here. If a command is refused, give them the command so they can run it themselves.",
].join(' ');

// Nobody can answer a permission prompt here, so the grants stay narrow. acceptEdits already lets file edits and
// cp/mkdir/mv/touch/rm/sed through, but only inside the workspace; the one command added is the app's own CLI, which
// the workspace guide (presets/CLAUDE.md) is built around. A blanket `Bash(cp *)` would reach the whole disk.
// Anything else that would ask is refused (--permission-prompts none), and the panel says what.
const ALLOWED = ['Bash(vibe *)'];

// Where Claude Code's own installers put it. An npm copy left behind in /usr/local/bin stops updating once the
// native install takes over, so these go ahead of the Homebrew folders.
const CLAUDE_DIRS = [join(homedir(), '.local/bin'), join(homedir(), '.claude/local')];

// What a Claude Code from before --permission-prompts says about it. Headless, it refuses what it would have
// asked about anyway, so the turn runs again without the flag.
const NO_PROMPTS_FLAG = /unknown option '--permission-prompts'/;

const STOP_GRACE_MS = 3000;
const STDERR_KEEP = 2000;

export function claudeArgs(sessionId: string | null, o: { prompts?: boolean } = {}): string[] {
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--permission-mode', 'acceptEdits', ...(o.prompts === false ? [] : ['--permission-prompts', 'none']),
    '--allowedTools', ALLOWED.join(' '),
    '--append-system-prompt', APP_PROMPT,
    // Bound to its flag: --resume takes an optional value, so a separate argument could be read as an option.
    ...(isSessionId(sessionId) ? [`--resume=${sessionId}`] : []),
  ];
}

/** The line in front of every message: what's open in the app right now. */
export function contextLine(project: string, ctx: ChatContext): string {
  const parts = ['Sent from the Vibe Editing app', `project ${project} (${projectDir(project)})`];
  if (ctx.room === 'edit') {
    parts.push('Edit room', `playhead ${ctx.playhead.toFixed(2)} s`);
    if (ctx.selection) parts.push(`selected ${ctx.selection.track} ${ctx.selection.id}`);
  } else {
    parts.push('Studio room');
    if (ctx.focus) parts.push(`looking at ${ctx.focus}`);
  }
  return `[${parts.join(' · ')}]`;
}

/** The child's environment. A Finder-launched app has a bare PATH, so add where Claude Code's installers put it
 *  (ahead of the Homebrew folders, unless the user's PATH already places them), and put `binDir` (the app's own
 *  `vibe`, see vibeShim) first.
 *  Started from inside a Claude Code session (`npm run dev` in its terminal), the app inherits that session's
 *  plumbing (a proxy base URL, a "simple mode" flag, its session ids), which would change how our claude runs. */
export function claudeEnv(env: NodeJS.ProcessEnv, binDir?: string): NodeJS.ProcessEnv {
  const parts = [...(binDir ? [binDir] : []), ...(env.PATH ?? '').split(':').filter(Boolean)];
  const at = parts.findIndex((p) => TOOL_DIRS.includes(p));
  parts.splice(at < 0 ? parts.length : at, 0, ...CLAUDE_DIRS.filter((d) => !parts.includes(d)));
  const out: NodeJS.ProcessEnv = { ...env, PATH: withToolDirs(parts.join(':')) };
  if (env.CLAUDECODE) {
    for (const k of Object.keys(out)) if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_')) delete out[k];
    delete out.ANTHROPIC_BASE_URL;
  }
  return out;
}

/** The `vibe` command the panel's Claude runs: this copy of the app in CLI mode, as bin/vibe.mjs does. The user's
 *  own `vibe` (npm link) sits on an nvm or npm PATH that a Finder-launched app never sees, and may be another
 *  version. `appPath` is the app folder when it runs from the repo (Electron needs it), null when packaged. */
export function vibeShim(execPath: string, appPath: string | null): string {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  return [
    '#!/bin/sh',
    '# Written by Vibe Editing for its Claude panel: runs this copy of the app\'s CLI.',
    'unset ELECTRON_RUN_AS_NODE ELECTRON_RENDERER_URL',
    `exec ${q(execPath)}${appPath ? ` ${q(appPath)}` : ''} --cli "$@"`,
    '',
  ].join('\n');
}

export interface ChatsOptions {
  root: string;
  onUpdate(u: ChatUpdate): void;
  /** `claude` unless $VIBE_CLAUDE names another (tests use a stand-in). */
  command?: string;
  /** Where the app's own `vibe` is (vibeShim), put first on claude's PATH. */
  binDir?: string;
  /** How often a streaming turn sends the window an update. */
  throttleMs?: number;
}

interface Run { child: ChildProcess; stopped: boolean; done: Promise<void> }

export class Chats {
  private states = new Map<string, ChatState>();
  private runs = new Map<string, Run>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private command: string;
  /** False once this claude has refused --permission-prompts, so later turns don't start twice. */
  private promptsFlag = true;

  constructor(private o: ChatsOptions) {
    this.command = o.command ?? (process.env.VIBE_CLAUDE || 'claude');
  }

  state(project: string): ChatState {
    let s = this.states.get(project);
    if (!s) { s = this.load(project); this.states.set(project, s); }
    return s;
  }

  /** Runs one turn; resolves when it ends. A message sent while a turn runs is ignored (the panel shows Stop). */
  async send(project: string, text: string, ctx: ChatContext): Promise<void> {
    const s = this.state(project);
    if (s.busy) return;
    s.items.push({ kind: 'user', text });
    s.busy = true;
    this.save(project);
    this.emit(project);
    await this.run(project, `${contextLine(project, ctx)}\n\n${text}`);
  }

  stop(project: string) {
    const run = this.runs.get(project);
    if (!run) return;
    run.stopped = true;
    run.child.kill('SIGINT');
    const t = setTimeout(() => { if (run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGTERM'); }, STOP_GRACE_MS);
    run.done.then(() => clearTimeout(t));
  }

  reset(project: string): ChatState {
    this.stop(project);
    const s: ChatState = { sessionId: null, items: [], busy: false };
    this.states.set(project, s);
    this.save(project);
    return s;
  }

  stopAll() { for (const p of this.runs.keys()) this.stop(p); }

  private run(project: string, prompt: string): Promise<void> {
    const s = this.state(project);
    const resumed = s.sessionId;
    const reader = new ChatReader(this.o.root);
    let stderr = '';
    const child = spawn(this.command, claudeArgs(resumed, { prompts: this.promptsFlag }), { cwd: this.o.root, env: claudeEnv(process.env, this.o.binDir), stdio: ['pipe', 'pipe', 'pipe'] });
    let finish!: () => void;
    const run: Run = { child, stopped: false, done: new Promise<void>((r) => { finish = r; }) };
    this.runs.set(project, run);

    child.stdin!.on('error', () => {}); // claude may exit before reading the prompt; its exit says why
    child.stdin!.end(prompt);
    createInterface({ input: child.stdout! }).on('line', (line) => { reader.read(s, line); this.schedule(project); });
    child.stderr!.on('data', (d) => { stderr = (stderr + d).slice(-STDERR_KEEP); });

    let ended = false;
    const end = async (why: { code?: number | null; signal?: string | null; spawnError?: NodeJS.ErrnoException }) => {
      if (ended) return;
      ended = true;
      this.runs.delete(project);
      if (!run.stopped && resumed && (reader.sessionMissing || (!reader.sawResult && /no conversation found/i.test(stderr)))) {
        s.sessionId = null;
        s.items.push({ kind: 'note', tone: 'info', text: "The earlier conversation wasn't found, so this is a new one." });
        await this.run(project, prompt);
        finish();
        return;
      }
      if (!run.stopped && !reader.sawResult && this.promptsFlag && NO_PROMPTS_FLAG.test(stderr)) {
        this.promptsFlag = false;
        await this.run(project, prompt);
        finish();
        return;
      }
      const failed = run.stopped || !reader.sawResult;
      for (const i of s.items) if (i.kind === 'tool' && i.state === 'running') i.state = failed ? 'error' : 'done';
      if (run.stopped) s.items.push({ kind: 'note', tone: 'info', text: 'Stopped.' });
      else if (why.spawnError) s.items.push({ kind: 'note', tone: 'error', text: spawnMessage(why.spawnError, this.command) });
      else if (!reader.sawResult) {
        const how = why.signal ? `signal ${why.signal}` : `exit code ${why.code}`;
        const tail = stderr.trim().split('\n').slice(-3).join('\n');
        s.items.push({ kind: 'note', tone: 'error', text: `Claude Code stopped (${how})${tail ? `: ${tail}` : ''}` });
      }
      s.busy = false;
      this.save(project);
      this.emit(project);
      finish();
    };
    child.on('error', (e) => end({ spawnError: e }));
    child.on('close', (code, signal) => end({ code, signal }));
    return run.done;
  }

  private schedule(project: string) {
    if (!this.o.throttleMs) { this.emit(project); return; }
    if (this.timers.has(project)) return;
    this.timers.set(project, setTimeout(() => this.emit(project), this.o.throttleMs));
  }

  private emit(project: string) {
    const t = this.timers.get(project);
    if (t) { clearTimeout(t); this.timers.delete(project); }
    this.o.onUpdate({ project, state: this.state(project) });
  }

  private rel = (project: string) => `${projectDir(project)}/.vibe/chat.json`;

  private load(project: string): ChatState {
    try {
      const j = JSON.parse(readText(this.o.root, this.rel(project)) ?? 'null');
      if (j && Array.isArray(j.items)) return { sessionId: isSessionId(j.sessionId) ? j.sessionId : null, items: j.items, busy: false };
    } catch { /* a broken chat.json starts a new conversation */ }
    return { sessionId: null, items: [], busy: false };
  }

  private save(project: string) {
    const s = this.state(project);
    writeText(this.o.root, this.rel(project), JSON.stringify({ sessionId: s.sessionId, items: s.items }, null, 2) + '\n');
  }
}

function spawnMessage(e: NodeJS.ErrnoException, command: string): string {
  if (e.code === 'ENOENT') return `Couldn't find Claude Code (\`${command}\`). Install Claude Code from claude.com/claude-code and sign in, or set VIBE_CLAUDE to where it is.`;
  return `Couldn't start Claude Code: ${e.message}`;
}
