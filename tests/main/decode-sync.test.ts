// Runs the real ffmpeg: the decoded footage must stay on the timeline across many cuts, or the picture drifts
// against the sound (which is cut sample-exact) and the cutout drifts against the picture.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject } from '../../src/core/model';
import { buildDecodeArgs } from '../../src/main/ffmpeg';

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const SRC_FPS = 60, F = 30, S = 32;

// Deterministic cuts with awkward, off-frame in-points and lengths.
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const clips = Array.from({ length: 24 }, (_, k) => {
  const dur = 0.4 + rnd() * 1.1, inn = rnd() * 50;
  return { id: `f${k}`, src: 'media/src.mkv', in: +inn.toFixed(3), out: +(inn + dur).toFixed(3) };
});

let dir = '';
beforeAll(() => {
  if (!hasFfmpeg) return;
  dir = mkdtempSync(join(tmpdir(), 'vibe-sync-'));
  mkdirSync(join(dir, 'media'));
  // Every source frame carries its own index: red = N mod 256, green = N / 256.
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `nullsrc=s=${S}x${S}:r=${SRC_FPS}:d=55,format=gbrp,geq=r='mod(N,256)':g='floor(N/256)':b=0`,
    '-c:v', 'ffv1', '-g', '1', join(dir, 'media/src.mkv')]);
});
afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe.skipIf(!hasFfmpeg)('decoded footage across cuts', () => {
  it('gives every timeline frame the source frame the timeline puts there, with one frame per 1/fps', () => {
    const p = parseProject(JSON.stringify({ format: { w: S, h: S, fps: F }, tracks: { footage: clips } })).project!;
    const buf = execFileSync('ffmpeg', buildDecodeArgs(p, dir, 'video', {})!, { maxBuffer: 1 << 26 });
    const size = S * S * 4, got: number[] = [];
    for (let o = 0; o + size <= buf.length; o += size) got.push(buf[o] + 256 * buf[o + 1]);

    let T = 0;
    // A clip owns the frames from the first instant at or after its start (a cut exactly on a frame is the new clip's).
    const spans = clips.map((c) => { const s = T; T += c.out - c.in; return { c, s, first: Math.ceil(s * F - 1e-6) }; });
    expect(got.length).toBe(Math.ceil(T * F - 1e-6));
    let worst = 0;
    for (let i = 0; i < got.length; i++) {
      const t = i / F, sp = spans.filter((s) => s.first <= i).pop()!;
      worst = Math.max(worst, Math.abs(got[i] - (sp.c.in + t - sp.s) * SRC_FPS));
    }
    // Within one source frame of the exact instant, at the first cut and the last.
    expect(worst).toBeLessThanOrEqual(1);
  }, 60_000);
});
