# AGENTS.md

Canonical instruction file for this repository, shared by all coding agents
(Claude Code, Codex, Cursor, and others). Claude Code reaches it through the
`@AGENTS.md` import in `CLAUDE.md`. Repository guidance belongs here, while
tool-specific pointer files contain no duplicate guidance.

## Project knowledge

<!--
Fill this in as the project develops. Keep it under a page so stale context does
not burden every session. When an agent makes the same mistake twice, record the
correction here.
-->

Vibe Editing is an Electron desktop video editor that Claude Code drives by editing plain files in a workspace (`~/Vibe`, or `$VIBE_HOME`). The app watches the workspace and shows every change live. See `README.md` for the user-facing picture; the design lives in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`, and known gaps in `docs/BACKLOG.md`.

### Commands

Requires Node 22+ and `ffmpeg`/`ffprobe` on `PATH`. Cutouts also need macOS and the Xcode command line tools (`swiftc`). `vibe transcribe` needs whisper.cpp's `whisper-cli` (`brew install whisper-cpp`); it finds or downloads its model itself.

```bash
npm install
npm run dev          # app with hot reload (electron-vite)
npm run build        # build to out/
npm test             # vitest run (tests/**/*.test.ts)
npm run typecheck    # tsc --noEmit
npm run dist         # dist/mac-arm64/Vibe Editing.app (electron-builder.yml; unsigned)
npx vitest run tests/core/ops.test.ts          # one file
npx vitest run tests/core/ops.test.ts -t "split"   # one test by name
```

If Electron fails with "Electron failed to install correctly": `node node_modules/electron/install.js`.

The `vibe` CLI (`bin/vibe.mjs`, put on `PATH` with `npm link`) spawns `electron . --cli <command>`. It runs `npm run build` first when `out/` is missing or anything in `src/` is newer than it (`bin/stale.mjs`), so the first command after an edit takes a few extra seconds.

```bash
vibe check <project>                  # validate vibe.json against the library (exit 1 on errors)
vibe snapshot <project> --at 1,4.5    # PNGs -> projects/<p>/out/snap-*.png
vibe render <project> [-o out.mp4]    # MP4 export
vibe matte <project>                  # cutout mattes (macOS)
vibe transcribe <project>             # word timings on the timeline -> projects/<p>/transcript.json
vibe open [project]
```

Use `VIBE_HOME=<scratch dir>` to run the app or CLI against a throwaway workspace instead of the user's `~/Vibe`.

Some tests skip themselves: `tests/main/decode-sync.test.ts` without ffmpeg, the matte helper tests off macOS.

#### The packaged app

`npm run dist` packs `out/`, `presets/`, `native/` and `build/icon.png` into `app.asar` (the list is `files` in `electron-builder.yml`; a new runtime folder must be added there). The renderer's packages are dev dependencies because Vite bundles them, so nothing from `node_modules` ships. Two things differ from running the repo:

- `app.getAppPath()` is the `app.asar` archive. Node's `fs` reads inside it, but other programs can't, so anything handed to a child process must be unpacked (`asarUnpack`) and addressed through `unpacked()` in `src/main/paths.ts`, as the Swift source for `swiftc` is.
- Opened from Finder, the app gets a bare `PATH`; `src/main/tool-path.ts` adds the Homebrew folders at startup so `ffmpeg`, `ffprobe` and `whisper-cli` are found.

### Conventions

- Commit messages are short plain-English imperatives describing the user-visible effect ("Keep the picture on the sound across cuts"), with no type prefixes.
- Code comments in the same plain style explain *why*; file headers say what the file is for.

### Architecture

Four layers, with a strict dependency direction:

- **`src/core/`**: pure TypeScript, no Node or DOM APIs (canvas contexts are passed in). The project model and timeline maths (`model.ts`), pure edit ops that return new projects for undo (`ops.ts`), validation (`validate.ts`), springs/tweens (`motion.ts`), the painter (`painter.ts`), footage/cutout drawing (`media.ts`), captions, and `renderFrame` (`render.ts`). Unit-tested in `tests/core/`.
- **`src/main/`**: the Electron main process: workspace I/O and seeding, the `vibe://ws/<path>` protocol (serves workspace files, with Range for video), the file watcher, IPC, ffmpeg decode/encode, the matte pipeline, transcripts, the hidden render window, and the CLI. `index.ts` branches on `--cli`.
- **`src/preload/` + `src/shared/api.ts`**: the `window.vibe` bridge. `api.ts` is the contract between main and renderer; change both sides together.
- **`src/renderer/`**: React + zustand UI with two rooms (Studio, Edit). `main.tsx` routes `#headless` to `headless.ts`, the hidden render window.

