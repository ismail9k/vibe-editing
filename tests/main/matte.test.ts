import { describe, it, expect } from 'vitest';
import { parseProject } from '../../src/core/model';
import { matteSize, matteDecodeArgs, matteEncodeArgs, usesMatte, missingMattes } from '../../src/main/matte';

describe('matteSize', () => {
  it('keeps the long side at 960 and even sides', () => {
    expect(matteSize(3840, 2160, 0)).toEqual([960, 540]);
    expect(matteSize(1080, 1920, 0)).toEqual([540, 960]);
    expect(matteSize(1001, 777, 0)).toEqual([960, 746]);
  });
  it('swaps sides for footage shot sideways, since ffmpeg turns frames upright', () => {
    expect(matteSize(3840, 2160, -90)).toEqual([540, 960]);
    expect(matteSize(3840, 2160, 270)).toEqual([540, 960]);
    expect(matteSize(3840, 2160, -180)).toEqual([960, 540]);
  });
  it('never upscales small footage', () => {
    expect(matteSize(640, 360, 0)).toEqual([640, 360]);
  });
});

describe('matte ffmpeg args', () => {
  it('decodes the whole file to BGRA at 30 fps, tone-mapping HDR', () => {
    const a = matteDecodeArgs('/p/media/a.mov', 960, 540, true);
    expect(a).toContain('/p/media/a.mov');
    expect(a).not.toContain('-ss');
    const vf = a[a.indexOf('-vf') + 1];
    expect(vf).toContain('tonemap=tonemap=reinhard');
    expect(vf).toMatch(/fps=30,format=bgra$/);
    expect(a.slice(-5)).toEqual(['-f', 'rawvideo', '-pix_fmt', 'bgra', 'pipe:1']);
  });
  it('encodes grey frames from stdin to H.264', () => {
    const a = matteEncodeArgs(960, 540, '/p/media/.matte/a.mov.matte.partial.mp4');
    expect(a.join(' ')).toContain('-f rawvideo -pix_fmt gray -s 960x540 -r 30 -i pipe:0');
    expect(a).toContain('libx264');
    expect(a.at(-1)).toBe('/p/media/.matte/a.mov.matte.partial.mp4');
  });
});

describe('which projects need mattes', () => {
  const p = parseProject(JSON.stringify({ tracks: {
    footage: [{ id: 'f1', src: 'media/a.mov', in: 0, out: 2 }, { id: 'f2', src: 'media/a.mov', in: 4, out: 6 }, { id: 'f3', src: 'media/b.mov', in: 0, out: 1 }],
    graphics: [{ id: 'g1', type: 'orbit', at: 0, dur: 1 }],
  } })).project!;
  it('needs them when a graphic is a matte component', () => {
    expect(usesMatte(p, { orbit: { matte: true } })).toBe(true);
    expect(usesMatte(p, { orbit: {} })).toBe(false);
    expect(usesMatte(p, {})).toBe(false);
  });
  it('lists each source without a matte once', () => {
    expect(missingMattes(p, (rel) => rel === 'media/.matte/b.mov.matte.mp4')).toEqual(['media/a.mov']);
  });
});
