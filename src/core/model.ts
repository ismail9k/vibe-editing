// The project file (vibe.json) and the timeline maths every part of the app shares.
// Times are seconds on the output timeline. Footage clips are magnetic: they play back to back in order.

export type Mode = 'dark' | 'light' | 'green';
export type Dir = 'ltr' | 'rtl';
export interface Format { w: number; h: number; fps: number }
export interface Clip { id: string; src: string; in: number; out: number }
export interface Graphic { id: string; type: string; at: number; dur: number; props: Record<string, unknown>; x?: number; y?: number; w?: number }
export interface Caption { id: string; text: string; at: number; dur: number; keyword?: string }
export interface AudioItem { id: string; src: string; at: number; gain: number }
export interface Tracks { footage: Clip[]; graphics: Graphic[]; captions: Caption[]; audio: AudioItem[] }
export interface Project { name: string; format: Format; style: string; mode: Mode; dir: Dir; tracks: Tracks }
export type TrackName = keyof Tracks;
export type TimedTrack = 'graphics' | 'captions' | 'audio';

const MODES: Mode[] = ['dark', 'light', 'green'];
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

/** Parse vibe.json text. Never throws: a half-written file returns `error` so the caller keeps its last good project. */
export function parseProject(text: string): { project?: Project; error?: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { error: `vibe.json is not valid JSON: ${(e as Error).message}` }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'vibe.json must be a JSON object' };
  const r = raw as Record<string, unknown>;
  const f = (r.format && typeof r.format === 'object' ? r.format : {}) as Record<string, unknown>;
  const t = (r.tracks && typeof r.tracks === 'object' ? r.tracks : {}) as Record<string, unknown>;
  const project: Project = {
    name: str(r.name, 'untitled'),
    format: { w: num(f.w, 1080), h: num(f.h, 1920), fps: num(f.fps, 30) },
    style: str(r.style, 'flat9k'),
    mode: MODES.includes(r.mode as Mode) ? (r.mode as Mode) : 'dark',
    dir: r.dir === 'rtl' ? 'rtl' : 'ltr',
    tracks: {
      footage: arr(t.footage).map((c, i) => ({ id: str(c.id, `f${i + 1}`), src: str(c.src, ''), in: num(c.in, 0), out: num(c.out, 0) })),
      graphics: arr(t.graphics).map((g, i) => {
        const out: Graphic = { id: str(g.id, `g${i + 1}`), type: str(g.type, ''), at: num(g.at, 0), dur: num(g.dur, 2), props: (g.props && typeof g.props === 'object' ? g.props : {}) as Record<string, unknown> };
        for (const k of ['x', 'y', 'w'] as const) if (typeof g[k] === 'number') out[k] = g[k] as number;
        return out;
      }),
      captions: arr(t.captions).map((c, i) => {
        const out: Caption = { id: str(c.id, `c${i + 1}`), text: str(c.text, ''), at: num(c.at, 0), dur: num(c.dur, 1) };
        if (typeof c.keyword === 'string') out.keyword = c.keyword;
        return out;
      }),
      audio: arr(t.audio).map((a, i) => ({ id: str(a.id, `a${i + 1}`), src: str(a.src, ''), at: num(a.at, 0), gain: num(a.gain, 1) })),
    },
  };
  return { project };
}

export function footageSpans(p: Project): { clip: Clip; start: number; end: number }[] {
  let t = 0;
  return p.tracks.footage.map((clip) => {
    const start = t;
    t += Math.max(0, clip.out - clip.in);
    return { clip, start, end: t };
  });
}

export function duration(p: Project): number {
  const spans = footageSpans(p);
  if (spans.length) return Math.max(1, spans[spans.length - 1].end);
  const ends = [...p.tracks.graphics, ...p.tracks.captions].map((x) => x.at + x.dur);
  return Math.max(1, ...ends);
}

export function footageAt(p: Project, t: number): { clip: Clip; srcTime: number; index: number } | null {
  const spans = footageSpans(p);
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (t >= s.start && t < s.end) return { clip: s.clip, srcTime: s.clip.in + (t - s.start), index: i };
  }
  return null;
}

export const serializeProject = (p: Project) => JSON.stringify(p, null, 2) + '\n';
