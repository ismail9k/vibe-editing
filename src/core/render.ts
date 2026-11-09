// renderFrame: one frame of a project at time t. Pure: same inputs, same pixels.
// Used by the preview, the Studio grid, snapshots and the export.
import { footageAt, type Graphic, type Project } from './model';
import { createBasePainter, applyStyle, type Ctx, type Painter, type StyleModule } from './painter';
import type { FrameMedia } from './media';
import { drawCaption } from './captions';
import { clamp } from './motion';
import type { Brand } from './brand';
import type { ComponentMeta } from './validate';

export interface ParamSpec { type: 'number' | 'select' | 'bool' | 'color' | 'text'; label: string; value: unknown; min?: number; max?: number; step?: number; options?: string[] }
export interface StyleMeta { name: string; description: string; preset?: boolean; params: Record<string, ParamSpec> }

export interface Place { x: number; y: number; w: number; left: number; right: number; start: number; end: number }
export interface DrawArgs {
  t: number; dur: number; props: Record<string, unknown>; graphic: Graphic;
  /** Resolve the graphic's box: defaults as fractions of the frame (x = centre, y = top, w = width), overridden by the graphic's own x / y / w. */
  place(def: { x?: number; y: number; w: number }): Place;
}
export interface ComponentModule { draw(p: Painter, a: DrawArgs): void }

export interface LibStyle { id: string; meta: StyleMeta; mod?: StyleModule; error?: string }
export interface LibComponent { id: string; meta: ComponentMeta; mod?: ComponentModule; error?: string }
export interface Library { brand: Brand; styles: Record<string, LibStyle>; components: Record<string, LibComponent> }

export const EXIT = 0.25;

export function styleParams(meta?: StyleMeta): Record<string, unknown> {
  return Object.fromEntries(Object.entries(meta?.params ?? {}).map(([k, v]) => [k, v.value]));
}

export function makePainter(ctx: Ctx, project: Project, lib: Library, t: number, media?: FrameMedia | null): { p: Painter; error?: string } {
  const style = lib.styles[project.style] ?? lib.styles.flat9k;
  const base = createBasePainter(ctx, {
    W: project.format.w, H: project.format.h, dir: project.dir, mode: project.mode,
    brand: lib.brand, params: styleParams(style?.meta), t, media, clip: !!footageAt(project, t),
  });
  const { painter, error } = applyStyle(base, style?.mod);
  return { p: painter, error: style?.error ?? error };
}

/** Draws the frame and returns the problems it hit (a broken component draws a red box instead of stopping the frame).
 *  `media` is the footage under this time; leave it out where there's no footage system (Studio tiles get a stand-in). */
export function renderFrame(ctx: Ctx, project: Project, lib: Library, t: number, media?: FrameMedia | null): string[] {
  const errors: string[] = [];
  const { w: W, h: H } = project.format;
  // Start every frame from a clean context, whatever the last one left behind.
  (ctx as { reset?: () => void }).reset?.();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.setLineDash?.([]);
  ctx.clearRect(0, 0, W, H);
  const { p, error } = makePainter(ctx, project, lib, t, media);
  if (error) errors.push(error);

  const active = project.tracks.graphics.filter((g) => t >= g.at && t < g.at + g.dur).sort((a, b) => a.at - b.at);
  // The footage layer (or the brand background), unless a scene component is drawing the footage itself. In a
  // scene's last EXIT seconds it fades out, so the footage goes back under it.
  if (!active.some((g) => lib.components[g.type]?.meta.scene && t - g.at < g.dur - EXIT)) {
    const base = sandboxed(ctx, () => (footageAt(project, t) ? p.footage() : p.background(t)));
    if (base) errors.push(`${footageAt(project, t) ? 'footage' : 'background'}: ${base}`);
  }
  for (const g of active) {
    const comp = lib.components[g.type];
    const local = t - g.at;
    const args: DrawArgs = { t: local, dur: g.dur, props: { ...(comp?.meta.defaults ?? {}), ...g.props }, graphic: g, place: (def) => place(p, g, def) };
    const msg = sandboxed(ctx, () => {
      ctx.globalAlpha = clamp((g.dur - local) / EXIT);
      if (!comp) throw new Error(`unknown component "${g.type}"`);
      if (!comp.mod) throw new Error(comp.error ?? `${g.type} has no draw code`);
      comp.mod.draw(p, args);
    });
    if (msg) {
      errors.push(`${g.id} (${g.type}): ${msg}`);
      sandboxed(ctx, () => errorBox(p, `${g.id} (${g.type}): ${msg}`, args.place({ y: 0.4, w: 0.8 })));
    }
  }

  for (const cap of project.tracks.captions) {
    if (!(t >= cap.at && t < cap.at + cap.dur)) continue;
    const msg = sandboxed(ctx, () => drawCaption(p, cap, t));
    if (msg) {
      errors.push(`caption ${cap.id}: ${msg}`);
      sandboxed(ctx, () => errorBox(p, `caption ${cap.id}: ${msg}`, place(p, { at: 0, dur: 1 } as Graphic, { y: 0.74, w: 0.8 })));
    }
  }
  const postMsg = sandboxed(ctx, () => p.post());
  if (postMsg) errors.push(`post: ${postMsg}`);
  return errors;
}

/** Run user drawing code (components, styles) so nothing it does to the context outlives it: every save it
 *  made is unwound, even when it throws, and it can't restore past its own start. Returns the error message. */
function sandboxed(ctx: Ctx, fn: () => void): string | null {
  const own = ctx as unknown as { save: () => void; restore: () => void };
  const save = own.save, restore = own.restore;
  let depth = 0;
  own.save = function () { depth++; save.call(ctx); };
  own.restore = function () { if (depth > 0) { depth--; restore.call(ctx); } };
  save.call(ctx);
  try { fn(); return null; }
  catch (e) { return (e as Error)?.message ?? String(e); }
  finally {
    while (depth-- > 0) restore.call(ctx);
    delete (own as { save?: unknown }).save; delete (own as { restore?: unknown }).restore;
    if (own.save !== save) { own.save = save; own.restore = restore; } // contexts with own-property methods
    restore.call(ctx);
  }
}

function place(p: Painter, g: Graphic, def: { x?: number; y: number; w: number }): Place {
  const w = (g.w ?? def.w) * p.W, x = (g.x ?? def.x ?? 0.5) * p.W, y = (g.y ?? def.y) * p.H;
  const left = x - w / 2, right = x + w / 2, rtl = p.dir === 'rtl';
  return { x, y, w, left, right, start: rtl ? right : left, end: rtl ? left : right };
}

function errorBox(p: Painter, msg: string, at: Place) {
  const c = p.ctx, h = p.rem * 3.2;
  c.fillStyle = 'rgba(160,20,20,0.92)';
  c.fillRect(at.left, at.y, at.w, h);
  c.fillStyle = '#FFFFFF';
  c.font = `600 ${Math.round(p.rem * 0.8)}px "IBM Plex Mono", monospace`;
  c.textAlign = 'left'; c.direction = 'ltr'; c.textBaseline = 'middle';
  c.fillText(msg.slice(0, 80), at.left + p.rem * 0.6, at.y + h / 2, at.w - p.rem * 1.2);
}
