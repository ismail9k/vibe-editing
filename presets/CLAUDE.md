# Vibe Editing workspace

This folder is Ismail's Vibe Editing workspace. The Vibe Editing app shows it live: every file you change here appears in the app within a second. You drive the edit; he watches, nudges and approves in the app.

## Layout

```
library/brand.json                     the brand: colours, modes (dark / light / green), fonts, the design-language rules
library/styles/<id>/style.json         a style's name, description and params (each param: type, label, value, min/max/step or options)
library/styles/<id>/style.js           its drawing code
library/components/<id>/component.json name, description, default duration, default props, prop schema
library/components/<id>/component.js   its drawing code
library/sounds/<name>.wav              sound effects to copy into a film's media/: whoosh, swish, riser, pop, click, tick, ding, thump, hit
projects/<name>.vibe/vibe.json         a film (the folder is the project: Finder shows it as one file): format, style, mode, dir, tracks
projects/<name>.vibe/media/            footage and sounds (.matte/ and .transcript/ are made by the app)
projects/<name>.vibe/transcript.json   written by `vibe transcribe`: the words he says, on the timeline
projects/<name>.vibe/.vibe/session.json written by the app: what he's looking at (room, selection, playhead). Read it, never write it
projects/<name>.vibe/out/              renders and snapshots
```

## Rules

