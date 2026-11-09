# Vibe Editing v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A minimal Electron video editor with a Studio room (styles, components, brand) and an Edit room (footage timeline), driven by files on disk that Claude Code edits, with a `vibe` CLI for check / snapshot / render.

**Architecture:** Pure TypeScript core (`src/core`: model, edit ops, validation, motion, painter, renderer) shared by the app window, the hidden export window and the tests. Electron main owns the workspace (`~/Vibe`), the `vibe://` protocol, file watching, ffmpeg. Library styles and components are plain ES modules in the workspace, loaded at runtime over `vibe://`.

**Tech Stack:** Electron 45, electron-vite, React 19, TypeScript, zustand, vitest, @fontsource IBM Plex (Sans, Serif, Mono, Sans Arabic), ffmpeg/ffprobe from PATH.

**Spec:** `docs/superpowers/specs/2026-11-09-vibe-editing-design.md`

## Global Constraints

- Workspace root: `process.env.VIBE_HOME || ~/Vibe`; layout exactly as the spec's "Workspace on disk".
- Project file `vibe.json` with keys `name, format{w,h,fps}, style, mode (dark|light|green), dir (ltr|rtl), tracks{footage,graphics,captions,audio}` as in the spec.
- Brand colours: primary `#166434`, accent `#E85A02` (text on accent is black), ink `#0A111A`, dark bg `#0F0F0F`, light bg `#FAFAFA`. Theme tokens copied from `motion/skills/9k-motion/templates/lib/brand.js` THEMES.
- Springs: snappy [320,34], default [170,26], heavy [120,24], playful [220,14] (closed-form, from `motion.js`).
- No `Math.random` anywhere in drawing code; seeded `rng(seed)` (mulberry32) only.
- Fonts: IBM Plex only (+ Plex Sans Arabic for RTL). Never Inter/Roboto/system UI fonts in frames.
- Presets: styles `flat9k`, `chalkboard`, `pixel`; components `hook`, `stat`, `card`, `list`, `band`, `nino`, `cta`.

## Review Focus

1. Claude writes `vibe.json` half-way (or invalid JSON): the app keeps the last good project, shows the parse error in the top bar, and recovers on the next valid write. → `parseProject` test in Task 1.
2. A style or component module throws: only that graphic shows a red error box with the message; the rest of the frame renders. → `renderFrame` guards each draw (Task 2), checked by snapshot in Task 6.
3. A footage file is missing: `vibe check` reports it, the preview shows "missing media", export fails with a clear message. → `validateProject` test in Task 1.
4. App autosave and Claude's edit race: the app never re-reads its own write, and a disk change wins over unsaved app edits. → `SelfWriteGuard` test in Task 3.
5. Arabic RTL captions and component text draw right-to-left in Plex Sans Arabic. → snapshot of the demo project (RTL captions) in Task 6.

---

### Task 1: Scaffold + project model, edit ops, validation

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `.gitignore`, `vitest.config.ts`
- Create: `src/core/model.ts`, `src/core/ops.ts`, `src/core/validate.ts`
- Test: `tests/core/model.test.ts`, `tests/core/ops.test.ts`, `tests/core/validate.test.ts`

**Interfaces (Produces):**
- Types: `Format {w,h,fps}`, `Clip {id,src,in,out}`, `Graphic {id,type,at,dur,props,x?,y?,w?}`, `Caption {id,text,at,dur,keyword?}`, `AudioItem {id,src,at,gain}`, `Project {name,format,style,mode,dir,tracks}`, `Mode = 'dark'|'light'|'green'`, `Dir = 'ltr'|'rtl'`.
- `parseProject(text: string): { project?: Project; error?: string }` (fills defaults, never throws)
- `footageSpans(p): {clip: Clip; start: number; end: number}[]`
- `duration(p): number` (footage sum, else last graphic/caption end, min 1)
- `footageAt(p, t): {clip: Clip; srcTime: number; index: number} | null`
- `ops`: `addGraphic(p, type, at, dur, props) → {project, id}`, `updateItem(p, track, id, patch)`, `moveItem(p, track, id, at)`, `trimItem(p, track, id, edge:'start'|'end', t)`, `deleteItem(p, track, id)`, `splitFootage(p, t)`, `trimClip(p, id, edge, delta)`, `moveClip(p, id, toIndex)`, `addClip(p, src, durationSec)`, `newId(p, prefix)`. All pure, return new Project.
- `validateProject(p, ctx: {components: Record<string, ComponentMeta>; styles: string[]; mediaExists(src): boolean}): Issue[]` with `Issue {level:'error'|'warn', path: string, message: string}`; `ComponentMeta {name, description, duration, defaults, schema}`.

