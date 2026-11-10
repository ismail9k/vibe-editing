// The parts of the vibe CLI that need no Electron: argument parsing and `vibe check`.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject, projectDir, projectName, type Dir, type Mode } from '../core/model';
import { coercedIssues, validateComponent, validateProject, type ComponentMeta, type Issue } from '../core/validate';
import { listLibrary, resolveInside } from './workspace';
import { matteReady, missingMattes } from './matte';

export interface CliArgs {
  command: string; project?: string; at?: number[]; out?: string; lang?: string; model?: string; force?: boolean; take?: string[];
  /** vibe component: what to do, to which component, and (snap) how to draw it, or (new) where it starts from. */
  sub?: 'new' | 'snap'; component?: string; from?: string; name?: string; style?: string; mode?: Mode; dir?: Dir; props?: Record<string, unknown>;
}

export const USAGE = `vibe — Vibe Editing from the terminal

  vibe open [project]                 open the app (on a project)
  vibe list                           list the projects
  vibe check <project>                check vibe.json against the library; exit 1 on errors
  vibe snapshot <project> --at 1,4,8  render PNGs at those seconds (projects/<p>.vibe/out/snap-*.png)
  vibe render <project> [-o out.mp4]  export the MP4 (projects/<p>.vibe/out/<p>.mp4)
  vibe matte <project>                cut the speaker out of every clip (macOS; media/.matte/)
  vibe transcribe <project>           word timings of the speech, on the timeline (projects/<p>.vibe/transcript.json)
      [--lang ar|en|auto] [--model <name|path.bin>] [--force]
  vibe presets                        list library files that differ from the app's version
  vibe presets --take <file>…         replace them with the app's version (old copies kept in .vibe/replaced/)
  vibe component new <id>             start library/components/<id>/ from a working template
      [--from <component>] [--name "Display name"]          …or as a copy of another component
  vibe component snap <id>            check a component and draw it alone, like a Studio tile: a contact sheet
      [--at 0.2,1] [--style <id>] [--mode dark|light|green]  through its duration (.vibe/out/<id>.png); one --at
      [--dir ltr|rtl] [--props '{"title":"…"}'] [-o x.png]   time draws one full frame. Exit 1 on errors

Workspace: $VIBE_HOME or ~/Vibe`;

export function parseCliArgs(argv: string[]): CliArgs {
  const [command = 'help', ...rest] = argv;
  const args: CliArgs = { command };
  if (command === 'component') return { command, ...parseComponentArgs(rest) };
  if (command === 'presets') {
    if (!rest.length) return args;
    if (rest[0] !== '--take' || rest.length < 2) throw new Error('vibe presets takes --take <file> [<file>…]');
    args.take = rest.slice(1);
    return args;
  }
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--at') {
      const at = (rest[++i] ?? '').split(',').map(Number);
      if (!at.length || at.some((t) => !Number.isFinite(t) || t < 0)) throw new Error(`--at wants seconds like 1,4.5,8 (got "${rest[i] ?? ''}")`);
      args.at = at;
    } else if (a === '-o' || a === '--out') args.out = rest[++i];
    else if (a === '--lang' || a === '--model') {
      const v = rest[++i];
      if (!v || v.startsWith('-')) throw new Error(`${a} wants a value`);
      args[a === '--lang' ? 'lang' : 'model'] = v;
    } else if (a === '--force') args.force = true;
    else if (!a.startsWith('-') && !args.project) args.project = projectName(a); // tab completion gives demo.vibe/
    else throw new Error(`unknown option "${a}"`);
  }
  if (['check', 'snapshot', 'render', 'matte', 'transcribe'].includes(command) && !args.project) throw new Error(`vibe ${command} needs a project name`);
  return args;
}

