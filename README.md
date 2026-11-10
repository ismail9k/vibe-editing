# Vibe Editing

A small desktop video editor that Claude Code drives. Your components, your brand and a library of styles live in one place; Claude edits plain files on disk, and the app shows every change live while you watch, nudge and approve.

- **Studio**: your components in every style, side by side and looping. Tune a style's knobs, edit the brand, try a component's props, then add it to the film.
- **Edit**: a footage track, graphics, captions and sounds on one timeline (dragged edges snap to cuts, other items and the playhead; hold Option to drag freely), with a live preview and an Export button. Space plays, S splits the clip under the playhead, ⌘D copies the selected item, Delete removes it, ⌘Z undoes; the Media tab lists the film's files, and a click puts one on the timeline again.
- **Styles** restyle the same components natively (9k Flat, Chalkboard, Pixel Art, Editorial, Blueprint, Sticker and Terminal ship as presets). Make your own by duplicating one, or start from nothing.
- **Effects** from short-form editing: punch-in zooms, zoom-through cuts, a phone mock-up, checklists and growing charts, and effects that cut you out of the shot (a new backdrop, paper cut-out, doodles, a magazine cover, breaking out of the frame, words orbiting you, a dolly zoom, a wall of headlines or screens, frosted-glass type).

## Setup

You need Node 22+ and ffmpeg (with ffprobe) on your `PATH` (`brew install ffmpeg`). Transcripts also need whisper.cpp's `whisper-cli` (`brew install whisper-cpp`).

```bash
npm install
```

If the app then fails with "Electron failed to install correctly", fetch the binary by hand:

```bash
node node_modules/electron/install.js
```

Put the `vibe` command on your `PATH`:

```bash
npm link
```

## Run

```bash
vibe open
```

`vibe open demo` opens straight on a project. For development, `npm run dev` runs the app with hot reload. `npm test` runs the tests, and `npm run typecheck` checks the types.

## Install as a Mac app

```bash
npm run dist
```

This builds `dist/mac-arm64/Vibe Editing.app`. Drag it into `/Applications` and open it from the Dock or Spotlight like any other app. `npm run dist:dmg` makes `dist/Vibe-Editing-<version>-arm64.dmg` instead: open it and drag the app onto the Applications folder beside it. Rebuild after pulling changes; the installed app doesn't follow the repo.

The app is unsigned, so it is meant for the Mac that built it. ffmpeg and whisper-cli still come from Homebrew: opened from Finder, the app looks in `/opt/homebrew/bin` and `/usr/local/bin` as well as the usual `PATH`. The `vibe` command keeps running the repo's own build, not the installed app.

## The workspace

Everything lives in `~/Vibe` (or in `$VIBE_HOME`). On first run the app copies in the presets: the 9k brand, seven styles, twenty-seven components, nine sound effects, two demo films and a `CLAUDE.md` that teaches Claude Code how to work here. It copies in missing files, and later updates the ones nobody has touched since; a file you (or Claude) changed is never overwritten. `vibe presets` lists library files that differ from the app's version, and `vibe presets --take <file>` takes the app's (keeping yours in `.vibe/replaced/`).

```
~/Vibe/
  CLAUDE.md                               how Claude Code works in this workspace
  library/brand.json                      colours, modes (dark, light, green), fonts, design-language rules
  library/brands/<id>.json                more brands (a client's, a second channel's); a film picks one with "brand"
  library/styles/<id>/style.{json,js}     a style: its params, and the painter overrides that restyle everything
  library/components/<id>/component.{json,js}   a component: props schema, defaults, and its draw function
  library/sounds/<name>.wav               sound effects made in code (whoosh, riser, pop, ding, hit…) to copy into a film
  projects/<name>.vibe/vibe.json          a film: format, style, mode, direction, tracks
  projects/<name>.vibe/media/             footage and sounds (imported copies)
  projects/<name>.vibe/media/.matte/      cutout mattes, one per footage file (made on a Mac)
  projects/<name>.vibe/.vibe/session.json written by the app: room, selection, playhead (Claude reads it)
  projects/<name>.vibe/out/               renders and snapshots
```

Each project is a `.vibe` folder that Finder shows as a single document; double-clicking it opens it in the app (right-click → Show Package Contents to see inside). Projects made before this were plain `projects/<name>/` folders; the app renames them the next time it starts.