- [ ] Step 1: Scaffold with electron-vite (main / preload / renderer), install deps, `npm test` runs vitest.
- [ ] Step 2: Write failing tests:
  - `parseProject('{"tracks":{}}')` → defaults `format {1080,1920,30}`, `style 'flat9k'`, `mode 'dark'`, `dir 'ltr'`, empty tracks; `parseProject('{"name":')` → `error` contains "JSON", no throw.
  - Two clips `in 2 out 5`, `in 0 out 4` → `duration 7`; `footageAt(p, 4)` → clip 2, `srcTime 1`.
  - `splitFootage` at t=1 on clip `in 2 out 5` → clips `[2,3]` and `[3,5]`, distinct ids, duration unchanged.
  - `trimItem(graphics, 'start', t)` keeps the end fixed; `dur` never below 0.1.
  - `validateProject` flags unknown component type, unknown style, missing media (`mediaExists` false → error at `tracks.footage[0].src`), prop of wrong type per schema (`number` given a string).
- [ ] Step 3: Implement to pass. Step 4: `npm test` green. Step 5: commit.

### Task 2: Motion, painter, renderer, preset library

**Files:**
- Create: `src/core/motion.ts` (port of `motion.js`: `clamp, lerp, spring, sp, track, tween, ease9k, rng, typed, retype, caretOn`)
- Create: `src/core/brand.ts` (`Brand` type, `themeOf(brand, mode)`), `src/core/painter.ts`, `src/core/render.ts`, `src/core/captions.ts`
- Create: `presets/library/brand.json`, `presets/library/styles/{flat9k,chalkboard,pixel}/style.{json,js}`, `presets/library/components/{hook,stat,card,list,band,nino,cta}/component.{json,js}`, `presets/CLAUDE.md`, `presets/projects/demo/vibe.json`
- Test: `tests/core/motion.test.ts`

**Interfaces:**
- `Brand {name, colors{primary,accent,onAccent,ink}, modes: Record<Mode, ThemeTokens>, fonts{display,body,mono,serif,arabic}, rules: string}`
- `createBasePainter(ctx: CanvasRenderingContext2D, env: {W,H,rem,dir,mode,theme,brand,params}) → Painter` with `background(t)`, `panel(rect,{variant,progress})`, `text(str,x,y,{role,size,weight,color,align,maxWidth,progress,caret})`, `line(points,{color,width,progress})`, `rule(x,y,w,{color,progress})`, `pill(rect,{fill})`, `badge(text,x,y,o)`, `button(text,x,y,o)`, `nino(x,y,size,{expression,t})`, `enter(t, kind)`, `post()`, plus `ctx, W, H, rem, dir, theme, brand, rng, m (motion)`.
- `StyleModule = (base: Painter) => Painter`; `ComponentModule = { draw(p, {t,dur,props,frame:{W,H}, graphic}) }`.
- `Library { brand: Brand; styles: Record<id,{meta, mod: StyleModule}>; components: Record<id,{meta: ComponentMeta, mod: ComponentModule}> }`
- `renderFrame(ctx, project, lib, t, {background: boolean}): void` — background (if asked), every graphic with `at ≤ t < at+dur` (try/catch → red error box), captions active at t, `post()`.
- `drawCaption(p, caption, t)` — bottom band at 0.78·H, keyword in accent pill with black text.

- [ ] Step 1: Failing tests for motion: `spring(0)=0`, `spring(2)≈1` (±0.01), heavy spring never exceeds 1.0005 over t∈[0,3], `rng(7)` sequence equal across two instances, `typed('abc', 0.1, 20)='ab'`.
- [ ] Step 2: Implement motion, brand, painter (flat9k = base), renderer, captions.
- [ ] Step 3: Write presets. chalkboard: slate background with seeded dust, panels and lines drawn as 2–3 jittered passes seeded by position, text filled then roughened with a seeded noise mask, reveal = stroke-by-stroke wipe. pixel: `post()` copies the frame to a 1/6-size canvas and back with smoothing off; panels snap to a 6 px grid with stepped borders; enter = stepped (quantized to 6 steps). Component JSON schemas per spec; demo project = 12 s, RTL, no footage, one of each component + Arabic captions.
- [ ] Step 4: `npm test` green; commit.

### Task 3: Main process — workspace, protocol, watcher, IPC

**Files:**
- Create: `src/main/workspace.ts`, `src/main/protocol.ts`, `src/main/watch.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts`
- Test: `tests/main/watch.test.ts`

**Interfaces:**
- `workspaceRoot(): string`; `seedWorkspace(root, presetsDir): void` (copies only missing files); `listLibrary(root): {styles: string[], components: string[]}`; `readJSON`, `writeProject(root, name, project)`.
- `vibe://ws/<path>` → files under the workspace, with HTTP Range support (206) for media; `Cache-Control: no-store`.
- `SelfWriteGuard { mark(path, content); isSelf(path, content): boolean }` — content hash match within 2 s.
- `watchWorkspace(root, onChange: (kind:'project'|'style'|'component'|'brand', id, path) => void)` using `fs.watch(root, {recursive:true})`, debounced 120 ms per path.
- Preload `window.vibe`: `getWorkspace()`, `listProjects()`, `openProject(name) → text`, `saveProject(name, text)`, `saveFile(relPath, text)`, `importMedia(name) → Clip-ready {src, duration}[]`, `probe(src)`, `writeSession(name, session)`, `onChange(cb)`, `exportProject(name)`, `onExportProgress(cb)`, `pushFrame(buf)` (export window only).