#### One renderer for everything

`renderFrame(ctx, project, lib, t, media)` in `src/core/render.ts` draws a whole frame (footage or background, graphics, captions, the style's `post()` pass). The preview, the Studio tiles, `vibe snapshot` and the export all call it, so they match frame for frame. Export (`src/main/export.ts`) runs it in a hidden `BrowserWindow`: ffmpeg decodes footage to raw RGBA, main hands each frame to the window over IPC (`headless:media`), the window draws and sends RGBA back (`headless:frame`), and ffmpeg encodes H.264 + AAC. Keep rendering deterministic: no `Math.random` or wall-clock time in drawing code (use `p.rng(seed)`).

User drawing code is isolated: each component, caption and `post()` runs inside `sandboxed()`, which unwinds any `save()`s it left and turns a throw into a red error box plus an entry in the returned error list, so one broken component never stops a frame.

#### Library: components and styles are workspace JS, not app code

Components (`library/components/<id>/component.{json,js}`) and styles (`library/styles/<id>/style.{json,js}`) are plain ES modules in the workspace, loaded by `src/renderer/library.ts` through `import('vibe://ws/...?v=<stamp>')` (the stamp busts the cache on reload).

- A **component** exports `{ draw(p, { t, dur, props, graphic, place }) }` and must draw through the painter `p`, never raw canvas calls for the look, so styles can restyle it. `component.json` flags: `scene` (draws the footage itself; the plain footage layer is skipped), `matte` (calls `p.subject()`, needs a cutout; export refuses without one), `aims` (only uses `p.subjectBox()`; guesses without a matte).
- A **style** exports `(base) => ({ ...overrides })`. Base painter methods call each other through `this`, so an override applies everywhere; overrides call the base as `base.method.call(this, ...)`.
- Colours come from `brand.json` and the project's mode, not from styles or components.

#### `presets/` is the seed for a new workspace

On startup `seedWorkspace` copies every file from `presets/` into the workspace **only if it is missing; it never overwrites**. So editing a preset does not change an existing `~/Vibe`; copy the file over (or use a fresh `VIBE_HOME`) to see it. `presets/CLAUDE.md` is the guide for a Claude session working *inside the workspace* (writing films, components and styles); keep it in sync when you change the painter API, component flags or `vibe.json` format. `tests/core/presets.test.ts` checks every preset component's schema and defaults.

#### Disk wins

The project file on disk is the source of truth, since Claude edits it while the app is open:

- `parseProject` never throws: invalid JSON returns `error` so the app keeps the last good project; wrong-typed fields fall back to defaults and are reported in `coerced`.
- App writes are conditional (`writeChecked`): the renderer sends the text it last read (`src/renderer/disk.ts`) and main writes only if the file still holds it. A refused write reloads from disk. Writes are atomic (temp file + rename).
- `SelfWriteGuard` (`src/main/watch.ts`) remembers the app's own writes so the watcher doesn't report them back as outside changes. The watcher only reacts to `library/brand.json`, `library/styles/*`, `library/components/*` and `projects/*/vibe.json`.
- All workspace paths go through `resolveInside()`, which rejects anything outside the workspace.

#### Timeline model

Times are seconds on the output timeline. Footage clips have no `at`: they play back to back in order, with `in`/`out` in source seconds (`footageSpans`, `footageAt`). Graphics, captions and audio have `at`/`dur`. Every graphic fades out over its last `EXIT` (0.25 s). Graphic `x`/`y`/`w` are frame fractions (centre x, top y, width) that override the component's default placement; `place()` returns RTL-aware `start`/`end` edges.

#### Cutout mattes

`src/main/matte.ts` makes one grey matte video per footage file at `media/.matte/<file>.matte.mp4` (white = the speaker), using `native/vibe-matte.swift` (Apple Vision), compiled with `swiftc` on first use into the app's `userData/bin`, not the workspace. ffmpeg decodes the footage upright (tone-mapped for HDR) for the helper and encodes the matte at 30 fps. A clip without a ready matte draws as if it had none, the same in preview, export and snapshots.

### Things agents get wrong
