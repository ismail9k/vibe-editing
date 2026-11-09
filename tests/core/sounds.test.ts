// The preset sound effects are written by src/core/sounds.ts (`npm run sounds`); these keep the files in step with
// the code and check each one is a clean, level, mono WAV.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { RATE, SOUNDS, wav } from '../../src/core/sounds';

const dir = 'presets/library/sounds';
const samples = (b: Uint8Array) => { const v = new DataView(b.buffer, b.byteOffset, b.byteLength); return Array.from({ length: (b.length - 44) / 2 }, (_, i) => v.getInt16(44 + i * 2, true)); };

describe('preset sounds', () => {
  it('ships exactly the sounds the code makes', () => {
    expect(readdirSync(dir).filter((f) => f.endsWith('.wav')).sort()).toEqual(Object.keys(SOUNDS).map((n) => `${n}.wav`).sort());
  });

  it.each(Object.keys(SOUNDS))('%s.wav matches the code (run `npm run sounds` after changing it)', (name) => {
    const file = samples(readFileSync(`${dir}/${name}.wav`)), made = samples(wav(name));
    expect(file.length).toBe(made.length);
    // Maths functions may round a last bit differently on another machine: allow one step of 16-bit.
    expect(Math.max(...file.map((s, i) => Math.abs(s - made[i])))).toBeLessThanOrEqual(1);
  });

  it.each(Object.keys(SOUNDS))('%s is a 48 kHz mono WAV peaking at -3 dB, silent at both ends', (name) => {
    const b = wav(name), v = new DataView(b.buffer);
    expect(new TextDecoder().decode(b.slice(0, 4))).toBe('RIFF');
    expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true)]).toEqual([1, RATE, 16]);
    const s = samples(b), peak = Math.max(...s.map(Math.abs));
    expect(Math.abs(20 * Math.log10(peak / 32767) + 3)).toBeLessThan(0.1);
    expect(s[0]).toBe(0);
    expect(Math.abs(s[s.length - 1])).toBeLessThanOrEqual(1);
    expect(s.length / RATE).toBeLessThanOrEqual(2);
  });
});
