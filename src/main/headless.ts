// A hidden window that renders frames with the same renderer as the preview (export, snapshots).
import { BrowserWindow, ipcMain } from 'electron';
import { preloadPath, rendererUrl } from './paths';
import type { HeadlessJob, HeadlessResult } from '../shared/api';

interface Running { job: HeadlessJob; onFrame?: (buf: Buffer) => Promise<void>; resolve: (r: HeadlessResult) => void; reject: (e: Error) => void }
const running = new Map<number, Running>();

export function registerHeadless() {
  ipcMain.handle('headless:job', (e) => running.get(e.sender.id)?.job ?? null);
  ipcMain.handle('headless:frame', async (e, buf: ArrayBuffer) => {
    const r = running.get(e.sender.id);
    if (!r?.onFrame) throw new Error('no frame sink');
    await r.onFrame(Buffer.from(buf));
  });
  ipcMain.handle('headless:done', (e, result: HeadlessResult) => {
    const r = running.get(e.sender.id);
    running.delete(e.sender.id);
    r?.resolve(result);
  });
}

export function runHeadless(job: HeadlessJob, onFrame?: (buf: Buffer) => Promise<void>): Promise<HeadlessResult> {
  const win = new BrowserWindow({ show: false, width: 320, height: 320, webPreferences: { preload: preloadPath, sandbox: false, backgroundThrottling: false } });
  return new Promise<HeadlessResult>((resolve, reject) => {
    running.set(win.webContents.id, { job, onFrame, resolve, reject });
    win.webContents.on('render-process-gone', (_e, d) => reject(new Error(`render window crashed: ${d.reason}`)));
    win.webContents.on('did-fail-load', (_e, code, desc) => reject(new Error(`render window failed to load: ${desc} (${code})`)));
    win.loadURL(rendererUrl('#headless'));
  }).finally(() => { running.delete(win.webContents.id); win.destroy(); });
}
