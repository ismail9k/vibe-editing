// The painter: the drawing vocabulary components use. This file is the base style (9k flat).
// A style module receives the base painter and returns the methods it changes:
//   export default (base) => ({ panel(r, o) { … base.panel.call(this, r, o) … } })
// Base methods call each other through `this`, so a style's override is used everywhere.
import { motion, clamp, type SpringKind } from './motion';
import { themeOf, cssFamily, type Brand, type ThemeTokens } from './brand';
import type { Dir, Mode } from './model';
import { mediaMethods, type FrameMedia, type FootageOpts, type SubjectOpts, type SubjectBox } from './media';
export { boxFromAlpha } from './media';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export interface Rect { x: number; y: number; w: number; h: number }
export type Role = 'display' | 'body' | 'mono' | 'serif';
export type Align = 'start' | 'center' | 'end';
export interface TextOpts {
  role?: Role; size?: number; weight?: number; color?: string; align?: Align;
  maxWidth?: number; wrap?: boolean; lineHeight?: number;
  progress?: number; caret?: boolean; seed?: number; baseline?: CanvasTextBaseline;
}
export interface PanelOpts { variant?: 'default' | 'feature' | 'flat'; progress?: number; seed?: number; fill?: string; stroke?: string; radius?: number }
export interface LineOpts { color?: string; width?: number; progress?: number; seed?: number }
export interface Env {
  W: number; H: number; dir: Dir; mode: Mode; brand: Brand; params: Record<string, unknown>; t: number;
  /** The footage under this frame; undefined means there's no footage system at all (Studio tiles). */
  media?: FrameMedia | null;
  /** Whether the timeline has a clip at this time. */
  clip?: boolean;
}

export interface Painter {
  ctx: Ctx; W: number; H: number; rem: number; dir: Dir; mode: Mode; t: number;
  theme: ThemeTokens; brand: Brand; params: Record<string, unknown>; m: typeof motion;
  rng(seed: number | string): () => number;
  sx(x: number): number;
  canvas(w: number, h: number): OffscreenCanvas;
  font(role: Role, size: number, weight?: number): void;
  measure(str: string, o?: TextOpts): number;
  fit(str: string, o: TextOpts): number;
  background(t: number): void;
  panel(r: Rect, o?: PanelOpts): void;
  text(str: string, x: number, y: number, o?: TextOpts): { w: number; h: number };
  line(points: [number, number][], o?: LineOpts): void;
  rule(x: number, y: number, w: number, o?: LineOpts & { height?: number }): void;
  pill(r: Rect, o?: { fill?: string; stroke?: string; radius?: number }): void;
  badge(text: string, x: number, y: number, o?: { variant?: 'solid' | 'outline' | 'tag'; size?: number; align?: Align }): { w: number; h: number };
  button(text: string, x: number, y: number, o?: { variant?: 'primary' | 'accent' | 'secondary'; size?: number; align?: Align }): { w: number; h: number };
  nino(x: number, y: number, size: number, o?: { expression?: string; t?: number; look?: string; white?: boolean }): void;
  enter(t: number, kind?: SpringKind): number;
  post(): void;
  /** The footage at this time, fitted to `rect` (default: the frame), optionally zoomed. */
  footage(o?: FootageOpts): void;
  /** The speaker cut out of the footage (the whole frame until the clip has a matte). */
  subject(o?: SubjectOpts): void;
  /** Where the speaker is, in frame pixels, with their head. */
  subjectBox(): SubjectBox;
}

export type StyleModule = (base: Painter) => Partial<Painter>;

const roundRect = (ctx: Ctx, r: Rect, rad: number) => {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, Math.max(0, Math.min(rad, r.w / 2, r.h / 2)));
};

