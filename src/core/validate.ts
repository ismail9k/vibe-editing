// Checks a project against the library. Shared by the app (top bar) and `vibe check`.
import type { Project } from './model';
import { MAIN_BRAND } from './brand';

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
export interface ValidateContext { components: Record<string, ComponentMeta>; styles: string[]; /** Ids of the extra brands in library/brands/. */ brands?: string[]; mediaExists(src: string): boolean }

/** Whether a value is right for a prop of this spec. */
export function propFits(spec: PropSpec, v: unknown): boolean {
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
  if (p.brand && p.brand !== MAIN_BRAND && !(ctx.brands ?? []).includes(p.brand))
    err('brand', `unknown brand "${p.brand}" (have: ${[MAIN_BRAND, ...(ctx.brands ?? [])].join(', ')}); the film draws in the workspace's own brand`);

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
      else if (!propFits(spec, v)) err(`${at}.props.${k}`, `${k} should be ${spec.type}${spec.options ? ` (${spec.options.join(' | ')})` : ''}`);
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

const PROP_TYPES: PropType[] = ['text', 'number', 'bool', 'list', 'select'];
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Checks a component's two files (`code` is null when component.js is missing): what would break it in the app,
 *  the Studio form or the export. Run by `vibe component snap` and by `vibe check` for the components a film uses. */
export function validateComponent(id: string, meta: unknown, code: string | null): Issue[] {
  const issues: Issue[] = [];
  const json = `library/components/${id}/component.json`, js = `library/components/${id}/component.js`;
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });

  if (!isObject(meta)) err(json, 'component.json should be an object: { name, description, duration, defaults, schema }');
  else {
    if (typeof meta.name !== 'string' || !meta.name) issues.push({ level: 'warn', path: json, message: 'no name: the Studio lists it by its folder name' });
    if (!(typeof meta.duration === 'number' && meta.duration > 0)) err(json, 'duration should be a number of seconds above 0');
    const schema = isObject(meta.schema) ? meta.schema : {}, defaults = isObject(meta.defaults) ? meta.defaults : {};
    if (meta.schema !== undefined && !isObject(meta.schema)) err(json, 'schema should be an object of props: { "<prop>": { type, label } }');
    if (meta.defaults !== undefined && !isObject(meta.defaults)) err(json, 'defaults should be an object of prop values');
    for (const [k, spec] of Object.entries(schema)) {
      if (!isObject(spec) || !PROP_TYPES.includes(spec.type as PropType)) { err(json, `schema.${k}: type should be one of ${PROP_TYPES.join(', ')}`); continue; }
      if (spec.type === 'select' && !(Array.isArray(spec.options) && spec.options.length)) err(json, `schema.${k}: a select needs options`);
      if (!(k in defaults)) issues.push({ level: 'warn', path: json, message: `schema.${k} has no default: a graphic that leaves it out gets undefined` });
    }
    for (const [k, v] of Object.entries(defaults)) {
      const spec = schema[k];
      if (!isObject(spec)) err(json, `defaults.${k} has no schema entry, so it can't be edited`);
      else if (PROP_TYPES.includes(spec.type as PropType) && !propFits(spec as unknown as PropSpec, v))
        err(json, `defaults.${k} should be ${spec.type}${Array.isArray(spec.options) ? ` (${spec.options.join(' | ')})` : ''}`);
    }
  }

  if (code === null) { err(js, 'component.js is missing'); return issues; }
  if (!/\bexport\s+default\b/.test(code)) err(js, 'needs `export default { draw(p, { t, dur, props, graphic, place }) { … } }`');
  const flags = isObject(meta) ? meta : {};
  if (/\bp\.footage\(/.test(code) && !flags.scene) err(js, 'draws the footage (p.footage), so component.json needs "scene": true');
  if (/\bp\.subject\(/.test(code) && !flags.matte) err(js, 'draws the cutout (p.subject), so component.json needs "matte": true');
  if (/\bsubjectBox\(/.test(code) && !flags.matte && !flags.aims) err(js, 'aims at the speaker (subjectBox), so component.json needs "aims": true');
  if (/\bMath\.random\b/.test(code)) err(js, 'Math.random makes the preview and the export differ: use p.rng(seed)');
  if (/\b(Date\.now|performance\.now|new Date)\b/.test(code)) err(js, 'reads the wall clock, so the preview and the export differ: animate from t');
  return issues;
}

/** parseProject's list of replaced fields, as errors: "<path> should be ..." */
export const coercedIssues = (coerced: string[] = []): Issue[] =>
  coerced.map((message) => ({ level: 'error', path: message.split(' ')[0], message }));
