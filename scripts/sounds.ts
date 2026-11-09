// Writes the preset sound effects (src/core/sounds.ts) to presets/library/sounds/. Run with `npm run sounds`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { SOUNDS, wav } from '../src/core/sounds.ts';

const dir = new URL('../presets/library/sounds/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const name of Object.keys(SOUNDS)) writeFileSync(new URL(`${name}.wav`, dir), wav(name));
console.log(`wrote ${Object.keys(SOUNDS).length} sounds to presets/library/sounds/`);