To work with Claude, click **Claude** in the top bar (or press ⌘L) and type. The panel runs your own Claude Code (it needs `claude` installed and signed in) in the workspace, streams its reply, and shows each file it touches or command it runs as one line; it knows which room you're in, where the playhead is and what's selected. Each project keeps its own conversation. File edits and simple file commands (`cp`, `mkdir`, `mv`) inside the workspace go through without asking, and so does `vibe`; anything else is refused unless your Claude Code permissions allow it, and the panel names what was refused so you can run it. You can still open a Claude Code session in `~/Vibe` next to the app instead. Either way, Claude edits `vibe.json`, styles and components, and the app reloads them within a second. If Claude writes a broken file, the app keeps showing the last good version and puts the error in the top bar. A component or style that throws draws a red box with the error instead of crashing.

## The CLI

```bash
vibe list                              # projects in the workspace
vibe check <project>                   # check vibe.json against the library; exits 1 on errors
vibe snapshot <project> --at 1,4.5,8   # PNGs at those seconds -> projects/<p>.vibe/out/snap-*.png
vibe render <project> [-o out.mp4]     # export the MP4 -> projects/<p>.vibe/out/<p>.mp4
vibe matte <project>                   # cut you out of every clip -> media/.matte/ (macOS)
vibe transcribe <project>              # what you say, word by word, on the timeline -> projects/<p>.vibe/transcript.json
vibe component new <id> [--from <c>]   # start a component: a working template, or a copy of <c>
vibe component snap <id>               # check a component and draw it alone through its duration -> .vibe/out/<id>.png
vibe open [project]                    # open the app
```

Claude makes and changes components the same way it edits a film: it writes `library/components/<id>/`, and the Studio shows the result live, focusing a new component as soon as it appears. `vibe component snap` is how Claude sees its own work: it checks both files (schema, defaults, the cutout flags, no randomness) and draws the component alone, as its Studio tile does, at six moments side by side, printing anything that broke and when. You can also start one from the Studio with **+ New component**: it copies the component you're looking at, or starts from the template, for Claude to rewrite.

`snapshot` and `render` run the app's own renderer in a hidden window, so they match the preview frame for frame: ffmpeg decodes the footage to raw frames, the window draws each whole frame (footage, effects, graphics, captions), and ffmpeg encodes the result with the sound. Export is H.264 + AAC, with the sound levelled to -14 LUFS (the level Instagram, TikTok and YouTube play at) and its peaks kept under -1.5 dB. Footage is scaled and cropped to fill the frame, and HDR footage (iPhone HLG or PQ) is tone-mapped to SDR.

## Cutouts

Effects that put something behind you need a matte: a grey video per footage file where white is you. They're made with Apple Vision by a small Swift helper (`native/vibe-matte.swift`), compiled with `swiftc` on first use into the app's data folder. It combines person segmentation (fine hair) with subject lifting (keeps a mic or whatever you hold in front of you). A matte takes about 1.5× the clip's length. The app makes them in the background as soon as a film uses a cutout effect, and export makes any that are missing. Cutouts need macOS and the Xcode command line tools (`xcode-select --install`); elsewhere, cutout effects show the whole frame and export refuses them.

## Transcripts

`vibe transcribe <project>` gives Claude what you say and when, so it can cut on your words and time captions and graphics to them. It runs whisper.cpp (`whisper-cli`) once per footage file and keeps the words, in source seconds, at `media/.transcript/<file>.json`; they're redone only when the file, the model or the language changes (or with `--force`). Whisper's word times run into the pauses around them, so each word is snapped to the speech using the pauses ffmpeg measures in the same audio. The words the cut keeps go onto the output timeline in `projects/<p>.vibe/transcript.json`, and the command prints them as short timed lines.

The model is the best multilingual whisper.cpp model already on the machine (the app's data folder, `~/.cache/whisper.cpp`, `~/.cache/whisper`, HyperFrames' cache, Homebrew's share folder), or `large-v3-turbo` downloaded once (about 1.6 GB) into the app's data folder. `--model small` picks a model by name (downloaded if missing), `--model <path>.bin` uses that file, and `--lang ar` skips language detection.

## How it is built

Electron, React, TypeScript and zustand. The renderer is a 2D canvas engine grown from the 9k motion skills:

- `src/core/`: the project model, edit ops, validation, motion helpers, the painter (the drawing primitives that styles override) and the frame renderer. It has no DOM or Node dependencies and is unit-tested.
- `src/main/`: the workspace, the `vibe://` protocol, the file watcher, export (ffmpeg), cutout mattes, transcripts (whisper.cpp) and the CLI.
- `native/`: the Apple Vision matte helper.
- `src/renderer/`: the two rooms, the timeline, the inspector, and the hidden render window used by export.
- `presets/`: what gets seeded into a new workspace.

Design: `docs/superpowers/specs/2026-11-09-vibe-editing-design.md`; effects: `docs/superpowers/plans/2026-11-09-effects.md`. Ideas and known gaps: `docs/BACKLOG.md`.
