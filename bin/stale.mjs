// Whether the CLI's build (out/) is older than the source it was built from, so `vibe` never runs stale code.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUTS = ['out/main/index.js', 'out/preload/index.mjs', 'out/renderer/index.html'];
const INPUTS = ['src', 'electron.vite.config.ts'];

/** The newest modification time under a file or folder (0 when it doesn't exist). */
function newest(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let t = 0;
  for (const name of readdirSync(path)) if (!name.startsWith('.')) t = Math.max(t, newest(join(path, name)));
  return t;
}

/** Why `appDir` needs `npm run build`, or null when out/ is up to date. */
export function staleReason(appDir) {
  const outs = OUTPUTS.map((f) => join(appDir, f));
  if (outs.some((f) => !existsSync(f))) return 'building the app first…';
  const built = Math.min(...outs.map((f) => statSync(f).mtimeMs));
  // Without the source (an installed copy), out/ is all there is.
  if (!existsSync(join(appDir, 'src'))) return null;
  return INPUTS.some((f) => newest(join(appDir, f)) > built) ? 'the source changed since the last build; rebuilding…' : null;
}
