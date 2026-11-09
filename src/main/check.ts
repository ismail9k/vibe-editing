// The parts of the vibe CLI that need no Electron: argument parsing and `vibe check`.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject } from '../core/model';
import { coercedIssues, validateProject, type ComponentMeta, type Issue } from '../core/validate';
import { listLibrary, resolveInside } from './workspace';
import { matteReady, missingMattes } from './matte';

export interface CliArgs { command: string; project?: string; at?: number[]; out?: string }

export const USAGE = `vibe — Vibe Editing from the terminal

  vibe open [project]                 open the app (on a project)
  vibe list                           list the projects
  vibe check <project>                check vibe.json against the library; exit 1 on errors
  vibe snapshot <project> --at 1,4,8  render PNGs at those seconds (projects/<p>/out/snap-*.png)
  vibe render <project> [-o out.mp4]  export the MP4 (projects/<p>/out/<p>.mp4)
  vibe matte <project>                cut the speaker out of every clip (macOS; media/.matte/)

Workspace: $VIBE_HOME or ~/Vibe`;

export function parseCliArgs(argv: string[]): CliArgs {
  const [command = 'help', ...rest] = argv;
  const args: CliArgs = { command };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--at') {
      const at = (rest[++i] ?? '').split(',').map(Number);
      if (!at.length || at.some((t) => !Number.isFinite(t) || t < 0)) throw new Error(`--at wants seconds like 1,4.5,8 (got "${rest[i] ?? ''}")`);
      args.at = at;
    } else if (a === '-o' || a === '--out') args.out = rest[++i];
    else if (!a.startsWith('-') && !args.project) args.project = a;
    else throw new Error(`unknown option "${a}"`);
  }
  if (['check', 'snapshot', 'render', 'matte'].includes(command) && !args.project) throw new Error(`vibe ${command} needs a project name`);
  return args;
}

/** The same checks the app's top bar shows, plus library files that don't parse. */
export function checkProject(root: string, name: string): Issue[] {
  const dir = resolveInside(root, `projects/${name}`);
  const file = join(dir, 'vibe.json');
  if (!existsSync(file)) return [{ level: 'error', path: `projects/${name}/vibe.json`, message: 'no such project' }];
  const { project, error, coerced } = parseProject(readFileSync(file, 'utf8'));
  if (!project) return [{ level: 'error', path: `projects/${name}/vibe.json`, message: error ?? 'not valid JSON' }];

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
  const mediaExists = (src: string) => { try { return existsSync(resolveInside(dir, src)); } catch { return false; } };
  const cutout = project.tracks.graphics.find((g) => components[g.type]?.matte)?.type;
  if (cutout) {
    for (const src of missingMattes(project, (src) => matteReady(dir, src)).filter(mediaExists))
      issues.push({ level: 'warn', path: src, message: `no cutout yet (${cutout} needs one): run \`vibe matte ${name}\`, or open the film in the app` });
  }
  return [...issues, ...validateProject(project, { components, styles: lib.styles, mediaExists })];
}
