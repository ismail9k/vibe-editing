// Puts the menu bar up (see menu-template.ts) and redraws it when the window says what it has open.
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import { join } from 'node:path';
import { projectDir } from '../core/model';
import type { MenuState } from '../shared/api';
import { EMPTY_MENU, menuTemplate } from './menu-template';
import { resolveInside } from './workspace';

export function registerMenu(root: string, window: () => BrowserWindow | null) {
  let drawn = '';
  const draw = (state: MenuState) => {
    const key = JSON.stringify(state);
    if (key === drawn) return;
    drawn = key;
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(state, {
      send: (command) => { const w = window(); if (w) { w.show(); w.webContents.send('menu:command', command); } },
      reveal: (project) => {
        try { if (project) shell.showItemInFolder(resolveInside(root, projectDir(project))); else void shell.openPath(root); }
        catch { /* a name that isn't a path inside the workspace: nothing to show */ }
      },
      guide: () => { void shell.openPath(join(root, 'CLAUDE.md')); },
      dev: !app.isPackaged,
    })));
  };
  draw(EMPTY_MENU);
  ipcMain.handle('menu:state', (_e, state: MenuState) => {
    // Only the shape the menu draws: strings for names, nothing else from the window.
    const projects = Array.isArray(state?.projects) ? state.projects.filter((p): p is string => typeof p === 'string') : [];
    draw({
      projects, project: typeof state?.project === 'string' ? state.project : null,
      room: state?.room === 'studio' ? 'studio' : 'edit', chatOpen: state?.chatOpen === true, selected: state?.selected === true,
    });
  });
}
