// The vibe CLI, run inside Electron (`electron . --cli …`) so snapshots and renders use the app's renderer.
import { join, relative, resolve } from 'node:path';
import { checkProject, parseCliArgs, USAGE } from './check';
import { loadProject, runExport, runSnapshot } from './export';
import { ensureMattes } from './matte';
import { appDir, matteTools, userDataDir } from './paths';
import { transcribeProject } from './transcribe';
import { transcriptLines } from '../core/transcript';
import { listProjects, presetStatus, takePresets } from './workspace';

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
      case 'presets': {
        const presets = join(appDir, 'presets');
        if (args.take) {
          const { backupDir } = takePresets(root, presets, args.take);
          args.take.forEach((f) => out(`took the app's ${f}`));
          if (backupDir) err(`your copies: ${show(backupDir)}`);
          return 0;
        }
        const diff = presetStatus(root, presets);
        for (const d of diff) out(`${d.state === 'changed' ? 'changed' : 'differs'}  ${d.rel}`);
        err(diff.length
          ? '"changed": you edited it since the app put it there. "differs": an older copy or an edit (this workspace predates tracking).\nvibe presets --take <file> replaces one with the app\'s version.'
          : 'every library file matches the app\'s version');
        return 0;
      }
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
        await ensureMattes(matteTools(), project, dir, (p) => {
          const pct = Math.floor((p.done / p.total) * 100), was = last[p.src] ?? -10;
          if (pct >= was + 10) { last[p.src] = pct - (pct % 10); err(`${p.src} ${pct}%`); }
        });
        out('mattes ready');
        return 0;
      }
      case 'transcribe': {
        const { project, dir } = loadProject(root, args.project!);
        let last = -10, lastMb = -100;
        const { words, file } = await transcribeProject(dir, project, { model: args.model, lang: args.lang, force: args.force, userData: userDataDir() }, (p) => {
          if (p.stage === 'download') {
            const mb = Math.floor(p.done / 1e6);
            if (mb >= lastMb + 100) { lastMb = mb; err(`downloading the ${p.model} model: ${mb}${p.total ? ` / ${Math.round(p.total / 1e6)}` : ''} MB`); }
          } else if (p.pct >= last + 10 || p.pct === 100) { last = p.pct - (p.pct % 10); err(`${p.src} ${p.pct}%`); }
        });
        transcriptLines(words).forEach((l) => out(l));
        err(`${words.length} words -> ${show(file)}`);
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
