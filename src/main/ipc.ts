// IPC handlers for the app window.
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createComponent, duplicateDir, importMedia, MEDIA_EXTENSIONS, listLibrary, listMedia, listProjects, readText, resolveInside, writeChecked, writeText } from './workspace';
import type { SelfWriteGuard } from './watch';
import { projectDir } from '../core/model';
import { Chats, vibeShim } from './chat';
import { startProject } from './start';
import { userDataDir } from './paths';
import type { ChatContext } from '../shared/api';

export function registerIpc(root: string, guard: SelfWriteGuard, initialProject: () => string | null) {
  ipcMain.handle('ws:info', () => ({ root, projects: listProjects(root), ...listLibrary(root) }));
  ipcMain.handle('ws:read', (_e, rel: string) => readText(root, rel));
  ipcMain.handle('ws:write', (_e, rel: string, text: string, base?: string | null) =>
    writeChecked(root, rel, text, base, () => guard.mark(resolveInside(root, rel), text)));
  ipcMain.handle('ws:exists', (_e, rels: string[]) =>
    Object.fromEntries(rels.map((r) => { try { return [r, existsSync(resolveInside(root, r))]; } catch { return [r, false]; } })));
  ipcMain.handle('ws:duplicate', (_e, a: string, b: string) => duplicateDir(root, a, b));
  ipcMain.handle('ws:createComponent', (_e, id: string, opts?: { from?: string; name?: string }) => { createComponent(root, id, opts); });
  ipcMain.handle('ws:startProject', (_e, name: string, paths?: string[]) => startProject(root, name, paths ?? []));
  ipcMain.handle('media:pick', async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Video and audio', extensions: MEDIA_EXTENSIONS }],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('media:import', async (e, project: string, paths?: string[]) => {
    let files = paths;
    if (!files) {
      const win = BrowserWindow.fromWebContents(e.sender)!;
      const r = await dialog.showOpenDialog(win, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Video and audio', extensions: MEDIA_EXTENSIONS }],
      });
      if (r.canceled) return [];
      files = r.filePaths;
    }
    return importMedia(root, project, files);
  });
  ipcMain.handle('media:list', (_e, project: string) => listMedia(root, project));
  ipcMain.handle('session:write', (_e, project: string, session: unknown) => {
    writeText(root, `${projectDir(project)}/.vibe/session.json`, JSON.stringify(session, null, 2) + '\n');
  });
  ipcMain.handle('app:initialProject', () => initialProject());
}

/** The Claude panel. Turns run in the background and stream to every window through chat:update. */
export function registerChat(root: string): Chats {
  // The panel's Claude runs `vibe` (check, snapshot, render): give it this app's own, whatever PATH the app got.
  const binDir = join(userDataDir(), 'bin');
  try {
    mkdirSync(binDir, { recursive: true });
    const shim = join(binDir, 'vibe');
    writeFileSync(shim, vibeShim(process.execPath, app.isPackaged ? null : app.getAppPath()));
    chmodSync(shim, 0o755);
  } catch (e) { console.error('Claude panel: could not write the vibe command:', e); }
  const chats = new Chats({
    root, throttleMs: 50, binDir,
    onUpdate: (u) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('chat:update', u); },
  });
  ipcMain.handle('chat:state', (_e, project: string) => chats.state(project));
  ipcMain.handle('chat:send', (_e, project: string, text: string, ctx: ChatContext) => { void chats.send(project, text, ctx); });
  ipcMain.handle('chat:stop', (_e, project: string) => chats.stop(project));
  ipcMain.handle('chat:reset', (_e, project: string) => chats.reset(project));
  // Whether the panel is open survives a restart. Kept here, not in localStorage: Chromium writes that to disk late
  // and can't open it at all while another copy of the app holds the profile.
  const ui = join(userDataDir(), 'ui.json');
  ipcMain.handle('ui:chatOpen', () => { try { return JSON.parse(readFileSync(ui, 'utf8')).chatOpen === true; } catch { return false; } });
  ipcMain.handle('ui:setChatOpen', (_e, open: boolean) => { writeFileSync(ui, JSON.stringify({ chatOpen: !!open }) + '\n'); });
  return chats;
}
