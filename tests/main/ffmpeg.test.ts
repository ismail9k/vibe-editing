import { describe, it, expect } from 'vitest';
import { parseProject, matteSrc } from '../../src/core/model';
import { buildDecodeArgs, buildEncodeArgs, buildStillArgs, fitFilter, clipOverruns } from '../../src/main/ffmpeg';

const proj = (o: object) => parseProject(JSON.stringify(o)).project!;
const count = (args: string[], v: string) => args.filter((a) => a === v).length;
const graphOf = (args: string[]) => args[args.indexOf('-filter_complex') + 1];
const twoClips = () => proj({ tracks: { footage: [{ id: 'f1', src: 'media/a.mov', in: 2, out: 5 }, { id: 'f2', src: 'media/b.mov', in: 0, out: 4 }] } });

describe('matteSrc', () => {
  it('keeps mattes in a hidden folder next to the media', () => {
    expect(matteSrc('media/a.mov')).toBe('media/.matte/a.mov.matte.mp4');
  });
});

describe('buildDecodeArgs', () => {
  it('trims, fills the frame and joins the clips into raw RGBA frames on stdout', () => {
    const args = buildDecodeArgs(twoClips(), '/w/projects/x', 'video', {})!;
    expect(count(args, '-ss')).toBe(2);
    expect(args[args.indexOf('-ss') + 1]).toBe('2');
    expect(args).toContain('/w/projects/x/media/a.mov');
    const g = graphOf(args);
    expect(g).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');
    expect(g).toContain('fps=30');
    expect(g).toContain('concat=n=2:v=1:a=0');
    expect(args.slice(-5)).toEqual(['-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
  });

  it('gives each clip exactly the frames its stretch of the timeline holds', () => {
    const g = graphOf(buildDecodeArgs(twoClips(), '/w/p', 'video', {})!);
    const [a, b] = g.split(';');
    expect(a).toContain('trim=end_frame=90');
    expect(b).toContain('trim=end_frame=120');
    expect(g).toMatch(/concat=n=2:v=1:a=0\[out\]$/);
  });

  it('starts a clip that begins between frames at its first frame instant', () => {
    const p = proj({ tracks: { footage: [{ id: 'f1', src: 'media/a.mov', in: 0, out: 0.05 }, { id: 'f2', src: 'media/b.mov', in: 10, out: 11 }] } });
    const args = buildDecodeArgs(p, '/w/p', 'video', {})!;
    const ss = args.flatMap((a, i) => (a === '-ss' ? [args[i + 1]] : []));
    // Clip two starts at 0.05 s; the first frame it owns is at 2/30 s, 0.0167 s into it.
    expect(ss).toEqual(['0', '10.017']);
  });

  it('tone-maps only the HDR clips', () => {
    const g = graphOf(buildDecodeArgs(twoClips(), '/w/p', 'video', { 'media/a.mov': true })!);
    const [a, b] = g.split(';');
    expect(a).toContain('tonemap=tonemap=reinhard');
    expect(b).not.toContain('tonemap');
  });

  it('decodes the mattes as grey frames at half size', () => {
    const args = buildDecodeArgs(twoClips(), '/w/p', 'matte', {})!;
    expect(args).toContain('/w/p/media/.matte/a.mov.matte.mp4');
    expect(graphOf(args)).toContain('scale=540:960:force_original_aspect_ratio=increase,crop=540:960');
    expect(args.slice(-5)).toEqual(['-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
  });

  it('stands a blank in for a clip whose matte isn\'t ready, so the other clips keep theirs', () => {
    const args = buildDecodeArgs(twoClips(), '/w/p', 'matte', {}, (src) => src === 'media/b.mov')!;
    expect(args).not.toContain('/w/p/media/.matte/a.mov.matte.mp4');
    expect(args).toContain('/w/p/media/.matte/b.mov.matte.mp4');
    expect(args[args.indexOf('lavfi') + 2]).toMatch(/^color=c=black:s=540x960:r=30/);
    expect(graphOf(args)).toContain('trim=end_frame=90');
  });

  it('has nothing to decode without footage', () => {
    expect(buildDecodeArgs(proj({ tracks: {} }), '/w/p', 'video', {})).toBeNull();
  });

  it('refuses media paths that leave the project folder', () => {
    const p = proj({ tracks: { footage: [{ id: 'f1', src: '../../other/secret.mov', in: 0, out: 2 }] } });
    expect(() => buildDecodeArgs(p, '/w/projects/x', 'video', {})).toThrow(/outside/);
  });
});

describe('buildEncodeArgs', () => {
  it('takes the finished frames as raw RGBA on stdin', () => {
    const args = buildEncodeArgs(proj({ tracks: {} }), '/w/p', '/w/p/out/p.mp4', {});
    expect(args.join(' ')).toContain('-f rawvideo -pix_fmt rgba -s 1080x1920 -r 30 -i pipe:0');
    expect(args[args.length - 1]).toBe('/w/p/out/p.mp4');
  });

  it('joins the clips\' sound, with silence for clips that have none', () => {
    const args = buildEncodeArgs(twoClips(), '/w/p', '/w/p/out/p.mp4', { 'media/a.mov': true, 'media/b.mov': false });
    const g = graphOf(args);
    expect(g).toContain('concat=n=2:v=0:a=1');
    expect(g).toContain('anullsrc');
    expect(args[args.lastIndexOf('-t') + 1]).toBe('7');
    expect(args.join(' ')).toContain('-c:v libx264 -pix_fmt yuv420p');
  });

  it('delays and mixes sounds at their times', () => {
    const p = proj({ tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 4, props: {} }], audio: [{ id: 'a1', src: 'media/whoosh.wav', at: 1.5, gain: 0.5 }] } });
    const g = graphOf(buildEncodeArgs(p, '/w/p', '/w/p/out/p.mp4', { 'media/whoosh.wav': true }));
    expect(g).toContain('adelay=1500|1500');
    expect(g).toContain('volume=0.5');
    expect(g).toContain('amix=inputs=2');
  });

  it('refuses sound paths that leave the project folder', () => {
    const p = proj({ tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 2, props: {} }], audio: [{ id: 'a1', src: '../x.wav', at: 0, gain: 1 }] } });
    expect(() => buildEncodeArgs(p, '/w/projects/x', '/w/projects/x/out/x.mp4', {})).toThrow(/outside/);
  });
});

