// Vibe Editing main process: the app window, the workspace, the watcher.
// `electron . --cli <command> …` runs the vibe CLI headless instead (see cli.ts).
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { registerScheme, handleProtocol } from './protocol';
import { registerIpc } from './ipc';
import { seedWorkspace, workspaceRoot } from './workspace';
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
const projectArg = (() => { const i = argv.indexOf('--project'); return i >= 0 ? argv[i + 1] : null; })();

registerScheme();
if (cliArgs) app.dock?.hide();

app.whenReady().then(async () => {
  const root = workspaceRoot();
  seedWorkspace(root, join(app.getAppPath(), 'presets'));
  handleProtocol(root);
  const guard = new SelfWriteGuard();
  registerIpc(root, guard, projectArg);
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
  const win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1100, minHeight: 680, icon,
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