function parseComponentArgs(rest: string[]): Partial<CliArgs> {
  const [sub, ...more] = rest;
  if (sub !== 'new' && sub !== 'snap') throw new Error('vibe component takes new <id> or snap <id>');
  const args: Partial<CliArgs> = { sub };
  const value = (a: string, v: string | undefined) => { if (!v || v.startsWith('-')) throw new Error(`${a} wants a value`); return v; };
  const only = (a: string, on: 'new' | 'snap') => { if (sub !== on) throw new Error(`${a} is for vibe component ${on}`); };
  for (let i = 0; i < more.length; i++) {
    const a = more[i];
    if (a === '--from' || a === '--name') { only(a, 'new'); args[a === '--from' ? 'from' : 'name'] = value(a, more[++i]); }
    else if (a === '--style') { only(a, 'snap'); args.style = value(a, more[++i]); }
    else if (a === '--mode') {
      only(a, 'snap');
      const v = value(a, more[++i]);
      if (!['dark', 'light', 'green'].includes(v)) throw new Error(`--mode is dark, light or green (got "${v}")`);
      args.mode = v as Mode;
    } else if (a === '--dir') {
      only(a, 'snap');
      const v = value(a, more[++i]);
      if (v !== 'ltr' && v !== 'rtl') throw new Error(`--dir is ltr or rtl (got "${v}")`);
      args.dir = v;
    } else if (a === '--props') {
      only(a, 'snap');
      const v = more[++i] ?? '';
      let props: unknown;
      try { props = JSON.parse(v); } catch { throw new Error(`--props wants a JSON object like '{"title":"Hi"}' (got ${v})`); }
      if (!props || typeof props !== 'object' || Array.isArray(props)) throw new Error(`--props wants a JSON object like '{"title":"Hi"}' (got ${v})`);
      args.props = props as Record<string, unknown>;
    } else if (a === '--at') {
      only(a, 'snap');
      const at = (more[++i] ?? '').split(',').map(Number);
      if (at.some((t) => !Number.isFinite(t) || t < 0)) throw new Error(`--at wants seconds like 0.2,1 (got "${more[i] ?? ''}")`);
      args.at = at;
    } else if (a === '-o' || a === '--out') { only(a, 'snap'); args.out = value(a, more[++i]); }
    else if (!a.startsWith('-') && !args.component) args.component = a.replace(/\/+$/, '').split('/').pop(); // tab completion gives library/components/card/
    else throw new Error(`unknown option "${a}"`);
  }
  if (!args.component) throw new Error(`vibe component ${sub} needs a component id`);
  return args;
}

/** The times `vibe component snap` draws when none are given: the entrance closely (where most bugs are), then
 *  the hold, ending just before the exit fade. */
export function snapTimes(dur: number): number[] {
  const ts = [0.1, 0.3, 0.6, dur * 0.4, dur * 0.7, dur - 0.3].map((t) => Math.round(t * 100) / 100).filter((t) => t >= 0 && t < dur);
  return [...new Set(ts)].sort((a, b) => a - b);
}

/** The same checks the app's top bar shows, plus library files that don't parse. */
export function checkProject(root: string, name: string): Issue[] {
  const dir = resolveInside(root, projectDir(name)), rel = `${projectDir(name)}/vibe.json`;
  const file = join(dir, 'vibe.json');
  if (!existsSync(file)) return [{ level: 'error', path: rel, message: 'no such project' }];
  const { project, error, coerced } = parseProject(readFileSync(file, 'utf8'));
  if (!project) return [{ level: 'error', path: rel, message: error ?? 'not valid JSON' }];

  const issues: Issue[] = coercedIssues(coerced);
  const lib = listLibrary(root);
  const components: Record<string, ComponentMeta> = {};
  for (const id of lib.components) {
    const rel = `library/components/${id}/component.json`;
    try { components[id] = JSON.parse(readFileSync(join(root, rel), 'utf8')); }
    catch (e) { issues.push({ level: 'error', path: rel, message: (e as Error).message }); }
  }
  for (const id of lib.styles) {
    const rel = `library/styles/${id}/style.json`;
    if (!existsSync(join(root, rel))) continue;
    try { JSON.parse(readFileSync(join(root, rel), 'utf8')); }
    catch (e) { issues.push({ level: 'error', path: rel, message: (e as Error).message }); }
  }
  // The components this film uses, checked the way `vibe component snap` checks them. Unused drafts are left alone.
  for (const id of new Set(project.tracks.graphics.map((g) => g.type))) {
    if (!components[id]) continue;
    const js = join(root, `library/components/${id}/component.js`);
    issues.push(...validateComponent(id, components[id], existsSync(js) ? readFileSync(js, 'utf8') : null));
  }
  const mediaExists = (src: string) => { try { return existsSync(resolveInside(dir, src)); } catch { return false; } };
  const cutout = project.tracks.graphics.find((g) => components[g.type]?.matte)?.type;
  if (cutout) {
    for (const src of missingMattes(project, (src) => matteReady(dir, src)).filter(mediaExists))
      issues.push({ level: 'warn', path: src, message: `no cutout yet (${cutout} needs one): run \`vibe matte ${name}\`, or open the film in the app` });
  }
  return [...issues, ...validateProject(project, { components, styles: lib.styles, mediaExists })];
}
