// The vibe CLI, run inside Electron (`electron . --cli …`) so snapshots and renders use the app's renderer.
import { relative, resolve } from 'node:path';
import { checkProject, parseCliArgs, USAGE } from './check';
import { loadProject, runExport, runSnapshot } from './export';
import { ensureMattes } from './matte';
import { appDir } from './paths';
import { listProjects } from './workspace';

const out = (s: string) => process.stdout.write(s + '\n');
const err = (s: string) => process.stderr.write(s + '\n');

export async function runCli(root: string, argv: string[], cwd = process.cwd()): Promise<number> {
  let args;
  try { args = parseCliArgs(argv); } catch (e) { err((e as Error).message); err(USAGE); return 2; }
  const show = (p: string) => { const r = relative(cwd, p); return r && !r.startsWith('..') ? r : p; };
  try {
    switch (args.command) {
      case 'list':
        listProjects(root).forEach((p) => out(p));
        return 0;
      case 'check': {
        const issues = checkProject(root, args.project!);
        for (const i of issues) out(`${i.level === 'error' ? 'error' : 'warn '}  ${i.path}  ${i.message}`);
        const errors = issues.filter((i) => i.level === 'error').length;
        out(errors ? `${errors} error(s)` : `ok${issues.length ? ` (${issues.length} warning(s))` : ''}`);
        return errors ? 1 : 0;
      }
      case 'snapshot': {
        const { files, errors } = await runSnapshot(root, args.project!, args.at ?? [0], args.out && resolve(cwd, args.out));
        errors.forEach((e) => err(`render error: ${e}`));
        files.forEach((f) => out(show(f)));
        return errors.length ? 1 : 0;
      }
      case 'render': {
        let last = 0;
        const { out: file, errors } = await runExport(root, args.project!, (p) => {
          const pct = Math.floor((p.done / p.total) * 100);
          if (p.stage === 'frames' && pct >= last + 10) { last = pct - (pct % 10); err(`frames ${pct}%`); }
          if (p.stage === 'mattes' && p.done === 0) err(`cutting out ${p.message}…`);
          if (p.stage === 'encoding') err('encoding…');
        }, args.out && resolve(cwd, args.out));
        errors.forEach((e) => err(`render error: ${e}`));
        out(show(file));
        return errors.length ? 1 : 0;
      }
      case 'matte': {
        const { project, dir } = loadProject(root, args.project!);
        const last: Record<string, number> = {};
        await ensureMattes(root, appDir, project, dir, (p) => {
          const pct = Math.floor((p.done / p.total) * 100), was = last[p.src] ?? -10;
          if (pct >= was + 10) { last[p.src] = pct - (pct % 10); err(`${p.src} ${pct}%`); }
        });
        out('mattes ready');
        return 0;
      }
      case 'help': case '--help': case '-h':
        out(USAGE);
        return 0;
      default:
        err(`unknown command "${args.command}"`); err(USAGE);
        return 2;
    }
  } catch (e) {
    err((e as Error).message);
    return 1;
  }
}
