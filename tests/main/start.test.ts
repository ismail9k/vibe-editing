import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { formatFor, projectSlug, startProject } from '../../src/main/start';

let root: string, src: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vibe-start-'));
  src = mkdtempSync(join(tmpdir(), 'vibe-start-src-'));
});
const film = (name: string) => JSON.parse(readFileSync(join(root, `projects/${name}.vibe/vibe.json`), 'utf8'));

describe('projectSlug', () => {
  it('makes a folder name from what was typed', () => {
    expect(projectSlug('  My First Reel! ')).toBe('my-first-reel');
    expect(projectSlug('ريل جديد')).toBe('ريل-جديد');
    expect(projectSlug('!!')).toBe('untitled');
  });
});

describe('formatFor', () => {
  it('shapes the frame to the video as it is seen', () => {
    expect(formatFor(1080, 1920)).toEqual({ w: 1080, h: 1920, fps: 30 });
    expect(formatFor(3840, 2160)).toEqual({ w: 1920, h: 1080, fps: 30 });
    expect(formatFor(1920, 1080, -90)).toEqual({ w: 1080, h: 1920, fps: 30 }); // a phone held upright
    expect(formatFor(1000, 1000)).toEqual({ w: 1080, h: 1080, fps: 30 });
    expect(formatFor(0, 0)).toEqual({ w: 1080, h: 1920, fps: 30 });
  });
});

describe('startProject', () => {
  it('makes an empty film from a name alone', async () => {
    expect(await startProject(root, 'My Reel')).toEqual({ project: 'my-reel', media: [] });
    expect(film('my-reel')).toMatchObject({ name: 'my-reel', format: { w: 1080, h: 1920, fps: 30 }, tracks: { footage: [] } });
  });

  it('refuses a name that is taken, and leaves that project alone', async () => {
    await startProject(root, 'reel');
    const before = readFileSync(join(root, 'projects/reel.vibe/vibe.json'), 'utf8');
    await expect(startProject(root, 'Reel')).rejects.toThrow(/already exists/);
    expect(readFileSync(join(root, 'projects/reel.vibe/vibe.json'), 'utf8')).toBe(before);
  });

  it('makes nothing when a file is not a video or a sound', async () => {
    const notes = join(src, 'notes.txt');
    writeFileSync(notes, 'hi');
    await expect(startProject(root, 'reel', [notes])).rejects.toThrow(/not a video or audio file: notes.txt/);
    expect(existsSync(join(root, 'projects/reel.vibe'))).toBe(false);
  });

  it('leaves nothing behind when a file cannot be read as media', async () => {
    const broken = join(src, 'broken.mp4');
    writeFileSync(broken, 'not a video');
    await expect(startProject(root, 'reel', [broken])).rejects.toThrow();
    expect(existsSync(join(root, 'projects/reel.vibe'))).toBe(false);
  });
});

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe.skipIf(!hasFfmpeg)('startProject with a video', () => {
  it('copies the video in, puts it on the timeline and shapes the frame to it', async () => {
    const take = join(src, 'My Take.mp4'), pop = join(src, 'pop.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=10:d=2', take]);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', pop]);
    const r = await startProject(root, '', [take, pop]);
    expect(r).toEqual({ project: 'my-take', media: ['media/My Take.mp4', 'media/pop.wav'] });
    expect(existsSync(join(root, 'projects/my-take.vibe/media/My Take.mp4'))).toBe(true);
    const f = film('my-take');
    expect(f.format).toEqual({ w: 1920, h: 1080, fps: 30 });
    expect(f.tracks.footage).toHaveLength(1);
    expect(f.tracks.footage[0]).toMatchObject({ src: 'media/My Take.mp4', in: 0 });
    expect(f.tracks.footage[0].out).toBeCloseTo(2, 1);
    expect(f.tracks.audio[0]).toMatchObject({ src: 'media/pop.wav', at: 0 });
  });
});
