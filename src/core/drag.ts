// Dragging graphics on the preview: finding what was clicked, and where a graphic lands when it's moved or
// resized. Pure maths on frame pixels and vibe.json fractions, so the canvas editor stays thin and this is tested.

/** A box in frame pixels. */
export interface Box { x: number; y: number; w: number; h: number }
/** A graphic's position as vibe.json stores it: frame fractions, x = centre, y = top, w = width. */
export interface Pos { x: number; y: number; w: number }

/** How close (as a fraction of the frame) a centre must come to the frame's centre line to snap onto it. */
export const SNAP = 0.015;
/** The narrowest a resize may make a graphic's drawing, as a fraction of the frame width. */
export const MIN_W = 0.04;
/** Alpha (0–255) above which a pixel counts as drawn. Low, so soft glows and fading text still count. */
const DRAWN = 8;

const round = (v: number) => Math.round(v * 1e4) / 1e4;

/** The box around every drawn pixel of an RGBA image, sampling every `step` pixels; null when nothing is drawn. */
export function alphaBounds(data: ArrayLike<number>, W: number, H: number, step = 2): Box | null {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y += step) {
    const row = y * W;
    for (let x = 0; x < W; x += step) {
      if (data[(row + x) * 4 + 3] > DRAWN) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return null;
  // Sampling can miss up to step - 1 pixels on the far edges.
  return { x: x0, y: y0, w: Math.min(W, x1 + step) - x0, h: Math.min(H, y1 + step) - y0 };
}

/** True when anything is drawn within `radius` pixels of (px, py), so thin strokes and small text are easy to grab. */
export function drawnNear(data: ArrayLike<number>, W: number, H: number, px: number, py: number, radius: number): boolean {
  const cx = Math.round(px), cy = Math.round(py), r = Math.max(0, Math.round(radius));
  for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
      if (data[(y * W + x) * 4 + 3] > DRAWN) return true;
    }
  }
  return false;
}

export const inside = (b: Box, x: number, y: number, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;

/** Where a graphic lands after moving the pointer (dx, dy) frame pixels from `start`. Unless `free`, the drawing's
 *  centre snaps to the frame's centre lines; `guides` says which line it snapped to. */
export function moved(start: Pos, box: Box, dx: number, dy: number, W: number, H: number, free = false): { pos: Pos; guides: { v: boolean; h: boolean } } {
  const guides = { v: false, h: false };
  if (!free) {
    const cx = box.x + box.w / 2 + dx, cy = box.y + box.h / 2 + dy;
    if (Math.abs(cx - W / 2) < SNAP * W) { dx += W / 2 - cx; guides.v = true; }
    if (Math.abs(cy - H / 2) < SNAP * H) { dy += H / 2 - cy; guides.h = true; }
  }
  return { pos: { x: round(start.x + dx / W), y: round(start.y + dy / H), w: round(start.w) }, guides };
}

/** Where a graphic lands after dragging one side of its drawing by dx frame pixels. The width scales with the
 *  drawing, and x shifts so the opposite side stays where it was (a drawing scales about its centre x). */
export function resized(start: Pos, box: Box, edge: 'left' | 'right', dx: number, W: number): Pos {
  const width = Math.max(MIN_W * W, box.w + (edge === 'right' ? dx : -dx));
  const k = width / box.w;
  const anchor = edge === 'right' ? box.x : box.x + box.w;
  const cx = anchor - (anchor - start.x * W) * k;
  return { x: round(cx / W), y: round(start.y), w: round(start.w * k) };
}
