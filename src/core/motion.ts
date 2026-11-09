// Motion primitives, ported from motion/skills/9k-motion/templates/lib/motion.js.
// Every function is a pure function of time, so a frame at t is always the same frame.

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Closed-form damped spring, 0 → 1. k = stiffness, d = damping. */
export function spring(t: number, k = 170, d = 26): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k), z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

export type SpringKind = 'snappy' | 'default' | 'heavy' | 'playful';
export const SPRINGS: Record<SpringKind, [number, number]> = {
  snappy: [320, 34], // buttons, toggles, leading edges
  default: [170, 26], // cards, containers, camera
  heavy: [120, 24], // big type, logo lockups: no overshoot
  playful: [220, 14], // Nino only
};
export const sp = (t: number, kind: SpringKind = 'default') => spring(t, ...SPRINGS[kind]);

/** A value with many targets: one spring per change. keys: [[time, value], …] */
export function track(t: number, keys: [number, number][], kind: SpringKind = 'default'): number {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * sp(t - keys[i][0], kind);
  return v;
}

/** CSS cubic-bezier solved by Newton iteration. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (s: number) => ((ax * s + bx) * s + cx) * s, sy = (s: number) => ((ay * s + by) * s + cy) * s;
  return (x: number) => {
    x = clamp(x);
    let s = x;
    for (let i = 0; i < 8; i++) {
      const dx = (3 * ax * s + 2 * bx) * s + cx;
      if (Math.abs(dx) < 1e-6) break;
      s -= (sx(s) - x) / dx;
    }
    return sy(clamp(s));
  };
}
export const ease9k = bezier(0.4, 0, 0.2, 1);
export const tween = (t: number, start: number, dur: number, fn = ease9k) => fn(clamp((t - start) / dur));

/** Seeded PRNG (mulberry32). Drawing code never uses Math.random. */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable numeric seed from any string (graphic ids, text). */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Typewriter: the characters of `text` visible t seconds after typing starts. */
export const typed = (text: string, t: number, cps = 16) => {
  const chars = [...text];
  return chars.slice(0, clamp(Math.floor(t * cps), 0, chars.length)).join('');
};

/** Backspace `from` to the common prefix, then type `to`. */
export function retype(from: string, to: string, t: number, cps = 16, delCps = 24): { text: string; typing: boolean } {
  const a = [...from], b = [...to];
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  const delDur = (a.length - p) / delCps;
  if (t < delDur) return { text: a.slice(0, a.length - Math.floor(t * delCps)).join(''), typing: true };
  const n = Math.min(b.length - p, Math.floor((t - delDur) * cps));
  return { text: b.slice(0, p + n).join(''), typing: p + n < b.length };
}

/** Caret blink: solid while typing, then on/off on a 1.06 s period. */
export const caretOn = (t: number, typing: boolean) => typing || t % 1.06 < 0.53;

export const motion = { clamp, lerp, spring, sp, track, bezier, ease9k, tween, rng, hash, typed, retype, caretOn };
export type Motion = typeof motion;
