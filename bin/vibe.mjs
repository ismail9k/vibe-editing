#!/usr/bin/env node
// vibe: the Vibe Editing CLI. Runs the app's main process headless (`--cli`) so it renders exactly like the app.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { staleReason } from './stale.mjs';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let electron;
try { electron = require('electron'); } catch {
  console.error('vibe: electron is not installed. Run `npm install` in ' + appDir);
  process.exit(1);
}
if (!existsSync(electron)) {
  console.error(`vibe: the Electron binary is missing. Run: node ${join(appDir, 'node_modules/electron/install.js')}`);
  process.exit(1);
}
const stale = staleReason(appDir);
if (stale) {
  console.error(`vibe: ${stale}`);
  const b = spawnSync('npm', ['run', 'build'], { cwd: appDir, stdio: ['ignore', 'ignore', 'inherit'] });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const [command, ...rest] = process.argv.slice(2);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_RENDERER_URL;

if (command === 'open') {
  const args = [appDir, ...(rest[0] ? ['--project', rest[0]] : [])];
  spawn(electron, args, { env, detached: true, stdio: 'ignore' }).unref();
} else {
  const child = spawn(electron, [appDir, '--cli', ...(command ? [command] : []), ...rest], { env, stdio: 'inherit' });
  child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1));
}
