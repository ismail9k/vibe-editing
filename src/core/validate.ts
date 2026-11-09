// Checks a project against the library. Shared by the app (top bar) and `vibe check`.
import type { Project } from './model';

export type PropType = 'text' | 'number' | 'bool' | 'list' | 'select';
export interface PropSpec { type: PropType; label: string; options?: string[] }
export interface ComponentMeta { name: string; description: string; duration: number; defaults: Record<string, unknown>; schema: Record<string, PropSpec> }
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

export function validateProject(p: Project, ctx: ValidateContext): Issue[] {
  const issues: Issue[] = [];
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  if (!ctx.styles.includes(p.style)) err('style', `unknown style "${p.style}" (have: ${ctx.styles.join(', ')})`);

  p.tracks.footage.forEach((c, i) => {
    const at = `tracks.footage[${i}]`;
    if (!c.src || !ctx.mediaExists(c.src)) err(`${at}.src`, `missing media "${c.src}"`);
    if (!(c.out > c.in)) err(`${at}.out`, `out (${c.out}) must be after in (${c.in})`);
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
  });

  p.tracks.audio.forEach((a, i) => {
    if (!a.src || !ctx.mediaExists(a.src)) err(`tracks.audio[${i}].src`, `missing media "${a.src}"`);
  });
  return issues;
}