// ---- Nino, the 9k pixel mascot (64-unit viewBox), from brand.js ----------------------------
type Shape = number[] | { d: string };
const NINO_FACES: Record<string, { eyes: Shape[]; brows?: Shape[]; cheeks?: boolean; mouth: string }> = {
  idle: { eyes: [[18, 16, 12, 12], [34, 16, 12, 12]], mouth: 'M18 32H22V34H42V32H46V36H44V38H40V40H24V38H20V36H18Z' },
  happy: { eyes: [{ d: 'M20 20H28V22H30V28H26V24H22V28H18V22H20Z' }, { d: 'M36 20H44V22H46V28H42V24H38V28H34V22H36Z' }], cheeks: true, mouth: 'M18 32H46V34H44V38H40V40H24V38H20V34H18Z' },
  thinking: { eyes: [[18, 22, 12, 4], [34, 16, 12, 12]], brows: [[18, 18, 10, 2], [34, 12, 12, 2]], mouth: 'M32 34H42V38H32Z' },
  worried: { eyes: [[20, 22, 8, 8], [36, 22, 8, 8]], brows: [{ d: 'M18 18H22V16H28V18H22V20H18Z' }, { d: 'M36 16H42V18H46V20H42V18H36Z' }], mouth: 'M20 40V36H24V34H40V36H44V40H40V38H24V40Z' },
  surprised: { eyes: [[18, 14, 12, 16], [34, 14, 12, 16]], mouth: 'M28 34H36V36H38V40H36V42H28V40H26V36H28Z' },
  'eyes-closed': { eyes: [{ d: 'M18 22H20V24H28V22H30V26H18Z' }, { d: 'M34 22H36V24H44V22H46V26H34Z' }], cheeks: true, mouth: 'M22 34H26V36H38V34H42V38H38V40H26V38H22Z' },
};
export const NINO_EXPRESSIONS = Object.keys(NINO_FACES);
const NINO_BODY = {
  rects: [[20, 48, 4, 2], [40, 48, 4, 2], [16, 50, 12, 6], [36, 50, 12, 6], [2, 24, 6, 14], [56, 24, 6, 14], [30, 4, 4, 4]],
  antenna: [28, 0, 8, 4], cheeks: [[14, 32, 4, 2], [46, 32, 4, 2]],
  head: 'M10 8H54V10H56V46H54V48H10V46H8V10H10Z', screen: 'M14 12H50V14H52V42H50V44H14V42H12V14H14Z', glint: 'M14 14H18V16H16V18H14V14Z',
};

const glowCache = new Map<string, OffscreenCanvas>();

/** A soft round glow of one colour, fading to nothing at its edge (cached per colour and size). */
function glowSprite(color: string, size: number): OffscreenCanvas {
  const d = Math.ceil(size), key = `glow|${d}|${color}`;
  let sprite = glowCache.get(key);
  if (!sprite) {
    sprite = new OffscreenCanvas(d, d);
    const o = sprite.getContext('2d')!, half = d / 2;
    o.fillStyle = color; o.fillRect(0, 0, d, d);
    o.globalCompositeOperation = 'destination-in';
    const rad = o.createRadialGradient(half, half, 0, half, half, half);
    rad.addColorStop(0, '#000'); rad.addColorStop(0.3, 'rgba(0,0,0,0.6)'); rad.addColorStop(0.65, 'rgba(0,0,0,0.18)'); rad.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = rad; o.fillRect(0, 0, d, d);
    glowCache.set(key, sprite);
  }
  return sprite;
}

