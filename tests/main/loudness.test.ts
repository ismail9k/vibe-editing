// Runs the real ffmpeg: mastering must bring a quiet or an over-loud mix to the target loudness, keep its peaks
// under the ceiling after the AAC encode, and leave every sound where it was on the timeline.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject } from '../../src/core/model';
import { buildMeasureArgs, buildMixArgs, masterFilter, masterGain, parseLoudness, LOUDNESS } from '../../src/main/ffmpeg';

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

let dir = '';
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const measure = (file: string) => parseLoudness(spawnSync('ffmpeg', buildMeasureArgs(file), { encoding: 'utf8' }).stderr)!;

/** Mixes a project to a WAV, then masters it to AAC the way the export does; returns the AAC file. */
function master(name: string, tracks: object) {
  const p = parseProject(JSON.stringify({ tracks })).project!;
  const wav = join(dir, `${name}.wav`), out = join(dir, `${name}.m4a`);
  execFileSync('ffmpeg', buildMixArgs(p, dir, wav, Object.fromEntries(['media/tone.wav', 'media/loud.wav', 'media/click.wav'].map((s) => [s, true]))));
  const before = measure(wav);
  ff(['-i', wav, '-af', masterFilter(masterGain(before)), '-c:a', 'aac', '-b:a', '192k', out]);
  return { before, after: measure(out), out };
}

/** The time of the first sample louder than half scale. */
function onset(file: string): number {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
  for (let k = 0; k + 1 < pcm.length; k += 2) if (Math.abs(pcm.readInt16LE(k)) > 16384) return k / 2 / 48000;
  return -1;
}

beforeAll(() => {
  if (!hasFfmpeg) return;
  dir = mkdtempSync(join(tmpdir(), 'vibe-loud-'));
  mkdirSync(join(dir, 'media'));
  ff(['-f', 'lavfi', '-i', 'sine=f=440:d=6,volume=-10dB', join(dir, 'media/tone.wav')]);
  ff(['-f', 'lavfi', '-i', 'sine=f=220:d=6,volume=17.5dB', join(dir, 'media/loud.wav')]);
  ff(['-f', 'lavfi', '-i', 'sine=f=1000:d=0.05', join(dir, 'media/click.wav')]);
});
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const g = { id: 'g1', type: 'stat', at: 0, dur: 6, props: {} };

describe.skipIf(!hasFfmpeg)('mastering', () => {
  it('turns a quiet mix up to the target', () => {
    const { before, after } = master('quiet', { graphics: [g], audio: [{ id: 'a1', src: 'media/tone.wav', at: 0, gain: 1 }] });
    expect(before.i).toBeLessThan(-25);
    expect(Math.abs(after.i - LOUDNESS.target)).toBeLessThan(0.5);
    expect(after.tp).toBeLessThanOrEqual(-1);
  });

  it('turns an over-full mix down without clipping it first', () => {
    const loud = { id: 'a1', src: 'media/loud.wav', at: 0, gain: 1 };
    const { before, after } = master('loud', { graphics: [g], audio: [loud, { ...loud, id: 'a2' }] });
    expect(before.tp).toBeGreaterThan(0); // two full-scale sounds add up past 0 dBFS in the float mix
    expect(Math.abs(after.i - LOUDNESS.target)).toBeLessThan(0.5);
    expect(after.tp).toBeLessThanOrEqual(-1);
  });

  it('keeps a limited peak where it was on the timeline', () => {
    const { out } = master('click', { graphics: [g], audio: [
      { id: 'a1', src: 'media/tone.wav', at: 0, gain: 0.3 },
      { id: 'a2', src: 'media/click.wav', at: 2.5, gain: 1 },
    ] });
    // AAC adds its own priming delay, which players skip; allow a couple of milliseconds.
    expect(Math.abs(onset(out) - 2.5)).toBeLessThan(0.003);
  });

  it('leaves a silent film silent', () => {
    const { before } = master('silent', { graphics: [g] });
    expect(masterGain(before)).toBe(0);
  });
});
