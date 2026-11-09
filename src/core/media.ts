// Footage and cutouts for the painter. The renderer hands each frame the footage under it (a <video> in the
// preview, decoded frames in the export) and the clip's cutout matte; scene components redraw them through
// footage(), subject() and subjectBox(). Sources may be any size: they're cover-fitted to the frame, the same
// way ffmpeg fits a clip, and a view (zoom + focus) picks the part of that frame a call shows.
import type { Ctx, Painter, Rect } from './painter';
import { drawLooked, isLook } from './looks';

export interface FrameMedia {
  /** The footage frame at this time, or null while it isn't available (preview loading). */
  frame: CanvasImageSource | null;
  /** The cutout matte (grey: white = the speaker), or null if the clip has none yet. */
  matte: CanvasImageSource | null;
  /** True when `matte` already carries the cutout in its alpha channel (the export builds it that way). */
  matteIsAlpha?: boolean;
}
export interface FootageOpts {
  /** Where to draw (default: the whole frame). */
  rect?: Rect;
  /** 1 = the whole frame; 2 = half of it, filling the rect. */
  zoom?: number;
  /** The point to zoom towards, as fractions of the frame (default centre). */
  focus?: [number, number];
  /** A canvas filter, e.g. 'grayscale(1) brightness(.6)' or 'blur(12px)'. */
  filter?: string;
  alpha?: number;
  /** Redraw the shot in a look: one of LOOKS in looks.ts (neon, sketch, comic, … thermal, anime, watercolor, clay). */
  look?: string;
}
export interface SubjectOpts extends FootageOpts { outline?: { color?: string; width?: number } }
export interface SubjectBox extends Rect { head: { x: number; y: number; r: number } }

export interface MediaEnv { media?: FrameMedia | null; clip: boolean; W: number; H: number }

const sizeOf = (s: CanvasImageSource): [number, number] => {
  const v = s as { videoWidth?: number; videoHeight?: number; displayWidth?: number; displayHeight?: number; width?: number; height?: number };
  if (v.videoWidth) return [v.videoWidth, v.videoHeight!];
  if (v.displayWidth) return [v.displayWidth, v.displayHeight!];
  return [Number(v.width) || 1, Number(v.height) || 1];
};

/** The window of the frame a call shows, and where it lands. */
function view(W: number, H: number, o: FootageOpts = {}) {
  const r = o.rect ?? { x: 0, y: 0, w: W, h: H };
  const zoom = Math.max(1, o.zoom ?? 1), [fx, fy] = o.focus ?? [0.5, 0.5];
  let vw = W / zoom, vh = H / zoom;
  const aspect = r.w / r.h;
  if (vw / vh > aspect) vw = vh * aspect; else vh = vw / aspect;
  const vx = Math.min(Math.max(0, fx * W - vw / 2), W - vw), vy = Math.min(Math.max(0, fy * H - vh / 2), H - vh);
  return { r, vx, vy, vw, vh };
}

/** The source rectangle that shows frame-space window (vx, vy, vw, vh) of a source cover-fitted to W×H. */
function sourceRect(src: CanvasImageSource, W: number, H: number, v: { vx: number; vy: number; vw: number; vh: number }): [number, number, number, number] {
  const [sw, sh] = sizeOf(src);
  const s = Math.max(W / sw, H / sh), ox = (sw - W / s) / 2, oy = (sh - H / s) / 2;
  return [ox + v.vx / s, oy + v.vy / s, v.vw / s, v.vh / s];
}

/** Bounding box and head of the subject in an alpha matte, as fractions of the matte. Null if it's empty. */
export function boxFromAlpha(a: ArrayLike<number>, w: number, h: number, stride: number, offset = 0, threshold = 128): SubjectBox | null {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (a[(y * w + x) * stride + offset] >= threshold) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const band = Math.max(1, Math.ceil((y1 - y0 + 1) * 0.22));
  let sum = 0, n = 0, widths = 0, rows = 0;
  for (let y = y0; y < y0 + band && y <= y1; y++) {
    let rowN = 0;
    for (let x = x0; x <= x1; x++) if (a[(y * w + x) * stride + offset] >= threshold) { sum += x + 0.5; n++; rowN++; }
    if (rowN) { widths += rowN; rows++; }
  }
  const r = rows ? widths / rows / 2 : (x1 - x0 + 1) / 4;
  return {
    x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h,
    head: { x: (n ? sum / n : (x0 + x1 + 1) / 2) / w, y: (y0 + r) / h, r: r / w },
  };
}

// The stand-in speaker for Studio tiles and projects without footage: a head and shoulders, in frame space.
const standInBox = (W: number, H: number): SubjectBox => {
  const r = W * 0.13, hy = H * 0.4;
  return { x: W * 0.14, y: hy - r, w: W * 0.72, h: H - (hy - r), head: { x: W / 2, y: hy, r } };
};
function silhouette(p: Painter, v: ReturnType<typeof view>, fill: string, grow = 0) {
  const c = p.ctx, b = standInBox(p.W, p.H), k = v.r.w / v.vw;
  c.save();
  c.beginPath(); c.rect(v.r.x, v.r.y, v.r.w, v.r.h); c.clip();
  c.translate(v.r.x - v.vx * k, v.r.y - v.vy * k); c.scale(k, k);
  c.fillStyle = fill;
  c.beginPath(); c.arc(b.head.x, b.head.y, b.head.r + grow, 0, Math.PI * 2); c.fill();
  c.beginPath();
  c.roundRect(b.x - grow, p.H * 0.56 - grow, b.w + grow * 2, p.H * 0.6, [p.W * 0.2, p.W * 0.2, 0, 0]);
  c.fill();
  c.restore();
}

