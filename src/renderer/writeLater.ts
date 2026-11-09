// Debounced writes to the workspace, one timer per file. A write that would overwrite an outside
// change is dropped and the library reloads from disk (disk wins).
import { writeDisk } from './disk';
import { useStore } from './store';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
export function writeLater(rel: string, text: string, ms = 300) {
  clearTimeout(timers.get(rel));
  timers.set(rel, setTimeout(async () => {
    timers.delete(rel);
    if (await writeDisk(rel, text)) return;
    await useStore.getState().reloadLibrary();
    useStore.setState({ diskNote: { text: `${rel} changed on disk; your last change was not saved`, at: Date.now() } });
  }, ms));
}

/** Drop a pending write: the file just changed on disk. */
export function cancelWriteLater(rel: string) {
  clearTimeout(timers.get(rel));
  timers.delete(rel);
}
