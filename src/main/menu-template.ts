// The Mac menu bar, as data: what's in each menu, given what the window has open. Kept apart from Electron (see
// menu.ts) so it can be tested. Most items send a command to the window, which does it the same way its own
// buttons and keys do.
import type { MenuItemConstructorOptions } from 'electron';
import type { MenuCommand, MenuState } from '../shared/api';

export interface MenuActions {
  /** Do this in the app window. */
  send(command: MenuCommand): void;
  /** Show the open project (or, with null, the workspace) in Finder. */
  reveal(project: string | null): void;
  /** Open the workspace's guide for Claude (CLAUDE.md). */
  guide(): void;
  /** Add Reload and the developer tools (not in the packaged app). */
  dev: boolean;
}

export const EMPTY_MENU: MenuState = { projects: [], project: null, room: 'edit', chatOpen: false, selected: false };

export function menuTemplate(s: MenuState, a: MenuActions): MenuItemConstructorOptions[] {
  const has = !!s.project, editing = has && s.room === 'edit';
  const sep: MenuItemConstructorOptions = { type: 'separator' };
  const cmd = (label: string, command: MenuCommand, more: MenuItemConstructorOptions = {}): MenuItemConstructorOptions =>
    ({ label, click: () => a.send(command), ...more });
  // A plain key like S or Space is shown beside its item but left to the window: taken by the menu, it could no
  // longer be typed into a caption or a message to Claude.
  const shown = (accelerator: string): MenuItemConstructorOptions => ({ accelerator, registerAccelerator: false });

  return [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        cmd('New Project…', 'new-project', { accelerator: 'CmdOrCtrl+N' }),
        {
          label: 'Open Project', enabled: s.projects.length > 0,
          submenu: s.projects.map((p) => cmd(p, `open:${p}`, { type: 'checkbox', checked: p === s.project })),
        },
        sep,
        cmd('Import Video or Sound…', 'import-media', { accelerator: 'CmdOrCtrl+I', enabled: has }),
        cmd('Export', 'export', { accelerator: 'CmdOrCtrl+E', enabled: has }),
        sep,
        { label: 'Show Project in Finder', accelerator: 'Shift+CmdOrCtrl+R', enabled: has, click: () => a.reveal(s.project) },
        { label: 'Show Workspace in Finder', click: () => a.reveal(null) },
        sep,
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // Undo and redo go to the window, which gives them to a text field if you're typing in one and to the film
        // otherwise. The roles would only ever undo typing.
        cmd('Undo', 'undo', { accelerator: 'CmdOrCtrl+Z' }),
        cmd('Redo', 'redo', { accelerator: 'Shift+CmdOrCtrl+Z' }),
        sep,
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        sep,
        cmd('Duplicate', 'duplicate', { ...shown('CmdOrCtrl+D'), enabled: editing && s.selected }),
        cmd('Delete', 'delete', { ...shown('Backspace'), enabled: editing && s.selected }),
        cmd('Split Footage at Playhead', 'split', { ...shown('S'), enabled: editing }),
      ],
    },
    {
      label: 'Playback',
      submenu: [
        cmd('Play / Pause', 'play', { ...shown('Space'), enabled: editing }),
        sep,
        cmd('Go to Start', 'start', { ...shown('Home'), enabled: editing }),
        cmd('Go to End', 'end', { ...shown('End'), enabled: editing }),
      ],
    },
    {
      label: 'View',
      submenu: [
        cmd('Studio', 'room:studio', { accelerator: 'CmdOrCtrl+1', type: 'radio', checked: s.room === 'studio' }),
        cmd('Edit', 'room:edit', { accelerator: 'CmdOrCtrl+2', type: 'radio', checked: s.room === 'edit' }),
        sep,
        cmd('Claude', 'toggle-chat', { accelerator: 'CmdOrCtrl+L', type: 'checkbox', checked: s.chatOpen }),
        sep,
        { role: 'togglefullscreen' },
        ...(a.dev ? [sep, { role: 'reload' } as const, { role: 'toggleDevTools' } as const] : []),
      ],
    },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Open the Workspace Guide', click: () => a.guide() }] },
  ];
}
