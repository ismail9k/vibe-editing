# Backlog

Ideas and known gaps, roughly in the order they'd pay off.

## Effects from the reference reel (instagram.com/reel/DfgiBYTIUmV) not built yet
- **UI world**: the clip shrinks into an app screen (a chat with "make it pop" typed in). Needs a small kit of mock-UI pieces (window chrome, chat bubble, input) drawn through the painter.
- **Pull-back reveal**: zoom out from the film to reveal it inside an editor with a timeline and "Rendering…". Same mock-UI kit; could show Vibe Editing itself.
- **Real 3D tilt** for the phone mock-up and the orbit card: canvas 2D only does flat transforms, so v1 uses rotation and scale. Needs WebGL quads or slice-warping.
- **Vertigo on the real background**: v1 swaps in a drawn tunnel. A true dolly zoom of your own room needs the background filled in behind you (inpainting).

## Engine
- **Zoom headroom**: footage is decoded at the output size, so a 2× punch-in is soft. Decode at 2× for clips under a zoom effect.
- **Cutouts off the Mac**: mattes use Apple Vision. For open source, add MediaPipe or Robust Video Matting as a second engine.
- **Matte refinement**: soft edges on fast hand movement; a temporal smoothing pass would help.
- **Studio tiles with your footage**: tiles use a drawn stand-in; showing a still from the open project would preview cutout effects for real.
- **Ripple edits** (open question): deleting or trimming footage doesn't move later captions and graphics. CapCut does.

## Deferred from the v1 review
- The preview shows an empty stage, not "missing media", for a missing clip.
- The app's Export says "Exported" even when frames had render errors.
- No timeout on the hidden render window.
- Dropping a file outside the Edit room navigates the window.
- An English tag inside an Arabic frame shows as "VIBE#" (wrap in LRI/PDI).
- An edit made under 300 ms before switching projects is lost.
- A relative `VIBE_HOME` breaks the self-write guard.
- `Range: bytes=-N` is parsed as `0-N`.
- `bin/vibe.mjs` builds only when `out/` is missing, so the CLI can run a stale build.
