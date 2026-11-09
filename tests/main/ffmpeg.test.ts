import { describe, it, expect } from 'vitest';
import { parseProject } from '../../src/core/model';
import { buildFfmpegArgs, fitFilter } from '../../src/main/ffmpeg';

const proj = (o: object) => parseProject(JSON.stringify(o)).project!;
const count = (args: string[], v: string) => args.filter((a) => a === v).length;

describe('buildFfmpegArgs', () => {
  it('trims and concatenates two clips under the overlay', () => {
    const p = proj({ tracks: { footage: [{ id: 'f1', src: 'media/a.mov', in: 2, out: 5 }, { id: 'f2', src: 'media/b.mov', in: 0, out: 4 }] } });
    const args = buildFfmpegArgs(p, '/w/projects/x', '/w/projects/x/out/x.mp4', { 'media/a.mov': true, 'media/b.mov': false });
    expect(count(args, '-ss')).toBe(2);
    expect(args[args.indexOf('-ss') + 1]).toBe('2');
    expect(args).toContain('/w/projects/x/media/a.mov');
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('concat=n=2:v=1:a=1');
    expect(graph).toContain('overlay');
    expect(graph).toContain('anullsrc'); // b.mov has no audio: silence keeps the concat in step
    expect(graph).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920');
    expect(args.join(' ')).toContain('-pix_fmt yuv420p');
    expect(args[args.lastIndexOf('-t') + 1]).toBe('7');
    expect(args[args.length - 1]).toBe('/w/projects/x/out/x.mp4');
  });

  it('reads the overlay as raw RGBA frames on stdin', () => {
    const args = buildFfmpegArgs(proj({ tracks: {} }), '/w/p', '/w/p/out/p.mp4', {});
    expect(args.join(' ')).toContain('-f rawvideo -pix_fmt rgba -s 1080x1920 -r 30 -i pipe:0');
  });

  it('uses a black base and silence when there is no footage', () => {
    const args = buildFfmpegArgs(proj({ tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 3, props: {} }] } }), '/w/p', '/w/p/out/p.mp4', {});
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(count(args, '-i')).toBe(1);
    expect(graph).toContain('color=c=black:s=1080x1920:r=30:d=3');
    expect(graph).toContain('anullsrc');
    expect(graph).not.toContain('concat');
  });

  it('delays and mixes sounds at their times', () => {
    const p = proj({ tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 4, props: {} }], audio: [{ id: 'a1', src: 'media/whoosh.wav', at: 1.5, gain: 0.5 }] } });
    const graph = buildFfmpegArgs(p, '/w/p', '/w/p/out/p.mp4', { 'media/whoosh.wav': true }).join(' ');
    expect(graph).toContain('adelay=1500|1500');
    expect(graph).toContain('volume=0.5');
    expect(graph).toContain('amix=inputs=2');
  });

  it('refuses media paths that leave the project folder', () => {
    const p = proj({ tracks: { footage: [{ id: 'f1', src: '../../other/secret.mov', in: 0, out: 2 }] } });
    expect(() => buildFfmpegArgs(p, '/w/projects/x', '/w/projects/x/out/x.mp4', {})).toThrow(/outside/);
    const q = proj({ tracks: { graphics: [{ id: 'g1', type: 'stat', at: 0, dur: 2, props: {} }], audio: [{ id: 'a1', src: '../x.wav', at: 0, gain: 1 }] } });
    expect(() => buildFfmpegArgs(q, '/w/projects/x', '/w/projects/x/out/x.mp4', {})).toThrow(/outside/);
  });

  it('tone-maps HDR clips (HLG or PQ) to SDR and leaves SDR clips alone', () => {
    const p = proj({ tracks: { footage: [{ id: 'f1', src: 'media/iphone.mov', in: 0, out: 2 }, { id: 'f2', src: 'media/sdr.mp4', in: 0, out: 2 }] } });
    const args = buildFfmpegArgs(p, '/w/p', '/w/p/out/p.mp4', {}, { 'media/iphone.mov': true });
    const graph = args[args.indexOf('-filter_complex') + 1];
    const [v0, v1] = graph.split(';').filter((g) => g.startsWith('[0:v]') || g.startsWith('[1:v]'));
    expect(v0).toContain('tonemap=tonemap=reinhard');
    expect(v0).toContain('out_transfer=bt709');
    expect(v1).not.toContain('tonemap');
  });

  it('fitFilter fills the frame and only tone-maps when asked', () => {
    expect(fitFilter(1080, 1920, false)).toBe('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1');
    expect(fitFilter(1080, 1920, true)).toMatch(/out_transfer=linear.*tonemap=tonemap=reinhard.*crop=1080:1920,setsar=1$/);
  });
});
