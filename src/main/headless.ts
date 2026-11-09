// A hidden window that renders frames with the same renderer as the preview (export, snapshots).
import { BrowserWindow, ipcMain } from 'electron';
import { preloadPath, rendererUrl } from './paths';
import { Watchdog } from './watchdog';
import type { HeadlessJob, HeadlessMedia, HeadlessResult } from '../shared/api';

export type MediaSource = (i: number) => Promise<HeadlessMedia>;

/** How long the render window may go without asking for or sending anything before the job is given up. Loading
 *  the library and drawing one frame take well under a second; this only catches a window that has hung. */
const IDLE_MS = 60_000;

interface Running { job: HeadlessJob; onFrame?: (buf: Buffer) => Promise<void>; media?: MediaSource; resolve: (r: HeadlessResult) => void; reject: (e: Error) => void; dog: Watchdog }
const running = new Map<number, Running>();

export function registerHeadless() {
  ipcMain.handle('headless:job', (e) => { const r = running.get(e.sender.id); r?.dog.kick(); return r?.job ?? null; });
  ipcMain.handle('headless:frame', async (e, buf: ArrayBuffer) => {
    const r = running.get(e.sender.id);
    if (!r?.onFrame) throw new Error('no frame sink');
    await r.dog.hold(() => r.onFrame!(Buffer.from(buf)));
  });
  // One frame in flight: the window asks for the footage under the frame it is about to draw.
  ipcMain.handle('headless:media', async (e, i: number): Promise<HeadlessMedia> => {
    const r = running.get(e.sender.id);
    return r?.media ? r.dog.hold(() => r.media!(i)) : { frame: null, matte: null };
  });
  ipcMain.handle('headless:done', (e, result: HeadlessResult) => {
    const r = running.get(e.sender.id);
    running.delete(e.sender.id);
    r?.dog.stop();
    r?.resolve(result);
  });
}

export function runHeadless(job: HeadlessJob, onFrame?: (buf: Buffer) => Promise<void>, media?: MediaSource): Promise<HeadlessResult> {
  const win = new BrowserWindow({ show: false, width: 320, height: 320, webPreferences: { preload: preloadPath, sandbox: false, backgroundThrottling: false } });
  let dog: Watchdog | undefined;
  return new Promise<HeadlessResult>((resolve, reject) => {
    dog = new Watchdog(IDLE_MS, () => reject(new Error(`the render window stopped responding (nothing for ${IDLE_MS / 1000} s)`)));
    running.set(win.webContents.id, { job, onFrame, media, resolve, reject, dog });
    win.webContents.on('render-process-gone', (_e, d) => reject(new Error(`render window crashed: ${d.reason}`)));
    win.webContents.on('did-fail-load', (_e, code, desc) => reject(new Error(`render window failed to load: ${desc} (${code})`)));
    win.loadURL(rendererUrl('#headless'));
  }).finally(() => { dog?.stop(); running.delete(win.webContents.id); win.destroy(); });
}
