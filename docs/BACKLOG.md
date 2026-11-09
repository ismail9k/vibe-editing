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
- **Matte refinement**: the matte bleeds into a dark chair right behind the head (soft grey that outlines and paper cut make visible), and edges go soft on fast hand movement. Ideas: threshold and feather the edge, a temporal smoothing pass, or Vision's instance labels to drop the chair.
- **Preview colour on HDR clips**: the preview now draws the video into the canvas, and Chromium's HLG → SDR there is more contrasty than the export's reinhard tone map. Match one to the other.
- **Light-mode Studio tiles for photo effects**: cover story's white masthead and cover lines vanish on the light stand-in (they're meant for a photo).
- **Effect timing on a cut**: zoom-through cut must be placed by hand across a cut; snapping it to the cut would help.
- **Studio tiles with your footage**: tiles use a drawn stand-in; showing a still from the open project would preview cutout effects for real.
- **Ripple edits** (open question): deleting or trimming footage doesn't move later captions and graphics. CapCut does.

## Deferred from the effects review
- The preview can draw a cutout from the wrong time for a frame at a cut, while the matte video is still seeking.
- Mattes should be cut with `fps=30:start_time=0`, so a file whose video starts after its audio stays aligned.
- `rotationOf` reads only side-data rotation; older files with `tags.rotate` get a landscape matte for portrait footage.
- cover-story's issue label goes off-screen in RTL.
- Some effect text fades in instead of typing (cover-story lines, wall, orbit).
- A failed background matte run only retries when the footage changes.
- One missing clip stops the mattes for the clips after it.
- `FrameReader` copies every queued chunk on each frame.
- Small cleanup gaps: the encoder starts before the export's `try`; joining a matte run already in progress shows no progress.
- Existing workspaces never get preset updates (seeding doesn't overwrite), so an older `~/Vibe` lacks the new `aims` flag on digital-zoom and zoom-cut and keeps aiming at a guess.

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
