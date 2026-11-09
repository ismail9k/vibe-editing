import { app } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const preloadPath = join(here, '../preload/index.mjs');
export const rendererUrl = (hash = '') =>
  process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}${hash}` : `file://${join(here, '../renderer/index.html')}${hash}`;
/** The app's root: package.json, presets/ and native/ live here (the repo in dev). */
export const appDir = join(here, '../..');
/** Where the cutout helper is built: the app's own data folder, not the workspace. Packaged, its Swift source
 *  sits in app.asar.unpacked (see electron-builder.yml), since swiftc can't read inside the archive. */
export const matteTools = () => ({ appDir: unpacked(appDir), binDir: join(app.getPath('userData'), 'bin') });
export const unpacked = (dir: string) => dir.replace(/app\.asar$/, 'app.asar.unpacked');
/** The app's own data folder: the cutout helper and downloaded whisper models live here. */
export const userDataDir = () => app.getPath('userData');