- [ ] Step 1: Failing test: `SelfWriteGuard.mark('a', 'x')` then `isSelf('a','x')` true, `isSelf('a','y')` false.
- [ ] Step 2: Implement; app window opens the renderer; first run seeds `~/Vibe` from `presets/`. Step 3: tests green; commit.

### Task 4: Renderer shell, library loader, Studio room

**Files:**
- Create: `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/store.ts`, `src/renderer/library.ts`, `src/renderer/fonts.ts`, `src/renderer/ui/TopBar.tsx`, `src/renderer/ui/FrameCanvas.tsx`, `src/renderer/rooms/Studio.tsx`, `src/renderer/ui/SchemaForm.tsx`, `src/renderer/app.css`

**Interfaces:**
- `loadLibrary(): Promise<Library>` — imports `vibe://ws/library/.../x.js?v=<stamp>`; a module that fails to import becomes a stub whose draw throws its error.
- Store (zustand): `project, projectName, lib, room, selection {track,id}|null, playhead, playing, lastDiskChange, error, history[], future[]`; actions `setProject(p, {fromDisk})`, `apply(fn: (p)=>Project)` (pushes history, schedules save 300 ms), `undo()`, `redo()`, `select()`, `seek()`.
- `<FrameCanvas project lib t background />` draws `renderFrame` at format size, CSS-scaled to fit.
- `<SchemaForm schema value onChange />` for text | number | bool | list | select.

- [ ] Step 1: Studio: left lists (Styles / Components / Brand), centre grid of every component looping in the active style + mode, right inspector (style params → write `style.json`; brand form → write `brand.json`; component sample props). Mode + direction switches; "New style" duplicates the active style folder.
- [ ] Step 2: Disk changes reload library/project live (playhead kept); top bar shows the last disk change and parse errors.
- [ ] Step 3: `npm run dev`, check Studio shows 7 components in all 3 styles; commit.

### Task 5: Edit room — preview, timeline, inspector

**Files:**
- Create: `src/renderer/rooms/Edit.tsx`, `src/renderer/ui/Preview.tsx`, `src/renderer/ui/Timeline.tsx`, `src/renderer/ui/Inspector.tsx`, `src/renderer/ui/Library.tsx`, `src/renderer/clock.ts`

**Interfaces:**
- `Preview`: `<video>` under `FrameCanvas`; clock driven by RAF while playing; video kept in sync with `footageAt` (swap src on clip change, reseek when drift > 0.15 s); paused = exact seek. `object-fit: cover`.
- `Timeline`: four tracks; px/sec zoom; drag body = move (graphics/captions/audio) or reorder (footage); drag edges = trim; click empty = seek; playhead orange.
- Keys: space play/pause, `S` split footage, Backspace/Delete remove selection, ⌘Z / ⇧⌘Z.
- Writes `.vibe/session.json` `{room, selection, playhead, style}` on change (debounced 500 ms).

- [ ] Step 1: Build Edit room; import footage via dialog and drop; add component at playhead from library; switch style from library.
- [ ] Step 2: Manual check in the dev app with a real clip: play, split, trim, move, undo; commit.

### Task 6: Export + `vibe` CLI

**Files:**
- Create: `src/main/export.ts`, `src/main/cli.ts`, `bin/vibe.mjs`, `src/renderer/headless.ts`
- Modify: `src/main/index.ts` (CLI mode: no visible window), `package.json` (`bin: {vibe: bin/vibe.mjs}`)

**Interfaces:**
- `buildFfmpegArgs(project, root, {overlay:'pipe', out}): string[]` — inputs: each clip with `-ss in -to out`, overlay rawvideo `rgba W×H fps` on stdin, audio items; filter: per clip `scale=W:H:force_original_aspect_ratio=increase,crop=W:H,setsar=1,fps=F`, concat, overlay, audio concat (anullsrc for silent clips) + `adelay`/`volume` items + `amix`; H.264 `-pix_fmt yuv420p -crf 18`, AAC.
- Headless window: `renderer/index.html#headless` exposes `window.vibeHeadless.render(projectName, mode:'frames'|'png', times)`.
- CLI: `vibe check|snapshot|render|open <project> [--at a,b] [-o path]`; exit code 1 on errors.

- [ ] Step 1: Failing test `tests/main/ffmpeg.test.ts`: two clips → args contain two `-ss`, `concat=n=2`, `overlay`, `-pix_fmt yuv420p`; no clips → only the overlay input + `anullsrc`.
- [ ] Step 2: Implement export + CLI + headless. Step 3: `vibe check demo` → 0 issues; `vibe snapshot demo --at 1,4,8` → PNGs; inspect them in all 3 styles; `vibe render demo` → mp4 plays (ffprobe duration ≈ 12 s). Commit.

### Task 7: Verify end to end

- [ ] Run the dev app: Studio and Edit both work; edit `vibe.json` from the terminal and watch the app update; break the JSON and see the error, fix it and see recovery; import a real talking-head clip, lay graphics, export, look at frames.
- [ ] README with setup, the CLI and the workspace layout. Commit.