- **Read `library/brand.json` → `rules` before designing anything.** Colours come from the brand and the mode, never from a style or a component. One orange accent per shot.
- When he says "this one" or "here", read `.vibe/session.json` for the selected item and the playhead.
- Look at your work: `vibe snapshot <project> --at 1.2,3.5` writes PNGs to `projects/<project>.vibe/out/`. Open them before you say something is done.
- `vibe check <project>` validates the project against the library. Fix every error.
- `vibe render <project>` exports `out/<name>.mp4`. Only render when he asks.
- Before cutting or timing anything to speech, run `vibe transcribe <project>`. It prints what he says as timed lines on the output timeline and writes every word to `projects/<project>.vibe/transcript.json` (`at`/`end` on the timeline, `srcAt`/`srcEnd` in the footage file, for `in`/`out`). Run it again after changing the cuts; whisper only re-runs when the footage changes. Whisper misspells Arabic: fix captions by ear, not by copying.
- Cutout effects need a matte per clip (`media/.matte/`). The app makes them in the background; from the terminal run `vibe matte <project>` (macOS only, about 1.5× the clip's length). `vibe check` warns when one is missing.
- No `Math.random`: use `p.rng(seed)` so every frame is the same in preview and export.

## Directing

- **Hook in the first 3 seconds.** The first cut, graphic or effect lands before 3 s. No slow logo or title card first.
- **Every visible action has a sound**: a graphic landing, a number counting up, text typing in, a jump cut. A silent graphic feels pasted on.
- **Leave room.** Before the most important line, give a beat with no new graphic and no sound effect, so it lands. Not every sentence needs a graphic.
- **Vary the pace.** One fast stretch (cuts and graphics close together) and one breath (a shot held 1.5–2 s with nothing new). A film at one even speed feels long.
- **Pace for the viewer, not the clock.** A graphic stays up long enough to read: about 15 letters a second, which `vibe check` warns about. To go faster, use fewer words on screen, not shorter holds.

## vibe.json

```json
{
  "name": "white-friday",
  "format": { "w": 1080, "h": 1920, "fps": 30 },
  "style": "chalkboard",
  "mode": "dark",
  "dir": "rtl",
  "tracks": {
    "footage":  [{ "id": "f1", "src": "media/take.mov", "in": 2.4, "out": 18.0 }],
    "graphics": [{ "id": "g1", "type": "stat", "at": 3.2, "dur": 2.8, "props": { "value": "90%" }, "y": 0.4 }],
    "captions": [{ "id": "c1", "text": "كل يوم AI", "at": 3.0, "dur": 1.2, "keyword": "AI" }],
    "audio":    [{ "id": "a1", "src": "media/whoosh.wav", "at": 3.1, "gain": 0.5 }]
  }
}
```

- Times are seconds on the output timeline. Footage clips have no `at`: they play back to back in order (`in`/`out` are source seconds).
- A graphic's `x`, `y`, `w` (fractions of the frame: centre x, top y, width) override the component's default placement. The user can also drag a graphic on the preview and pull its side handles to change the width, which writes these three fields. Only a component that lays itself out with `place()` can be dragged, so use it for anything that has a position.
- Props not given fall back to the component's `defaults`.
- An audio `gain` sets a sound's level against the footage's own sound (1 = as recorded). Don't turn the whole film up or down: `vibe render` levels the finished mix to -14 LUFS, the level Instagram, TikTok and YouTube play at, and keeps its peaks under -1.5 dB.
- Sound effects: copy one from `library/sounds/` into the film's `media/` and add it to `tracks.audio`. Put it on the action, not the graphic's start: a `whoosh` or `swish` peaks in its middle, so start it about 0.2 s before the graphic lands; a `riser` builds to its last frame, so end it on the cut; `pop`, `click`, `tick`, `ding`, `thump` and `hit` start on their hit. Keep them at `gain` 0.3–0.6 under speech: his voice leads.

## Writing a component

```js
// library/components/<id>/component.js
export default {
  draw(p, { t, dur, props, graphic, place }) {
    const box = place({ y: 0.4, w: 0.8 });          // { x, y, w, left, right, start, end } in pixels
    const k = p.enter(t, 'default');                 // 0 → 1 spring: snappy | default | heavy | playful
    p.panel({ x: box.left, y: box.y, w: box.w, h: p.rem * 6 }, { variant: 'feature', progress: k });
    p.text(String(props.title), box.start + p.rem, box.y + p.rem * 2.5, { role: 'display', size: p.rem * 2, progress: Math.min(1, t * 20 / props.title.length) });
  },
};
```

Never draw the look with raw canvas calls: use the painter, so every style can restyle it. `t` is local time since the graphic started; the app fades every graphic out over its last 0.25 s.

Painter (`p`): `W, H, rem` (32 px on a 1080 frame), `dir`, `mode`, `theme` (mode tokens), `brand`, `params` (the style's), `m` (motion: `sp, tween, track, typed, clamp, lerp, hash`), `rng(seed)`, `sx(x)`, `measure(str, o)`, `fit(str, o)`, `background(t)`, `panel(rect, {variant: default|feature|flat, progress, fill, stroke, radius})`, `text(str, x, y, {role: display|body|mono|serif, size, weight, color, align: start|center|end, maxWidth, wrap, lineHeight, progress, caret})`, `line(points, {color, width, progress})`, `rule(x, y, w, {color, progress, height})`, `pill(rect, {fill, stroke, radius})`, `badge(text, x, y, {variant: solid|outline|tag})`, `button(text, x, y, {variant: primary|accent|secondary})`, `nino(x, y, size, {expression, t, look, white})`, `enter(t, kind)`, `post()`.

`x` for `text` with `align: 'start'` is the reading-start edge: use `box.start` and it works in RTL too.

### Effects: the footage and the cutout

The renderer draws the footage too. A component flagged `"scene": true` in its component.json takes the footage over while it's on screen (the plain footage layer is skipped), and draws it itself:

- `p.footage({ rect, zoom, focus: [fx, fy], filter, alpha, look })`: the shot, cover-fitted. `zoom` 2 shows half of it; `focus` is the point to zoom towards (fractions of the frame). `rect` draws it smaller (a phone screen, a card). Clip with `p.ctx` for rounded corners. `look` redraws the shot in one of twenty-nine looks: `neon` (glowing edges), `sketch` (pencil), `comic`, `chalk` (chalkboard), `pixel`, `riso` (two-ink print), `lowpoly`, `papercut`, `bricks`, `terminal` (green ASCII), `hologram` (see-through cyan, scanlines, glitch), `cyberpunk` (teal and magenta grade, bloom, haze), `isometric` (a honeycomb of toy cubes), `blueprint` (white line drawing on a drafting grid), `thermal` (ironbow heat camera with a crosshair), `anime` (flat cel tones, ink outlines), `watercolor` (washes on paper), `clay` (lit like modelling clay, at stop-motion's 12 poses a second), `woodblock` (ukiyo-e: flat inks, key lines, wood grain, indigo sky fade), `noir` (black, white and halftone, only the reds kept), `oldcartoon` (1930s: sepia tones in ink outlines on weaving, scratched film), `crt` (green vector lines on a curved tube), `sumi` (ink washes on rice paper, red seal), `knit` (a stitch per sample), `ps2` (low-res early 3D with dithering), `synthwave` (sunset grade, striped sun, neon grid floor), `marble` (white marble in a gilded frame), `underwater` (swaying water, caustics, light shafts, bubbles), `collage` (a torn black-and-white print taped on blue card). Works in a `rect` too, so a tile or a card can show a look. They restyle the shot's pixels; they don't redraw the room (an "isometric" look is your shot in cubes, not a 3D model of the room). `hologram`, `thermal` and `synthwave` use the clip's cutout when it has one (only you are projected; only you are hot; the sun and grid go behind you), and guess you're in the middle of the frame until it's made; the look components are flagged `aims`, so the app makes it.
- `p.subject({ …same, outline: { color, width } })`: you, cut out of the shot (the clip's matte), with an optional sticker edge. Draw what goes behind you first, then `p.subject()`, then what goes in front.
- `p.subjectBox()`: where you are, in pixels: `{ x, y, w, h, head: { x, y, r } }`. Use it to aim zooms and place things round your head.

Flag `"matte": true` on any component that calls `p.subject()`, so the app makes the matte (an export refuses without one). Flag `"aims": true` on one that only calls `p.subjectBox()` (a zoom on your face): the app makes the matte too, but without one it aims at a guess instead of refusing. A clip whose matte isn't ready draws as if it had none, the same in the preview, the export and snapshots; a matte is re-cut when its footage file changes. Without footage (Studio tiles) these draw a stand-in head and shoulders; without a matte yet, `subject()` draws the whole frame. `p.ctx` transforms and clips apply to all three.

Ready-made effects: `checklist`, `chart-grow`, `digital-zoom`, `phone`, `zoom-cut` (put it across a cut, half on each side), `backdrop`, `paper-cut`, `doodle-boil`, `cover-story`, `frame-break`, `orbit`, `vertigo`, `wall`, `glass-type`, `look` (your shot in one look, wiping in and out), `look-roll` (title, a numbered list filling in, and a card wiping through the looks: the "10 styles" reel format; `looks` picks any of the twenty-nine in order, e.g. `["hologram", "cyberpunk", "papercut", "isometric", "blueprint", "thermal", "anime", "terminal", "watercolor", "clay"]`; `names` relabels the list, e.g. in Arabic), `look-grid` (closing shot: every look as tiles round a typed "Comment «KEYWORD»" line). `bar-race` (bars race through periods and re-sort as one overtakes another; each bar is a line `"Name: 10, 40, 90"`, one value per period), `flowchart` (boxes and arrows drawing in step by step; `links` like `"1>3"` branch and join, none makes a chain), `type-slam` (kinetic type: one word a beat, thrown at the lens; `stack` keeps the earlier words), `flying-cards` (a deck dealt into a fan while a number counts up to `count`), `pixel-dissolve` (the shot coarsens into big pixels that flip one by one from look `from` to look `to`, then sharpens; `"none"` is the plain shot; put it between two `look`s or across a cut). One effect per beat: they're loud.

Other ready-made components: `hook`, `stat`, `list`, `card`, `band`, `cta`, `nino`, `lower-third`, `quote`, `code`, `compare`, `timeline`, `callout`, `scenery` (a drawn scene for a film with no footage, in the mode's colours and gently moving: `night` (a moon over a house on the hills), `sea` (fish, weed, light shafts, bubbles) or `museum` (a bust under a spotlight, a framed picture); it takes the frame over, so put graphics after it). Styles: `flat9k`, `chalkboard`, `pixel`, `editorial` (serif, printed page), `blueprint` (grid, dashed construction lines, mono), `sticker` (thick edges, hard shadows), `terminal` (mono, terminal windows), `synthwave` (a striped sun setting into a rolling grid floor, cards with a lit outline, headlines leaning on a hard shadow), `woodblock` (ukiyo-e: wood grain, uneven key lines, colour printed a hair off, a stepped sky), `noir` (halftone dots, square ink-bordered panels with halftone shadows, capital headlines), `sumi` (rice paper, cards as dry-brush strokes, tapered brush rules, a red seal on feature cards), `glass` (frosted panes that blur whatever is behind them). These five match the footage looks of the same names; the sun, grid, paper and sky are backgrounds, so they show in films without footage.

A style's `post()` runs on the graphics layer, never on the footage under it: pixel art pixelates the graphics and leaves you sharp.

## Writing a style

```js
// library/styles/<id>/style.js
export default (base) => ({
  panel(rect, o = {}) { /* draw it your way */ },
  text(str, x, y, o = {}) { return base.text.call(this, str, x, y, { ...o, caret: false }); },
});
```

Override only what changes. Call the base with `base.<method>.call(this, …)`. Use `this` (not `base`) for everything else, so other overrides apply. Params from `style.json` are in `this.params`. 3D styles are not supported yet.
