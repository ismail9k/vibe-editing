// Debounced writes to the workspace, one timer per file.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
export function writeLater(rel: string, text: string, ms = 300) {
  clearTimeout(timers.get(rel));
  timers.set(rel, setTimeout(() => { timers.delete(rel); window.vibe.write(rel, text); }, ms));
}
