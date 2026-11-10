// The project file (vibe.json) and the timeline maths every part of the app shares.
// Times are seconds on the output timeline. Footage clips are magnetic: they play back to back in order.

export type Mode = 'dark' | 'light' | 'green';
export type Dir = 'ltr' | 'rtl';
export interface Format { w: number; h: number; fps: number }
/** in/out are source seconds; srcDur is the media's length (recorded at import) so trims can't run past it. */
export interface Clip { id: string; src: string; in: number; out: number; srcDur?: number }
export interface Graphic { id: string; type: string; at: number; dur: number; props: Record<string, unknown>; x?: number; y?: number; w?: number }
export interface Caption { id: string; text: string; at: number; dur: number; keyword?: string }
export interface AudioItem { id: string; src: string; at: number; gain: number }
export interface Tracks { footage: Clip[]; graphics: Graphic[]; captions: Caption[]; audio: AudioItem[] }
/** `brand` is the id of a brand in library/brands/; left out, the film uses the workspace's own (library/brand.json). */
export interface Project { name: string; format: Format; style: string; brand?: string; mode: Mode; dir: Dir; tracks: Tracks }
export type TrackName = keyof Tracks;
export type TimedTrack = 'graphics' | 'captions' | 'audio';

/** A project is a folder named <name>.vibe under projects/, which macOS shows as one document. */
export const PROJECT_EXT = '.vibe';
/** Workspace-relative folder of a project. */
export const projectDir = (name: string) => `projects/${name}${PROJECT_EXT}`;
/** A project name from what someone typed: "demo", "demo.vibe", "projects/demo.vibe/" or a full path all give "demo". */
export const projectName = (arg: string) => (arg.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '').replace(/\.vibe$/i, '');

const MODES: Mode[] = ['dark', 'light', 'green'];
const show = (v: unknown) => { const j = JSON.stringify(v); return j && j.length > 40 ? j.slice(0, 37) + '...' : String(j); };

/** Parse vibe.json text. Never throws: a half-written file returns `error` so the caller keeps its last good project.
 *  Wrong-typed fields fall back to defaults and are listed in `coerced`, so nothing is lost silently. */
export function parseProject(text: string): { project?: Project; error?: string; coerced?: string[] } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { error: `vibe.json is not valid JSON: ${(e as Error).message}` }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'vibe.json must be a JSON object' };
  const coerced: string[] = [];
  const num = (v: unknown, d: number, at: string) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (v !== undefined) coerced.push(`${at} should be a number (got ${show(v)})`);
    return d;
  };
  const str = (v: unknown, d: string, at: string) => {
    if (typeof v === 'string') return v;
    if (v !== undefined) coerced.push(`${at} should be text (got ${show(v)})`);
    return d;
  };
  const obj = (v: unknown, at: string): Record<string, unknown> => {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    if (v !== undefined) coerced.push(`${at} should be an object`);
    return {};
  };
  const arr = (v: unknown, at: string): Record<string, unknown>[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) { coerced.push(`${at} should be a list`); return []; }
    v.forEach((x, i) => { if (!x || typeof x !== 'object') coerced.push(`${at}[${i}] should be an object (dropped)`); });
    return v.filter((x) => x && typeof x === 'object');
  };
  const r = raw as Record<string, unknown>;
  const f = obj(r.format, 'format');
  const t = obj(r.tracks, 'tracks');
  if (r.mode !== undefined && !MODES.includes(r.mode as Mode)) coerced.push(`mode should be dark, light or green (got ${show(r.mode)})`);
  if (r.dir !== undefined && r.dir !== 'ltr' && r.dir !== 'rtl') coerced.push(`dir should be ltr or rtl (got ${show(r.dir)})`);
  const project: Project = {
    name: str(r.name, 'untitled', 'name'),
    format: { w: num(f.w, 1080, 'format.w'), h: num(f.h, 1920, 'format.h'), fps: num(f.fps, 30, 'format.fps') },
    style: str(r.style, 'flat9k', 'style'),
    ...(str(r.brand, '', 'brand') ? { brand: r.brand as string } : {}),
    mode: MODES.includes(r.mode as Mode) ? (r.mode as Mode) : 'dark',
    dir: r.dir === 'rtl' ? 'rtl' : 'ltr',
    tracks: {
      footage: arr(t.footage, 'tracks.footage').map((c, i) => {
        const at = `tracks.footage[${i}]`;
        const clip: Clip = { id: str(c.id, `f${i + 1}`, `${at}.id`), src: str(c.src, '', `${at}.src`), in: num(c.in, 0, `${at}.in`), out: num(c.out, 0, `${at}.out`) };
        if (c.srcDur !== undefined) { const d = num(c.srcDur, 0, `${at}.srcDur`); if (d > 0) clip.srcDur = d; }
        return clip;
      }),
      graphics: arr(t.graphics, 'tracks.graphics').map((g, i) => {
        const at = `tracks.graphics[${i}]`;
        const out: Graphic = { id: str(g.id, `g${i + 1}`, `${at}.id`), type: str(g.type, '', `${at}.type`), at: num(g.at, 0, `${at}.at`), dur: num(g.dur, 2, `${at}.dur`), props: obj(g.props, `${at}.props`) };
        for (const k of ['x', 'y', 'w'] as const) { if (typeof g[k] === 'number') out[k] = g[k] as number; else if (g[k] !== undefined) num(g[k], 0, `${at}.${k}`); }
        return out;
      }),
      captions: arr(t.captions, 'tracks.captions').map((c, i) => {
        const at = `tracks.captions[${i}]`;
        const out: Caption = { id: str(c.id, `c${i + 1}`, `${at}.id`), text: str(c.text, '', `${at}.text`), at: num(c.at, 0, `${at}.at`), dur: num(c.dur, 1, `${at}.dur`) };
        if (c.keyword !== undefined) out.keyword = str(c.keyword, '', `${at}.keyword`) || undefined;
        if (out.keyword === undefined) delete out.keyword;
        return out;
      }),
      audio: arr(t.audio, 'tracks.audio').map((a, i) => {
        const at = `tracks.audio[${i}]`;
        return { id: str(a.id, `a${i + 1}`, `${at}.id`), src: str(a.src, '', `${at}.src`), at: num(a.at, 0, `${at}.at`), gain: num(a.gain, 1, `${at}.gain`) };
      }),
    },
  };
  return { project, coerced };
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

/** Where a clip's cutout matte lives: media/a.mov → media/.matte/a.mov.matte.mp4 */
export function matteSrc(src: string): string {
  const i = src.lastIndexOf('/');
  return `${i >= 0 ? src.slice(0, i + 1) : ''}.matte/${src.slice(i + 1)}.matte.mp4`;
}
