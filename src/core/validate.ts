// Checks a project against the library. Shared by the app (top bar) and `vibe check`.
import type { Project } from './model';

export type PropType = 'text' | 'number' | 'bool' | 'list' | 'select';
export interface PropSpec { type: PropType; label: string; options?: string[] }
export interface ComponentMeta {
  name: string; description: string; duration: number; defaults: Record<string, unknown>; schema: Record<string, PropSpec>;
  /** Draws the footage itself while on screen (the plain footage layer is skipped). */
  scene?: boolean;
  /** Needs the speaker cut out (the clip's matte). */
  matte?: boolean;
  /** Aims at the speaker (subjectBox): uses the matte when there is one, guesses without. */
  aims?: boolean;
}
export interface Issue { level: 'error' | 'warn'; path: string; message: string }
export interface ValidateContext { components: Record<string, ComponentMeta>; styles: string[]; mediaExists(src: string): boolean }

function typeOk(spec: PropSpec, v: unknown): boolean {
  switch (spec.type) {
    case 'text': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'bool': return typeof v === 'boolean';
    case 'list': return Array.isArray(v);
    case 'select': return typeof v === 'string' && (!spec.options || spec.options.includes(v));
  }
}

/** Letters a viewer reads in a second. The speaker usually says what a graphic shows, so this is the reading time
 *  alone, with no grace added for text nobody says. */
export const READ_RATE = 15;

/** The letters a graphic puts on screen to read: its text props (given or default), without spaces. A value that
 *  appears inside another one (an underlined word, a button repeating the call to action) counts once. */
export function lettersToRead(meta: ComponentMeta, props: Record<string, unknown>): number {
  const texts = Object.entries(meta.schema)
    .filter(([, spec]) => spec.type === 'text')
    .map(([k]) => (props[k] ?? meta.defaults[k]))
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.replace(/\s+/g, ''))
    .filter(Boolean);
  return texts.filter((v, i) => !texts.some((w, j) => j !== i && w.includes(v) && (w !== v || j < i)))
    .reduce((n, v) => n + [...v].length, 0);
}

export function validateProject(p: Project, ctx: ValidateContext): Issue[] {
  const issues: Issue[] = [];
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  if (!ctx.styles.includes(p.style)) err('style', `unknown style "${p.style}" (have: ${ctx.styles.join(', ')})`);

  p.tracks.footage.forEach((c, i) => {
    const at = `tracks.footage[${i}]`;
    if (!c.src || !ctx.mediaExists(c.src)) err(`${at}.src`, `missing media "${c.src}"`);
    if (!(c.out > c.in)) err(`${at}.out`, `out (${c.out}) must be after in (${c.in})`);
    else if (c.srcDur !== undefined && c.out > c.srcDur + 0.05) err(`${at}.out`, `out (${c.out}) is past the end of ${c.src} (${c.srcDur} s)`);
  });

  p.tracks.graphics.forEach((g, i) => {
    const at = `tracks.graphics[${i}]`;
    const meta = ctx.components[g.type];
    if (!meta) { err(`${at}.type`, `unknown component "${g.type}"`); return; }
    if (!(g.dur > 0)) err(`${at}.dur`, 'dur must be positive');
    for (const [k, v] of Object.entries(g.props)) {
      const spec = meta.schema[k];
      if (!spec) issues.push({ level: 'warn', path: `${at}.props.${k}`, message: `${g.type} has no prop "${k}"` });
      else if (!typeOk(spec, v)) err(`${at}.props.${k}`, `${k} should be ${spec.type}${spec.options ? ` (${spec.options.join(' | ')})` : ''}`);
    }
    const letters = lettersToRead(meta, g.props), need = Math.ceil((letters / READ_RATE) * 10) / 10;
    if (g.dur > 0 && g.dur < need) issues.push({ level: 'warn', path: `${at}.dur`,
      message: `${g.type} has ${letters} letters to read in ${g.dur} s: hold it at least ${need} s, or cut words` });
  });

  p.tracks.audio.forEach((a, i) => {
    if (!a.src || !ctx.mediaExists(a.src)) err(`tracks.audio[${i}].src`, `missing media "${a.src}"`);
  });
  return issues;
}

/** parseProject's list of replaced fields, as errors: "<path> should be ..." */
export const coercedIssues = (coerced: string[] = []): Issue[] =>
  coerced.map((message) => ({ level: 'error', path: message.split(' ')[0], message }));
