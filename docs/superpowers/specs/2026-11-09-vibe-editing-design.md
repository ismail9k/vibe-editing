# Vibe Editing: design

Date: 2026-11-09 · Status: approved to build ("build it and I will review it later")

## Intent

Vibe Editing is a very small, CapCut-style desktop video editor that Ismail builds for himself first and may open-source later. It is the one place where his work lives:

- **his components** (stat, hook, band, Nino…), with a live preview and editable settings,
- **his brand**: the 9k design language (colours, type, rules) in one field instead of three drifting files (`brand.md`, `brand.js`, the reel cover template),
- **a style library**: the same component drawn in different styles (9k flat, Chalkboard, Pixel Art…), like the reel "10 animation styles from Claude" (steventawfik, Nov 2026): one scene, ten looks. Ready-made styles, plus his own built from scratch,
- **a footage timeline**, so a talking-head film can be edited and exported in the same app.

**Claude Code drives it.** Ismail asks in the terminal; Claude edits the project and library files on disk; the app reloads live and shows the result; Ismail looks, nudges and approves in the app. Everything the app knows is a plain file Claude can read and write. Nothing important lives only in the app.

It replaces two things: the paid HyperFrames Mac app (he wants his own, free), and the frozen montage editor in `motion/skills/9k-montage/scripts/editor.mjs`. It is a **separate project** from the motion skills, in its own repo (`~/ismail9k/vibe-editing`).

## Goals (version one)

1. Two rooms in one window (mockup B, chosen as Claude's call; see below):
   - **Studio**: browse styles, components and brand; see every component drawn in the active style side by side; edit style parameters, brand tokens and the design-language text.
   - **Edit**: library on the left, 9:16 / 16:9 preview in the middle, inspector on the right, timeline at the bottom (footage, graphics, captions, audio tracks).
2. Styles restyle components natively: a component is written once and drawn through a style, so switching style redraws the whole film, timing unchanged.
3. Brand stays fixed across styles: colours, fonts, the one-orange-hit rule, Nino.
4. Live reload: any file Claude changes shows up in the app within a second, without losing the playhead.
5. Footage editing: import clips, trim, split at playhead, reorder, delete; graphics and captions laid on top; export an MP4.
6. A `vibe` command line for Claude: `check`, `snapshot` (a PNG at time t, so Claude can see its work), `render`.

## Non-goals (version one)

- 3D styles (CGI, Clay 3D). The style contract must not block them later.
- Automatic transcription, silence cutting, retake detection (the montage scripts already do these; captions can be imported from their `words` JSON).
- Opening HyperFrames projects. Nice later, only if easy.
- 10-bit HDR export (v1 exports 8-bit H.264; HDR is a known follow-up the montage work cares about).
- Cloud sync, multi-user, Windows/Linux builds, an app store package.
- Porting all 22 montage graphic types. v1 ships 7; the rest follow the same contract.

## Anti-goals

- Hidden app state that Claude can't see or change.
- Growing into a general-purpose NLE with endless panels. It stays minimal.
- A style that breaks the brand (stock palettes, a second accent colour, Inter/Roboto).
- Non-deterministic frames: preview and export must draw the same pixels for the same `t` (seeded randomness only, never `Math.random`).

## Decisions

Ismail's:
- Separate project and repo; free of HyperFrames (optional import later).
- Styles are first-class and restyle the user's own components; presets plus build-your-own.
- Version one has both the studio and the footage timeline.
- Controlled from Claude Code.

Claude's calls (he accepted the defaults, or didn't pick; flagged for his review):
- **Layout B, two rooms** (Studio / Edit). The Edit room is layout A.
- **Electron** shell, so the preview and the export use the same Chromium canvas.
- **Own renderer**, grown from the 9k canvas `seek(t)` engine (`motion.js`, `brand.js`), not Remotion (licence) or HyperFrames.
- **TypeScript + React** for the app; **plain ES modules** for library code (styles, components), so Claude can write them without a build step.
- Workspace at `~/Vibe` (override with `VIBE_HOME`).
- v1 presets: styles `flat9k`, `chalkboard`, `pixel`; components `hook`, `stat`, `card`, `list`, `band`, `nino`, `cta`.
- Footage track is magnetic (clips play back to back in order), like CapCut's main track.

