# Vibe Editing workspace

This folder is Ismail's Vibe Editing workspace. The Vibe Editing app shows it live: every file you change here appears in the app within a second. You drive the edit; he watches, nudges and approves in the app.

## Layout

```
library/brand.json                     the brand: colours, modes (dark / light / green), fonts, the design-language rules
library/styles/<id>/style.json         a style's name, description and params (each param: type, label, value, min/max/step or options)
library/styles/<id>/style.js           its drawing code
library/components/<id>/component.json name, description, default duration, default props, prop schema
library/components/<id>/component.js   its drawing code
projects/<name>/vibe.json              a film: format, style, mode, dir, tracks
projects/<name>/media/                 footage and sounds
projects/<name>/.vibe/session.json     written by the app: what he's looking at (room, selection, playhead). Read it, never write it
projects/<name>/out/                   renders and snapshots
```

## Rules

- **Read `library/brand.json` → `rules` before designing anything.** Colours come from the brand and the mode, never from a style or a component. One orange accent per shot.
- When he says "this one" or "here", read `.vibe/session.json` for the selected item and the playhead.
- Look at your work: `vibe snapshot <project> --at 1.2,3.5` writes PNGs to `projects/<project>/out/`. Open them before you say something is done.
- `vibe check <project>` validates the project against the library. Fix every error.
- `vibe render <project>` exports `out/<name>.mp4`. Only render when he asks.
- No `Math.random`: use `p.rng(seed)` so every frame is the same in preview and export.

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
- A graphic's `x`, `y`, `w` (fractions of the frame: centre x, top y, width) override the component's default placement.
- Props not given fall back to the component's `defaults`.

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

## Writing a style

```js
// library/styles/<id>/style.js
export default (base) => ({
  panel(rect, o = {}) { /* draw it your way */ },
  text(str, x, y, o = {}) { return base.text.call(this, str, x, y, { ...o, caret: false }); },
});
```

Override only what changes. Call the base with `base.<method>.call(this, …)`. Use `this` (not `base`) for everything else, so other overrides apply. Params from `style.json` are in `this.params`. 3D styles are not supported yet.
