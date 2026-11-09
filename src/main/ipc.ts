// IPC handlers for the app window.
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { duplicateDir, importMedia, MEDIA_EXTENSIONS, listLibrary, listProjects, readText, resolveInside, writeChecked, writeText } from './workspace';
import type { SelfWriteGuard } from './watch';
import { projectDir } from '../core/model';

export function registerIpc(root: string, guard: SelfWriteGuard, initialProject: () => string | null) {
  ipcMain.handle('ws:info', () => ({ root, projects: listProjects(root), ...listLibrary(root) }));
  ipcMain.handle('ws:read', (_e, rel: string) => readText(root, rel));
  ipcMain.handle('ws:write', (_e, rel: string, text: string, base?: string | null) =>
    writeChecked(root, rel, text, base, () => guard.mark(resolveInside(root, rel), text)));
  ipcMain.handle('ws:exists', (_e, rels: string[]) =>
    Object.fromEntries(rels.map((r) => { try { return [r, existsSync(resolveInside(root, r))]; } catch { return [r, false]; } })));
  ipcMain.handle('ws:duplicate', (_e, a: string, b: string) => duplicateDir(root, a, b));
  ipcMain.handle('ws:createProject', (_e, name: string) => {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
    const rel = `${projectDir(slug)}/vibe.json`;
    if (existsSync(join(root, rel))) throw new Error(`a project called ${slug} already exists`);
    writeText(root, rel, JSON.stringify({ name: slug, format: { w: 1080, h: 1920, fps: 30 }, style: 'flat9k', mode: 'dark', dir: 'ltr', tracks: { footage: [], graphics: [], captions: [], audio: [] } }, null, 2) + '\n');
    return slug;
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
  ipcMain.handle('session:write', (_e, project: string, session: unknown) => {
    writeText(root, `${projectDir(project)}/.vibe/session.json`, JSON.stringify(session, null, 2) + '\n');
  });
  ipcMain.handle('app:initialProject', () => initialProject());
}
