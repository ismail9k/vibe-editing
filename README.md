# Vibe Editing

A small desktop video editor that Claude Code drives. Your components, your brand and a library of styles live in one place; Claude edits plain files on disk, and the app shows every change live while you watch, nudge and approve.

- **Studio**: your components in every style, side by side and looping. Tune a style's knobs, edit the brand, try a component's props, then add it to the film.
- **Edit**: a footage track, graphics, captions and sounds on one timeline, with a live preview and an Export button.
- **Styles** restyle the same components natively (9k Flat, Chalkboard and Pixel ship as presets). Make your own by duplicating one, or start from nothing.
- **Effects** from short-form editing: punch-in zooms, zoom-through cuts, a phone mock-up, checklists and growing charts, and effects that cut you out of the shot (a new backdrop, paper cut-out, doodles, a magazine cover, breaking out of the frame, words orbiting you, a dolly zoom, a wall of headlines or screens, frosted-glass type).

## Setup

You need Node 22+ and ffmpeg (with ffprobe) on your `PATH` (`brew install ffmpeg`).

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

## The workspace

Everything lives in `~/Vibe` (or in `$VIBE_HOME`). On first run the app copies in the presets: the 9k brand, three styles, twenty-one components, two demo films and a `CLAUDE.md` that teaches Claude Code how to work here. It copies only missing files and never overwrites yours.

```
~/Vibe/
  CLAUDE.md                               how Claude Code works in this workspace
  library/brand.json                      colours, modes (dark, light, green), fonts, design-language rules
  library/styles/<id>/style.{json,js}     a style: its params, and the painter overrides that restyle everything
  library/components/<id>/component.{json,js}   a component: props schema, defaults, and its draw function
  projects/<name>/vibe.json               a film: format, style, mode, direction, tracks
  projects/<name>/media/                  footage and sounds (imported copies)
  projects/<name>/media/.matte/           cutout mattes, one per footage file (made on a Mac)
  projects/<name>/.vibe/session.json      written by the app: room, selection, playhead (Claude reads it)
  projects/<name>/out/                    renders and snapshots
```

To work with Claude, open a Claude Code session in `~/Vibe` next to the app. Claude edits `vibe.json`, styles and components, and the app reloads them within a second. If Claude writes a broken file, the app keeps showing the last good version and puts the error in the top bar. A component or style that throws draws a red box with the error instead of crashing.

## The CLI

```bash
vibe list                              # projects in the workspace
vibe check <project>                   # check vibe.json against the library; exits 1 on errors
vibe snapshot <project> --at 1,4.5,8   # PNGs at those seconds -> projects/<p>/out/snap-*.png
vibe render <project> [-o out.mp4]     # export the MP4 -> projects/<p>/out/<p>.mp4
vibe matte <project>                   # cut you out of every clip -> media/.matte/ (macOS)
vibe open [project]                    # open the app
```

`snapshot` and `render` run the app's own renderer in a hidden window, so they match the preview frame for frame: ffmpeg decodes the footage to raw frames, the window draws each whole frame (footage, effects, graphics, captions), and ffmpeg encodes the result with the sound. Export is H.264 + AAC. Footage is scaled and cropped to fill the frame, and HDR footage (iPhone HLG or PQ) is tone-mapped to SDR.

## Cutouts

Effects that put something behind you need a matte: a grey video per footage file where white is you. They're made with Apple Vision by a small Swift helper (`native/vibe-matte.swift`), compiled with `swiftc` on first use into the app's data folder. It combines person segmentation (fine hair) with subject lifting (keeps a mic or whatever you hold in front of you). A matte takes about 1.5× the clip's length. The app makes them in the background as soon as a film uses a cutout effect, and export makes any that are missing. Cutouts need macOS and the Xcode command line tools (`xcode-select --install`); elsewhere, cutout effects show the whole frame and export refuses them.

## How it is built

Electron, React, TypeScript and zustand. The renderer is a 2D canvas engine grown from the 9k motion skills:

- `src/core/`: the project model, edit ops, validation, motion helpers, the painter (the drawing primitives that styles override) and the frame renderer. It has no DOM or Node dependencies and is unit-tested.
- `src/main/`: the workspace, the `vibe://` protocol, the file watcher, export (ffmpeg), cutout mattes and the CLI.
- `native/`: the Apple Vision matte helper.
- `src/renderer/`: the two rooms, the timeline, the inspector, and the hidden render window used by export.
- `presets/`: what gets seeded into a new workspace.

Design: `docs/superpowers/specs/2026-11-09-vibe-editing-design.md`; effects: `docs/superpowers/plans/2026-11-09-effects.md`. Ideas and known gaps: `docs/BACKLOG.md`.
