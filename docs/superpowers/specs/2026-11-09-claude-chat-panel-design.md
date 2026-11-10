# Talk to Claude from inside the app

## Why

Today Claude Code drives Vibe Editing from a terminal opened next to the app, in `~/Vibe`. Every request means leaving the editor, and the terminal doesn't know what's open, selected or under the playhead unless Claude reads `.vibe/session.json`. The goal is a chat panel in the app itself, so the editor is the one place you watch, nudge and ask.

## What it is

A Claude panel on the right of the window, in both rooms, opened from a **Claude** button in the top bar (or ⌘L). You type; Claude answers with streamed text, and every file it reads, edits or command it runs shows as one short line ("Edited projects/demo.vibe/vibe.json", "Ran vibe snapshot demo --at 1,4"). Its edits land on disk, so the app shows them live through the watcher, exactly as with a terminal session. A Stop button ends a turn; **New chat** starts over.

## How it works (decided)

- **Claude Code itself, not the API.** The main process runs the installed `claude` CLI headless (`claude -p --output-format stream-json --verbose --include-partial-messages`), with the workspace as its folder. It uses the user's existing Claude Code login, their settings and hooks, and the workspace `CLAUDE.md`. Nothing new ships in the app (no SDK, no native modules, no API key).
- **One process per message.** The prompt goes in on stdin; the first reply gives a session id, and later messages pass `--resume <id>`. Stop sends SIGINT (then SIGTERM). Simpler and sturdier than a long-lived process, at the cost of a second or two of start-up per message.
- **One conversation per project**, kept in `projects/<p>.vibe/.vibe/chat.json` (`sessionId` and the shown messages), next to `session.json`. Switching projects switches conversations. The watcher ignores `.vibe/`, so saving it doesn't reload anything. Whether the panel is open is remembered in `ui.json` in the app's data folder, written by the main process: localStorage turned out unreliable (Chromium writes it late, and can't open it at all while another copy of the app holds the profile).
- **What Claude knows about the app.** `--append-system-prompt` tells it once that it's talking from the app's panel and should keep replies short. Each message is sent with a one-line bracketed prefix the panel doesn't show: open project, room, playhead and selection, so "make this one bigger" works without a round trip to `session.json`.
- **Permissions.** Nobody can answer a permission prompt in headless mode, so: `--permission-mode acceptEdits` (file edits and `cp`/`mkdir`/`mv`/`touch`/`rm`/`sed` go through, but only inside the workspace), `--allowedTools 'Bash(vibe *)'` for the app's own CLI and nothing more (a blanket `Bash(cp *)` would reach the whole disk, and `ffprobe` can open URLs), and `--permission-prompts none` (anything else is refused, not left hanging). The user's own Claude Code permission settings still apply on top. Refused tools from the turn's result are shown in the panel, with the command, so the user can run it or allow it.
- **Finding `claude`.** `$VIBE_CLAUDE` if set (tests use a stand-in), else `claude` on `PATH` with `~/.local/bin`, `~/.claude/local` and the Homebrew folders added (a Finder-launched app has a bare `PATH`). When the app was started from inside a Claude Code session (`CLAUDECODE` is set), the child gets none of that session's `CLAUDE_*` variables or its `ANTHROPIC_BASE_URL`: they carry its proxy, a "simple mode" flag and its session ids, which would change how the child runs.
- **Claude's `vibe` is the app's own.** The workspace guide has Claude run `vibe check` and `vibe snapshot`, but the user's `vibe` (npm link) sits on an nvm PATH a Finder-launched app never gets. At startup the app writes `userData/bin/vibe`, a two-line script that runs this same app in CLI mode, and puts that folder first on the child's PATH, so it works from Finder and always matches the running version.
- **Errors say what to do.** No `claude` → how to install it. An expired login (the CLI says so in its reply) → the message as given, which names `claude auth login`. A resumed session that no longer exists → start a new one and say so.
- **Where the code lives.** `src/main/chat-events.ts` turns stream-json lines into panel items (pure, unit-tested). `src/main/chat.ts` runs the process and keeps each project's state, with no Electron import (tested with a stand-in `claude` script). IPC in `src/main/ipc.ts`, the contract in `src/shared/api.ts`, the panel in `src/renderer/ui/ChatPanel.tsx` with a small markdown renderer (no `dangerouslySetInnerHTML`; links show as text, since a click would navigate the app window).
- **What's shown.** Claude's text (markdown: paragraphs, lists, headings, code, bold), one line per tool call with a running/done/failed mark, and notes for errors, refusals and stops. Thinking and sub-agent internals are left out.

## Not doing (yet)

- Answering permission prompts from the panel (needs `--permission-prompt-tool` and an MCP server in the app).
- Showing snapshot PNGs inline, attaching files or screenshots, picking the model, queuing a message while a turn runs.
- A terminal emulator in the app: it would need `node-pty` (a native module) and wouldn't know what's open.

## Done when

You can open the panel, ask for a change, watch Claude's reply stream in with its tool lines, see the edit appear in the preview, stop a turn, start a new chat, and come back to the conversation after switching projects or restarting the app. `npm test` and `npm run typecheck` pass.
