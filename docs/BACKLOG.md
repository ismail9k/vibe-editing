# Backlog

Ideas and known gaps, roughly in the order they'd pay off.

## Effects from the reference reel (instagram.com/reel/DfgiBYTIUmV) not built yet
- **UI world**: the clip shrinks into an app screen (a chat with "make it pop" typed in). Needs a small kit of mock-UI pieces (window chrome, chat bubble, input) drawn through the painter.
- **Pull-back reveal**: zoom out from the film to reveal it inside an editor with a timeline and "Rendering…". Same mock-UI kit; could show Vibe Editing itself.
- **Real 3D tilt** for the phone mock-up and the orbit card: canvas 2D only does flat transforms, so v1 uses rotation and scale. Needs WebGL quads or slice-warping.
- **Vertigo on the real background**: v1 swaps in a drawn tunnel. A true dolly zoom of your own room needs the background filled in behind you (inpainting).

## Looks from the reference reel (instagram.com/reel/DfgtLums66K) not built yet
- **Graphics styles to match the looks**: neon, comic, riso, paper and bricks restyle only the footage; panels and text keep the project's style. Chalkboard, pixel and terminal already exist as styles.
- **A look on just you or just the room**: `p.subject({ look })`, so you stay real in a sketched room (or the reverse).
- **Comic burst**: the jagged "BOOM!" sticker over the comic look, typed in the brand's display font.
- **Pixel-art HUD**: a score counter and hearts over the pixel look, game-style.
- **Chalk notes**: handwritten labels and arrows on the chalkboard look, pointing at you.
- **Live preview cost**: every frame of a look is sampled and redrawn on the CPU; terminal (≈4,000 characters) and bricks are the heaviest. Not measured in the Edit room yet; if it stutters, cache the look per video frame or move it to WebGL.

## Looks from the second reel (instagram.com/reel/DffdKwWES9B) not built yet
- **Scene rebuilds**: the reel's isometric, claymation and anime shots are generated, so the room itself is remodelled (an isometric diorama, a clay figure). Our looks restyle the shot's pixels: isometric is your shot in toy cubes, clay is your shot lit like clay. A true rebuild needs an image model per frame.
- **Hologram on just you**: the reel's hologram floats over a dark room. Needs `p.subject({ look })` (also in the list above).

## The "30 animations" and "10 styles, one prompt" reels (instagram.com/reel/DffhyPkv7Uv, instagram.com/reel/DfZ_iPdttLt)
Both are illustrated films with no footage. Their styles came in as footage looks (woodblock, noir, 1930s cartoon, CRT, sumi, knit, PS2, synthwave, marble, underwater, collage) and four components (bar race, flowchart, type slam, flying cards); pixel, brick, clay, chalkboard, blueprint, paper cut, watercolour, sticker, comic, neon and low poly already existed. Not built:
- **Graphics styles to match**: the new looks restyle only the footage; panels and text keep the project's style. Synthwave, woodblock, noir and sumi would make strong whole-film styles.
- **Drawn scenes**: marble museum, night sky, underwater, kids cartoon, felt story and the 3D character are scenes drawn from nothing (a bust in a frame, a moon over a house). Vibe restyles your shot instead; a library of drawn backdrops would cover films without footage.
- **Frosted glass, avatar dashboard, gold chart**: close to `glass-type`, `stat` and `chart-grow`; a glassmorphism style and a gold variant of the chart would finish them.
- **Pixel dissolve**: a transition where the shot breaks into pixels and reforms as the next look.

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
- cover-story's issue label goes off-screen in RTL.
- Some effect text fades in instead of typing (cover-story lines, wall, orbit).
- `FrameReader` copies every queued chunk on each frame.
- Small cleanup gaps: the encoder starts before the export's `try`; joining a matte run already in progress shows no progress.
- Existing workspaces never get preset updates (seeding doesn't overwrite), so an older `~/Vibe` lacks the new `aims` flag on digital-zoom and zoom-cut and keeps aiming at a guess.

## Deferred from the v1 review
- An English tag inside an Arabic frame shows as "VIBE#" (wrap in LRI/PDI).