/** The faint dot grid over the top of the frame, fading out before the middle (cached per frame size and colour). */
function dotGrid(W: number, H: number, rem: number, color: string): OffscreenCanvas {
  const key = `dots|${W}|${H}|${color}`;
  let sprite = glowCache.get(key);
  if (!sprite) {
    sprite = new OffscreenCanvas(W, H);
    const o = sprite.getContext('2d')!, step = Math.max(4, Math.round(rem * 0.7)), dot = Math.max(1, Math.round(rem / 16));
    o.fillStyle = color; o.globalAlpha = 0.08;
    for (let y = step / 2; y < H * 0.62; y += step) for (let x = step / 2; x < W; x += step) o.fillRect(Math.round(x), Math.round(y), dot, dot);
    o.globalAlpha = 1; o.globalCompositeOperation = 'destination-in';
    const fade = o.createLinearGradient(0, 0, 0, H * 0.62);
    fade.addColorStop(0, '#000'); fade.addColorStop(0.55, 'rgba(0,0,0,0.7)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = fade; o.fillRect(0, 0, W, H);
    glowCache.set(key, sprite);
  }
  return sprite;
}

/** A line with Latin letters and no right-to-left script: in an RTL frame it is laid out on its own, left to
 *  right, or the bidi algorithm moves its leading and trailing punctuation to the wrong end ("VIBE#"). */
const latinOnly = (s: string) => /[A-Za-z\u00C0-\u024F]/.test(s) && !/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(s);

export function createBasePainter(ctx: Ctx, env: Env): Painter {
  const theme = themeOf(env.brand, env.mode);
  const rem = (Math.min(env.W, env.H) / 1080) * 32;
  const families = (role: Role) => {
    const f = env.brand.fonts;
    if (env.dir === 'rtl' && role !== 'mono') return cssFamily(f.arabic, 'sans-serif');
    return cssFamily(f[role] ?? f.body, role === 'mono' ? 'monospace' : role === 'serif' ? 'serif' : 'sans-serif');
  };
  ctx.direction = env.dir;

  const p: Painter = {
    ctx, W: env.W, H: env.H, rem, dir: env.dir, mode: env.mode, t: env.t,
    theme, brand: env.brand, params: env.params, m: motion,
    rng(seed) { return motion.rng(typeof seed === 'number' ? seed : motion.hash(seed)); },
    sx(x) { return this.dir === 'rtl' ? this.W - x : x; },
    canvas(w, h) { return new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); },
    font(role, size, weight = 400) { this.ctx.font = `${weight} ${Math.round(size)}px ${families(role)}`; },
    measure(str, o = {}) {
      this.font(o.role ?? 'body', o.size ?? this.rem, o.weight ?? 400);
      return this.ctx.measureText(str).width;
    },
    // Largest size ≤ o.size whose width fits o.maxWidth, never under 60 %.
    fit(str, o) {
      let size = o.size ?? this.rem;
      if (!o.maxWidth) return size;
      const min = size * 0.6;
      while (size > min && this.measure(str, { ...o, size }) > o.maxWidth) size *= 0.94;
      return Math.max(size, min);
    },

    // The 9k cover: a near-black room with a faint dot grid up top, pixel specks drifting up, a green glow
    // behind where you stand and an orange one low on the right edge. Everything breathes over 40 s.
    background(t) {
      const c = this.ctx, W = this.W, H = this.H, rem = this.rem, rtl = this.dir === 'rtl';
      c.fillStyle = this.theme.bg;
      c.fillRect(0, 0, W, H);
      const [green, mid, orange] = this.theme.glow, ph = 0.5 - 0.5 * Math.cos((Math.PI * (t % 40)) / 20);
      const blob = (color: string, x: number, y: number, size: number, sy: number, alpha: number) => {
        const sprite = glowSprite(color, size), half = sprite.width / 2;
        c.save();
        c.globalAlpha = alpha;
        c.translate(x, y); c.scale(1, sy);
        c.drawImage(sprite, -half, -half);
        c.restore();
      };
      const o = this.theme.glowOpacity, big = Math.max(W, H);
      // Kept as soft as the site (ismail9k.com): the glows only tint the dark, they never light it up.
      // Behind the speaker: a tall green glow, brighter at its heart.
      blob(green, W * 0.5 + (rtl ? 1 : -1) * W * 0.03 * ph, H * (0.6 - 0.02 * ph), big * 0.66 * (1 + 0.05 * ph), 1.2, o * 0.6);
      blob(mid, W * 0.5, H * 0.6, big * 0.34, 1.3, o * 0.35);
      // Orange, half off-screen on the right edge, low down (the same in both directions, as on the covers).
      blob(orange, W, H * (0.86 - 0.04 * ph), big * 0.3, 1.6, o * 0.6);
      c.drawImage(dotGrid(W, H, rem, this.theme.text), 0, 0);
      // Pixel specks: whole-pixel squares in green, orange and grey, drifting up and twinkling.
      const r = this.rng(9), n = Math.round(30 * (W * H) / (1080 * 1920));
      const colors = [this.theme.primaryText, this.theme.primaryText, this.brand.colors.accent, this.theme.muted, this.theme.muted];
      c.save();
      for (let i = 0; i < n; i++) {
        const x0 = r() * W, y0 = r() * H, s = Math.max(2, Math.round(rem * (r() < 0.6 ? 0.12 : 0.18)));
        const color = colors[Math.floor(r() * colors.length)], speed = rem * (0.15 + 0.35 * r()), period = 3 + 5 * r(), phase = r();
        const y = (((y0 - t * speed) % H) + H) % H;
        c.globalAlpha = 0.12 + 0.33 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (t / period + phase)));
        c.fillStyle = color;
        c.fillRect(Math.round(x0), Math.round(y), s, s);
      }
      c.restore();
    },

    panel(r, o = {}) {
      const c = this.ctx, prog = clamp(o.progress ?? 1), variant = o.variant ?? 'default';
      if (variant === 'flat' || prog <= 0) return;
      c.save();
      c.globalAlpha *= clamp(prog * 1.6);
      const s = 0.96 + 0.04 * prog;
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(s, s); c.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
      if (variant === 'feature') { c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = this.rem * 0.8; c.shadowOffsetY = this.rem * 0.25; }
      roundRect(c, r, o.radius ?? (variant === 'feature' ? this.rem : this.rem * 0.75));
      c.fillStyle = o.fill ?? (variant === 'feature' ? this.theme.raised : this.theme.surface);
      c.fill();
      c.shadowColor = 'transparent';
      c.lineWidth = Math.max(1, this.rem / (variant === 'feature' ? 12 : 16));
      c.strokeStyle = o.stroke ?? (variant === 'feature' ? this.brand.colors.accent : this.theme.border);
      c.stroke();
      c.restore();
    },

    text(str, x, y, o = {}) {
      const c = this.ctx, role = o.role ?? 'body', weight = o.weight ?? (role === 'display' ? 700 : 400);
      let size = o.size ?? this.rem;
      const lh = (o.lineHeight ?? 1.2) * size;
      // Wrap into lines first (wrap needs maxWidth), otherwise shrink to fit.
      let lines = [str];
      if (o.wrap && o.maxWidth) {
        this.font(role, size, weight);
        lines = [];
        let cur = '';
        for (const word of str.split(/\s+/)) {
          const next = cur ? `${cur} ${word}` : word;
          if (cur && c.measureText(next).width > o.maxWidth) { lines.push(cur); cur = word; } else cur = next;
        }
        if (cur) lines.push(cur);
      } else if (o.maxWidth) size = this.fit(str, { ...o, role, weight, size });
      this.font(role, size, weight);
      c.save();
      c.fillStyle = o.color ?? this.theme.text;
      c.textAlign = o.align ?? 'start';
      c.textBaseline = o.baseline ?? 'alphabetic';
      c.direction = this.dir;
      // Reveal: typed, character by character, with the orange caret (the 9k signature).
      const prog = clamp(o.progress ?? 1), align = o.align ?? 'start', rtl = this.dir === 'rtl';
      const total = lines.reduce((n, l) => n + [...l].length, 0);
      const cw = size * 0.08, gap = size * 0.06;
      let remaining = Math.round(prog * total), w = 0, caret: { i: number; x: number } | null = null;
      lines.forEach((line, i) => {
        const chars = [...line], n = Math.min(chars.length, Math.max(0, remaining));
        remaining -= chars.length;
        const visible = chars.slice(0, n).join(''), lw = c.measureText(line).width, vw = c.measureText(visible).width;
        let caretX: number;
        if (rtl && latinOnly(line)) {
          // English in an Arabic frame (a #tag, a product name): laid out left to right in the place the whole
          // line takes, so "#VIBE" keeps its # in front and types from its first letter, caret after the last.
          const left = align === 'end' ? x : align === 'center' ? x - lw / 2 : x - lw;
          c.direction = 'ltr'; c.textAlign = 'left';
          if (visible) c.fillText(visible, left, y + i * lh);
          c.direction = this.dir; c.textAlign = align;
          caretX = left + vw + gap;
        } else {
          if (visible) c.fillText(visible, x, y + i * lh);
          // Where the typed text ends, in the reading direction (centred text grows from its middle).
          const reach = align === 'end' ? 0 : align === 'center' ? vw / 2 : vw;
          const edge = rtl ? x - reach : x + reach;
          caretX = rtl ? edge - gap - cw : edge + gap;
        }
        w = Math.max(w, lw);
        if (!caret && (n < chars.length || i === lines.length - 1)) caret = { i, x: caretX };
      });
      if (caret && prog < 1 && o.caret !== false) {
        const { i, x: cx } = caret as { i: number; x: number };
        c.fillStyle = this.brand.colors.accent;
        c.fillRect(cx, y + i * lh - size * 0.78, cw, size * 0.92);
      }
      c.restore();
      return { w, h: lines.length * lh };
    },

    line(points, o = {}) {
      if (points.length < 2) return;
      const c = this.ctx, prog = clamp(o.progress ?? 1);
      const segs = points.slice(1).map((pt, i) => Math.hypot(pt[0] - points[i][0], pt[1] - points[i][1]));
      let left = segs.reduce((a, b) => a + b, 0) * prog;
      c.save();
      c.strokeStyle = o.color ?? this.theme.text;
      c.lineWidth = o.width ?? this.rem * 0.12;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length && left > 0; i++) {
        const f = Math.min(1, left / (segs[i - 1] || 1));
        c.lineTo(points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f);
        left -= segs[i - 1];
      }
      c.stroke();
      c.restore();
    },

    rule(x, y, w, o = {}) {
      const prog = clamp(o.progress ?? 1), h = o.height ?? this.rem * 0.18;
      const c = this.ctx;
      c.save();
      c.fillStyle = o.color ?? this.brand.colors.accent;
      const ww = w * prog;
      c.fillRect(this.dir === 'rtl' ? x - ww : x, y, ww, h);
      c.restore();
    },

    pill(r, o = {}) {
      const c = this.ctx;
      c.save();
      roundRect(c, r, o.radius ?? r.h / 2);
      if (o.fill) { c.fillStyle = o.fill; c.fill(); }
      if (o.stroke) { c.lineWidth = Math.max(1, this.rem / 16); c.strokeStyle = o.stroke; c.stroke(); }
      c.restore();
    },

    badge(text, x, y, o = {}) {
      const variant = o.variant ?? 'outline', size = o.size ?? this.rem * 0.7;
      // A tag reads like a hashtag (#Free_Tier): kept in its own case, on a dark outlined pill.
      const tag = variant === 'tag', weight = tag ? 700 : 600;
      let label = tag ? `#${text.replace(/^#/, '').replace(/\s+/g, '_')}` : text.toUpperCase();
      // A Latin tag in an RTL film keeps its # in front: isolate it as left-to-right.
      if (tag && this.dir === 'rtl' && !/[\u0590-\u08FF]/.test(label)) label = `\u2066${label}\u2069`;
      const padX = size * (tag ? 1 : 0.75), h = size * (tag ? 2.3 : 2), w = this.measure(label, { role: 'body', size, weight }) + padX * 2;
      const left = alignLeft(this, x, w, o.align);
      if (variant === 'solid') this.pill({ x: left, y, w, h }, { fill: this.brand.colors.primary });
      else if (tag) this.pill({ x: left, y, w, h }, { fill: this.theme.surface, stroke: this.theme.border });
      else this.pill({ x: left, y, w, h }, { stroke: this.theme.border });
      const color = variant === 'solid' ? this.brand.colors.onPrimary : this.theme.text;
      this.text(label, left + w / 2, y + h / 2 + size * 0.05, { role: 'body', size, weight, color, align: 'center', baseline: 'middle' });
      return { w, h };
    },

    button(text, x, y, o = {}) {
      const variant = o.variant ?? 'primary', size = o.size ?? this.rem;
      const h = size * 2.75, w = this.measure(text, { role: 'body', size, weight: 600 }) + size * 2.5;
      const left = alignLeft(this, x, w, o.align);
      const fill = { primary: this.brand.colors.primary, accent: this.brand.colors.accent, secondary: this.theme.surface }[variant];
      const ink = { primary: this.brand.colors.onPrimary, accent: this.brand.colors.onAccent, secondary: this.theme.text }[variant];
      this.pill({ x: left, y, w, h }, { fill, stroke: variant === 'secondary' ? this.theme.border : undefined, radius: this.rem * 0.75 });
      this.text(text, left + w / 2, y + h / 2 + size * 0.05, { role: 'body', size, weight: 600, color: ink, align: 'center', baseline: 'middle' });
      return { w, h };
    },

    // Whole pixels only, never blurred or rotated: the same in every style.
    nino(x, y, size, o = {}) {
      const c = this.ctx, t = o.t ?? this.t, expression = o.expression ?? 'idle';
      const face = NINO_FACES[expression] ?? NINO_FACES.idle;
      const u = Math.max(1, Math.round((size / 64) * 4)) / 4;
      let dx = 0, dy = 0;
      if (expression === 'thinking') dy = -2 * (0.5 - 0.5 * Math.cos((2 * Math.PI * (t % 2.4)) / 2.4));
      if (expression === 'worried') dx = [0, -1, 0, 1][Math.floor(((t % 0.6) / 0.6) * 4)];
      const blinkP = (t % 5.4) / 5.4, blink = expression !== 'eyes-closed' && blinkP >= 0.94 && blinkP < 0.97;
      const lk: Record<string, [number, number]> = { center: [0, 0], up: [0, -4], down: [0, 4], start: [this.dir === 'rtl' ? 4 : -4, 0], end: [this.dir === 'rtl' ? -4 : 4, 0] };
      const look = lk[o.look ?? 'center'] ?? [0, 0];
      const body = o.white ? '#FFFFFF' : '#2FB161';
      const col = { body, screen: this.brand.colors.ink, eye: this.brand.colors.accent, mouth: '#2FB161', cheek: 'rgba(232,90,2,0.45)', glint: 'rgba(255,255,255,0.22)' };
      c.save();
      c.imageSmoothingEnabled = false;
      c.translate(Math.round(x), Math.round(y)); c.scale(u, u); c.translate(dx, dy);
      const S = (sh: Shape, color: string) => { c.fillStyle = color; if (Array.isArray(sh)) c.fillRect(sh[0], sh[1], sh[2], sh[3]); else c.fill(new Path2D(sh.d)); };
      NINO_BODY.rects.forEach((r) => S(r, col.body));
      S(NINO_BODY.antenna, this.brand.colors.accent);
      S({ d: NINO_BODY.head }, col.body); S({ d: NINO_BODY.screen }, col.screen); S({ d: NINO_BODY.glint }, col.glint);
      if (face.cheeks) NINO_BODY.cheeks.forEach((r) => S(r, col.cheek));
      (face.brows ?? []).forEach((b) => S(b, col.eye));
      c.save(); c.translate(look[0], look[1]);
      if (blink) { c.translate(0, 22); c.scale(1, 0.15); c.translate(0, -22); }
      face.eyes.forEach((e) => S(e, col.eye));
      c.restore();
      S({ d: face.mouth }, col.mouth);
      c.restore();
    },

    enter(t, kind = 'default') { return motion.sp(t, kind); },
    post() {},
    ...mediaMethods({ media: env.media, clip: !!env.clip, W: env.W, H: env.H }),
  };
  return p;
}

/** Left edge of a box of width w anchored at x with the given (logical) alignment. */
function alignLeft(p: Painter, x: number, w: number, align: Align = 'start') {
  if (align === 'center') return x - w / 2;
  const rtl = p.dir === 'rtl';
  return (align === 'start') !== rtl ? x : x - w;
}

/** Apply a style module over the base painter. A style that throws falls back to the base. */
export function applyStyle(base: Painter, style?: StyleModule): { painter: Painter; error?: string; posts?: boolean } {
  if (!style) return { painter: base };
  try {
    const over = style(base) ?? {};
    return { painter: Object.assign(Object.create(null), base, over) as Painter, posts: typeof (over as Partial<Painter>).post === 'function' };
  } catch (e) {
    return { painter: base, error: `style failed: ${(e as Error).message}` };
  }
}
