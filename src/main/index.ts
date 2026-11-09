// Vibe Editing main process: the app window, the workspace, the watcher.
// `electron . --cli <command> …` runs the vibe CLI headless instead (see cli.ts).
import { app, BrowserWindow } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerScheme, handleProtocol } from './protocol';
import { registerIpc } from './ipc';
import { seedWorkspace, workspaceRoot } from './workspace';
import { SelfWriteGuard, watchWorkspace } from './watch';
import { registerExport } from './export';
import { runCli } from './cli';

const here = dirname(fileURLToPath(import.meta.url));
export const preloadPath = join(here, '../preload/index.mjs');
export const rendererUrl = (hash = '') =>
  process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}${hash}` : `file://${join(here, '../renderer/index.html')}${hash}`;

const argv = process.argv.slice(app.isPackaged ? 1 : 2);
const cliAt = argv.indexOf('--cli');
const cliArgs = cliAt >= 0 ? argv.slice(cliAt + 1) : null;
const projectArg = (() => { const i = argv.indexOf('--project'); return i >= 0 ? argv[i + 1] : null; })();

registerScheme();
if (cliArgs) app.dock?.hide();

app.whenReady().then(async () => {
  const root = workspaceRoot();
  seedWorkspace(root, join(app.getAppPath(), 'presets'));
  handleProtocol(root);
  const guard = new SelfWriteGuard();
  registerExport(root);

  if (cliArgs) {
    const code = await runCli(root, cliArgs);
    app.exit(code);
    return;
  }

  registerIpc(root, guard, projectArg);
  const win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1100, minHeight: 680,
    backgroundColor: '#0F0F0F', titleBarStyle: 'hiddenInset', title: 'Vibe Editing',
    webPreferences: { preload: preloadPath, sandbox: false, contextIsolation: true },
  });
  win.loadURL(rendererUrl());
  const watcher = watchWorkspace(root, guard, (change) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('ws:change', change);
  });
  app.on('will-quit', () => watcher.close());
});

app.on('window-all-closed', () => { if (!cliArgs) app.quit(); });