## How it works

### Workspace on disk

```
~/Vibe/
  CLAUDE.md                     how Claude should work here (format, rules, CLI)
  library/
    brand.json                  the brand: colours, modes, fonts, design-language rules text
    styles/<id>/style.json      name, description, params (with types, ranges, values)
    styles/<id>/style.js        the drawing code (ES module)
    components/<id>/component.json   name, description, default props, prop schema, default duration
    components/<id>/component.js     the drawing code (ES module)
  projects/<name>/
    vibe.json                   the project: format, style, mode, dir, tracks
    media/                      imported footage and sounds (copied in)
    .vibe/session.json          written by the app: room, selection, playhead (read-only for Claude)
    out/                        renders and snapshots
```

Presets ship inside the app (`presets/`) and are copied into the workspace on first run if missing. The workspace copy is the one used, so Ismail and Claude can change anything.

### Project file (`vibe.json`)

```json
{
  "name": "white-friday",
  "format": { "w": 1080, "h": 1920, "fps": 30 },
  "style": "chalkboard",
  "mode": "dark",
  "dir": "rtl",
  "tracks": {
    "footage":  [{ "id": "f1", "src": "media/take.mov", "in": 2.4, "out": 18.0 }],
    "graphics": [{ "id": "g1", "type": "stat", "at": 3.2, "dur": 2.8, "props": { "value": "90%", "label": "of devs" } }],
    "captions": [{ "id": "c1", "text": "كل يوم AI", "at": 3.0, "dur": 1.2, "keyword": "AI" }],
    "audio":    [{ "id": "a1", "src": "media/whoosh.wav", "at": 3.1, "gain": 0.5 }]
  }
}
```

Times are seconds on the output timeline. Footage clips have no `at`: they play in order, and the duration of the film is the sum of `out − in` (or the end of the last graphic or caption if there is no footage). Graphics may carry `x`, `y`, `w` (fractions of the frame) to override the component's default placement. The app validates the file on load and shows errors instead of crashing; `vibe check` prints the same errors.

### The style contract

A component never draws raw canvas calls for its look. It calls a **painter**, and the style implements the painter. The base painter (9k flat) implements everything; a style overrides only what it changes.

Painter primitives (all in frame pixels, all pure functions of their arguments):

- `background(t)`: the frame behind graphics when there's no footage (glow, slate, pixel sky).
- `panel(rect, { variant, progress })`: a card or surface. `variant`: `default | feature | flat`.
- `text(str, x, y, { role, size, weight, color, align, maxWidth, progress })`: `role`: `display | body | mono | serif`. `progress` 0→1 is the reveal; the style decides how it reveals (typed with caret, drawn stroke by stroke, popped in blocks).
- `line(points, { color, width, progress })`, `rule(x, y, w, { color })`: strokes and underlines.
- `pill(rect, { fill, color })`, `badge(...)`, `button(...)`: small UI.
- `nino(x, y, size, { expression, t })`: the mascot, which keeps its whole-pixel rule in every style.
- `enter(t, kind)`: the entrance curve (`snappy | default | heavy | playful`), so a style can make things wobble in or snap in.
- `post(ctx)`: an optional full-frame pass at the end (Pixel Art renders at low resolution and upscales with smoothing off; Chalkboard adds dust).

Colours come from the brand and the mode (`dark | light | green`), never from the style. A style may add texture, but the accent stays orange and appears once.

Style module shape:

```js
export default (base) => ({ ...base, panel(rect, o) { … }, text(str, x, y, o) { … } });
```

Component module shape:

```js
export default {
  draw(p, { t, dur, props, frame }) { … }   // t is local time since `at`; p is the painter
};
```