/** The media primitives, mixed into the base painter. */
export function mediaMethods(env: MediaEnv) {
  const { media, clip } = env;
  let alpha: { canvas: OffscreenCanvas; w: number; h: number } | null = null;
  let box: SubjectBox | null | undefined;

  /** The matte with the cutout in its alpha channel (made once per frame). */
  function alphaMatte(p: Painter) {
    if (alpha || !media?.matte) return alpha;
    const [w, h] = sizeOf(media.matte);
    const canvas = p.canvas(w, h), g = canvas.getContext('2d')!;
    g.drawImage(media.matte, 0, 0, w, h);
    if (!media.matteIsAlpha) {
      const id = g.getImageData(0, 0, w, h), d = id.data;
      for (let i = 0; i < d.length; i += 4) { d[i + 3] = d[i]; d[i] = d[i + 1] = d[i + 2] = 255; }
      g.putImageData(id, 0, 0);
    }
    return (alpha = { canvas, w, h });
  }

  return {
    footage(this: Painter, o: FootageOpts = {}) {
      if (isLook(o.look)) {
        const { look, alpha, filter: _f, ...rest } = o;
        // The cutout, framed like the shot, for looks that treat you apart from the room (made only if one asks).
        const cutout = media?.frame && media.matte ? (q: Painter, rect: Rect) => {
          const m = alphaMatte(this)!;
          q.ctx.drawImage(m.canvas, ...sourceRect(m.canvas, this.W, this.H, view(this.W, this.H, { ...rest, rect })), rect.x, rect.y, rect.w, rect.h);
        } : null;
        drawLooked(this, look, o.rect ?? { x: 0, y: 0, w: this.W, h: this.H }, alpha, (q, rect) => q.footage({ ...rest, rect }), cutout);
        return;
      }
      const v = view(this.W, this.H, o), c = this.ctx;
      if (media?.frame) {
        c.save();
        if (o.filter) c.filter = o.filter;
        if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
        c.drawImage(media.frame, ...sourceRect(media.frame, this.W, this.H, v), v.r.x, v.r.y, v.r.w, v.r.h);
        c.restore();
        return;
      }
      const full = !o.rect;
      if (media === undefined || !clip) {
        // No footage here: the brand background (a plain panel for a clip with no media system), plus the
        // stand-in speaker when there's no media system at all (Studio tiles).
        if (full && !clip) this.background(this.t); else { c.fillStyle = this.theme.surface; c.fillRect(v.r.x, v.r.y, v.r.w, v.r.h); }
        if (media === undefined) silhouette(this, v, this.theme.border);
        return;
      }
      c.fillStyle = '#000'; c.fillRect(v.r.x, v.r.y, v.r.w, v.r.h); // the clip is still loading
    },

    subject(this: Painter, o: SubjectOpts = {}) {
      const v = view(this.W, this.H, o), c = this.ctx;
      const m = media?.frame ? alphaMatte(this) : null;
      if (media?.frame && m) {
        const out = this.canvas(v.r.w, v.r.h), g = out.getContext('2d')!;
        g.drawImage(media.frame, ...sourceRect(media.frame, this.W, this.H, v), 0, 0, v.r.w, v.r.h);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(m.canvas, ...sourceRect(m.canvas, this.W, this.H, v), 0, 0, v.r.w, v.r.h);
        c.save();
        if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
        if (o.outline) {
          // A sticker edge: the silhouette in one colour, stamped around the subject.
          const sil = this.canvas(v.r.w, v.r.h), s = sil.getContext('2d')!;
          s.drawImage(m.canvas, ...sourceRect(m.canvas, this.W, this.H, v), 0, 0, v.r.w, v.r.h);
          s.globalCompositeOperation = 'source-in';
          s.fillStyle = o.outline.color ?? '#FFFFFF'; s.fillRect(0, 0, v.r.w, v.r.h);
          const wdt = o.outline.width ?? this.rem * 0.5;
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            c.drawImage(sil, v.r.x + Math.cos(a) * wdt, v.r.y + Math.sin(a) * wdt);
          }
        }
        if (o.filter) c.filter = o.filter;
        c.drawImage(out, v.r.x, v.r.y);
        c.restore();
        return;
      }
      if (media?.frame) { this.footage(o); return; } // no cutout yet: the whole frame
      if (media === undefined) {
        if (o.outline) silhouette(this, v, o.outline.color ?? '#FFFFFF', o.outline.width ?? this.rem * 0.5);
        silhouette(this, v, this.theme.border);
      }
    },

    /** Where the speaker is, in frame pixels (a guess for the stand-in or when there's no matte). */
    subjectBox(this: Painter): SubjectBox {
      if (box === undefined) {
        box = null;
        const m = media?.frame ? alphaMatte(this) : null;
        if (m) {
          const tw = 54, th = Math.max(1, Math.round((54 * this.H) / this.W));
          const tiny = this.canvas(tw, th), g = tiny.getContext('2d')!;
          g.drawImage(m.canvas, ...sourceRect(m.canvas, this.W, this.H, view(this.W, this.H)), 0, 0, tw, th);
          box = boxFromAlpha(g.getImageData(0, 0, tw, th).data, tw, th, 4, 3);
        }
      }
      if (!box) return standInBox(this.W, this.H);
      const { W, H } = this;
      return { x: box.x * W, y: box.y * H, w: box.w * W, h: box.h * H, head: { x: box.head.x * W, y: box.head.y * H, r: box.head.r * W } };
    },
  };
}

export type MediaMethods = ReturnType<typeof mediaMethods>;
export type { Ctx };
