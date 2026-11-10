import { describe, it, expect, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { EMPTY_MENU, menuTemplate, type MenuActions } from '../../src/main/menu-template';
import type { MenuState } from '../../src/shared/api';

const actions = (): MenuActions => ({ send: vi.fn(), reveal: vi.fn(), guide: vi.fn(), dev: false });
const open: MenuState = { projects: ['demo', 'reel'], project: 'reel', room: 'edit', chatOpen: true, selected: false };
const items = (t: MenuItemConstructorOptions[], menu: string) => t.find((m) => m.label === menu)!.submenu as MenuItemConstructorOptions[];
const item = (t: MenuItemConstructorOptions[], menu: string, label: string) => items(t, menu).find((i) => i.label === label)!;
const click = (i: MenuItemConstructorOptions) => (i.click as () => void)();

describe('menuTemplate', () => {
  it('has the Mac menus in their usual order', () => {
    const t = menuTemplate(open, actions());
    expect(t.map((m) => m.label ?? m.role)).toEqual(['appMenu', 'File', 'Edit', 'Playback', 'View', 'windowMenu', 'help']);
  });

  it('lists the projects and ticks the open one', () => {
    const a = actions(), list = item(menuTemplate(open, a), 'File', 'Open Project').submenu as MenuItemConstructorOptions[];
    expect(list.map((p) => [p.label, p.checked])).toEqual([['demo', false], ['reel', true]]);
    click(list[0]);
    expect(a.send).toHaveBeenCalledWith('open:demo');
  });

  it('sends New Project to the window, on ⌘N', () => {
    const a = actions(), n = item(menuTemplate(EMPTY_MENU, a), 'File', 'New Project…');
    expect(n.accelerator).toBe('CmdOrCtrl+N');
    expect(n.enabled).not.toBe(false); // works with nothing open
    click(n);
    expect(a.send).toHaveBeenCalledWith('new-project');
  });

  it('greys out what needs a project when none is open', () => {
    const t = menuTemplate(EMPTY_MENU, actions());
    for (const label of ['Import Video or Sound…', 'Export', 'Show Project in Finder']) expect(item(t, 'File', label).enabled).toBe(false);
    expect(item(t, 'File', 'Open Project').enabled).toBe(false);
    expect(item(t, 'Playback', 'Play / Pause').enabled).toBe(false);
  });

  it('offers Duplicate and Delete only with something selected in the Edit room', () => {
    expect(item(menuTemplate(open, actions()), 'Edit', 'Delete').enabled).toBe(false);
    expect(item(menuTemplate({ ...open, selected: true }, actions()), 'Edit', 'Delete').enabled).toBe(true);
    expect(item(menuTemplate({ ...open, selected: true, room: 'studio' }, actions()), 'Edit', 'Duplicate').enabled).toBe(false);
  });

  it('never takes a plain key away from typing', () => {
    const t = menuTemplate(open, actions());
    const all = ['Edit', 'Playback'].flatMap((m) => items(t, m));
    for (const i of all) if (i.accelerator && !/Cmd|Ctrl/.test(String(i.accelerator))) expect(i.registerAccelerator, String(i.label)).toBe(false);
    expect(item(t, 'Edit', 'Split Footage at Playhead').accelerator).toBe('S');
  });

  it('ticks the room and the Claude panel', () => {
    const t = menuTemplate(open, actions());
    expect(item(t, 'View', 'Edit').checked).toBe(true);
    expect(item(t, 'View', 'Studio').checked).toBe(false);
    expect(item(t, 'View', 'Claude').checked).toBe(true);
  });

  it('shows the project or the workspace in Finder', () => {
    const a = actions(), t = menuTemplate(open, a);
    click(item(t, 'File', 'Show Project in Finder'));
    click(item(t, 'File', 'Show Workspace in Finder'));
    expect(a.reveal).toHaveBeenNthCalledWith(1, 'reel');
    expect(a.reveal).toHaveBeenNthCalledWith(2, null);
  });

  it('keeps Reload and the developer tools out of the packaged app', () => {
    const roles = (dev: boolean) => items(menuTemplate(open, { ...actions(), dev }), 'View').map((i) => i.role);
    expect(roles(false)).not.toContain('toggleDevTools');
    expect(roles(true)).toContain('toggleDevTools');
  });
});