`component.json` holds `{ name, description, duration, defaults, schema }`, where `schema` maps each prop to `{ type: text | number | bool | list | select, label, options? }`. The inspector is generated from it.

Randomness: the painter exposes `p.rng(seed)` (mulberry32). Seeds come from the graphic's `id`, so a chalk wobble is the same on every frame and every render.

### Renderer

`renderFrame(ctx, project, library, t, { withFootage })` draws one frame: background (only when no footage is under `t`, or for export with footage composited separately), then every graphic active at `t` through the style's painter, then captions (a built-in caption drawer that uses the painter, keyword in the accent pill), then `post`. It is pure: same inputs, same pixels.

Preview: a `<video>` element plays the footage under a transparent canvas of the same aspect ratio. The canvas redraws on every animation frame from the video's current time mapped through the clip list.

Export: a hidden window renders overlay frames at each `t = i / fps`, reads RGBA, and pipes them to ffmpeg as rawvideo. ffmpeg trims and concatenates the footage clips (scaled and cropped to the format), overlays the graphics stream, mixes the footage audio with the audio track, and writes H.264 + AAC to `out/<name>.mp4`. With no footage, the canvas draws the background and the overlay stream is the whole picture.

### Live control from Claude Code

- The app watches the workspace. A change to `vibe.json` reloads the project; a change to a style or component re-imports that module (cache-busted). The playhead and room stay where they were.
- The app autosaves edits made in the app to `vibe.json` (debounced). It ignores the watcher event caused by its own write, so the two never fight. If the file changes on disk while the app has unsaved edits, the disk wins and the app says so.
- The top bar shows the last change made on disk ("vibe.json changed on disk · graphic g3"), so Ismail sees what Claude just did.
- The app writes `.vibe/session.json` (room, selected item, playhead, active style) so Claude can tell what Ismail is looking at ("change this one").
- Library code is served to the app over a private `vibe://` protocol, so modules load the same way in preview and export.

### CLI

`vibe` is a small Node script that starts Electron headless:

- `vibe check <project>`: validate `vibe.json` and every graphic's props against its component schema.
- `vibe snapshot <project> --at 3.2[,5,8] [-o out/snap.png]`: render frames to PNG (overlay over the footage frame). This is how Claude looks at its own work.
- `vibe render <project> [-o out/name.mp4]`: export.
- `vibe open <project>`: open the app on that project.

### Rooms

**Studio**
- Left: Styles, Components, Brand lists. "New style" duplicates the active one into a new folder (and the empty slots tell him to ask Claude to write the drawing code).
- Centre: a grid with every component drawn in the active style and mode, looping its animation; click one to focus it large.
- Right: the inspector for what's selected: style params, brand (colour pickers, fonts, the design-language text area), or component sample props.
- Mode switch (dark / light / green) and direction (LTR / RTL) apply everywhere.

**Edit**
- Left: library tabs (Components, Styles, Media). Click a component to add it at the playhead; click a style to switch the film's style.
- Centre: the preview, transport (play/pause, time), and the frame format.
- Right: the inspector for the selected item, generated from the component schema (graphics), or text/time fields (captions), or in/out (footage).
- Bottom: the timeline with footage, graphics, captions and audio tracks. Drag to move; drag edges to trim; `S` splits the footage clip under the playhead; `Delete` removes; space plays; ⌘Z / ⇧⌘Z undo and redo. Import footage and sounds with a button or by dropping files.

## Look of the app

Dark, quiet, 9k-flavoured chrome: near-black panels, IBM Plex Sans for UI and IBM Plex Mono for numbers, green for the active state, orange only for the playhead and the selection.

## Left to the builder

- Exact painter signatures beyond the list above, and how each preset style achieves its look.
- Internal state management in the app, IPC shape, file-watching library.
- Timeline zoom, snapping details, keyboard shortcuts beyond those listed.
- How the CLI finds the Electron binary and the app.
- Test strategy (the project model and validation must be unit-tested; the renderer is checked through `vibe snapshot`).
