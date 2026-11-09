// Vibe Editing main process: the app window, the workspace, the watcher.
// `electron . --cli <command> …` runs the vibe CLI headless instead (see cli.ts).
import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'node:path';
import { registerScheme, handleProtocol } from './protocol';
import { registerIpc } from './ipc';
import { migrateProjects, projectAtPath, seedWorkspace, workspaceRoot } from './workspace';
import { projectName } from '../core/model';
import { SelfWriteGuard, watchWorkspace } from './watch';
import { registerExport } from './export';
import { runCli } from './cli';
import { registerHeadless } from './headless';
import { preloadPath, rendererUrl } from './paths';
import { withToolDirs } from './tool-path';

// Before anything spawns ffmpeg: an app opened from Finder doesn't get the shell's PATH.
process.env.PATH = withToolDirs(process.env.PATH);
const argv = process.argv.slice(app.isPackaged ? 1 : 2);
const cliAt = argv.indexOf('--cli');
const cliArgs = cliAt >= 0 ? argv.slice(cliAt + 1) : null;
const projectArg = (() => { const i = argv.indexOf('--project'); return i >= 0 && argv[i + 1] ? projectName(argv[i + 1]) : null; })();

// Double-clicking a project's .vibe in Finder. macOS sends it before the app is ready when that click launched the
// app (it becomes the first project shown), and to the running app otherwise (the window switches to it).
let win: BrowserWindow | null = null;
const opened: string[] = [];
const notices: Electron.MessageBoxOptions[] = [];
function openFromFinder(path: string) {
  const name = projectAtPath(workspaceRoot(), path);
  if (!name) {
    const notice = {
      type: 'info' as const, message: 'Vibe Editing only opens projects in its workspace',
      detail: `${path}\n\nMove it into ${workspaceRoot()}/projects to open it.`,
    };
    // On the window as a sheet, with the app in front (a sheet on a background app may never show). At launch
    // there's no window yet, so it waits for one.
    if (win) { app.focus({ steal: true }); win.show(); dialog.showMessageBox(win, notice); } else notices.push(notice);
    return;
  }
  opened.push(name); // read by the window's first initialProject(), in case it hasn't subscribed yet
  if (win) { win.webContents.send('app:openProject', name); app.focus({ steal: true }); win.show(); }
}
app.on('open-file', (e, path) => { e.preventDefault(); if (!cliArgs) openFromFinder(path); });

registerScheme();
if (cliArgs) app.dock?.hide();

app.whenReady().then(async () => {
  const root = workspaceRoot();
  migrateProjects(root); // before seeding, so the demos land in the renamed folders
  seedWorkspace(root, join(app.getAppPath(), 'presets'));
  handleProtocol(root);
  const guard = new SelfWriteGuard();
  registerIpc(root, guard, () => opened.at(-1) ?? projectArg);
  registerHeadless();
  registerExport(root);

  if (cliArgs) {
    const code = await runCli(root, cliArgs);
    app.exit(code);
    return;
  }

  // Unpackaged, macOS shows Electron's own icon in the dock, so set ours by hand.
  const icon = join(app.getAppPath(), 'build', 'icon.png');
  if (!app.isPackaged) app.dock?.setIcon(icon);
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1100, minHeight: 680, icon,
    backgroundColor: '#0F0F0F', titleBarStyle: 'hiddenInset', title: 'Vibe Editing',
    webPreferences: { preload: preloadPath, sandbox: false, contextIsolation: true },
  });
  win.on('closed', () => { win = null; });
  win.webContents.once('did-finish-load', () => { for (const n of notices.splice(0)) if (win) dialog.showMessageBox(win, n); });
  win.loadURL(rendererUrl());
  const watcher = watchWorkspace(root, guard, (change) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('ws:change', change);
  });
  app.on('will-quit', () => watcher.close());
});

app.on('window-all-closed', () => { if (!cliArgs) app.quit(); });