describe('fitFilter', () => {
  it('fills the frame and only tone-maps when asked', () => {
    expect(fitFilter(1080, 1920, false)).toBe('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1');
    expect(fitFilter(1080, 1920, true)).toMatch(/out_transfer=linear.*tonemap=tonemap=reinhard.*crop=1080:1920,setsar=1$/);
  });
});

describe('clipOverruns', () => {
  it('names clips that end after their media does (probed lengths)', () => {
    const p = proj({ tracks: { footage: [{ id: 'f1', src: 'media/a.mov', in: 0, out: 5 }, { id: 'f2', src: 'media/a.mov', in: 10, out: 22 }] } });
    expect(clipOverruns(p, { 'media/a.mov': 20.17 })).toEqual(['f2 ends at 22 s but media/a.mov is only 20.17 s long']);
  });
});

describe('buildStillArgs', () => {
  it('decodes one fitted RGBA frame at a source time', () => {
    const a = buildStillArgs('/p/media/a.mov', 3.5, 1080, 1920, 'video', true);
    expect(a.slice(a.indexOf('-ss'), a.indexOf('-ss') + 4)).toEqual(['-ss', '3.5', '-i', '/p/media/a.mov']);
    expect(a.join(' ')).toContain('tonemap=tonemap=reinhard');
    expect(a.slice(-7)).toEqual(['-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
  });
  it('decodes a grey matte at half size', () => {
    const a = buildStillArgs('/p/media/.matte/a.mov.matte.mp4', 1, 1080, 1920, 'matte', false).join(' ');
    expect(a).toContain('scale=540:960:force_original_aspect_ratio=increase,crop=540:960');
    expect(a).toContain('-pix_fmt gray pipe:1');
  });
});
