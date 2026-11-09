import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const preloadPath = join(here, '../preload/index.mjs');
export const rendererUrl = (hash = '') =>
  process.env.ELECTRON_RENDERER_URL ? `${process.env.ELECTRON_RENDERER_URL}${hash}` : `file://${join(here, '../renderer/index.html')}${hash}`;
