import { describe, it, expect } from 'vitest';
import { parseProject } from '../../src/core/model';
import { frameMedia } from '../../src/renderer/ui/Preview';

// Two clips of one take: a cut at 2 s jumps from 0–2 s of the file to 10–12 s.
const p = parseProject(JSON.stringify({ tracks: { footage: [
  { id: 'f1', src: 'media/take.mp4', in: 0, out: 2 },
  { id: 'f2', src: 'media/take.mp4', in: 10, out: 12 },
] } })).project!;
const matteUrl = 'vibe://ws/projects/demo/media/.matte/take.mp4.matte.mp4?v=1';
const video = (currentTime: number, extra: Record<string, unknown> = {}) =>
  ({ dataset: { ready: '1' }, readyState: 4, seeking: false, currentTime, ...extra }) as unknown as HTMLVideoElement;
const matte = (currentTime: number, extra: Record<string, unknown> = {}) => video(currentTime, { dataset: { ready: '1', src: matteUrl }, ...extra });

describe('the preview matte', () => {
  it('is used when it shows the same moment as the picture', () => {
    const m = matte(1.02);
    expect(frameMedia(video(1), m, p, 'demo', 1).matte).toBe(m);
  });

  it('is left out just after a cut, while it still shows the last clip', () => {
    expect(frameMedia(video(10.05), matte(1.99), p, 'demo', 2.05).matte).toBeNull();
  });

  it('is left out while it seeks', () => {
    expect(frameMedia(video(10.05), matte(10.05, { seeking: true }), p, 'demo', 2.05).matte).toBeNull();
  });

  it('is left out when it belongs to another file, and when the film wants none', () => {
    const other = matte(1, { dataset: { ready: '1', src: 'vibe://ws/projects/demo/media/.matte/b.mp4.matte.mp4?v=1' } });
    expect(frameMedia(video(1), other, p, 'demo', 1).matte).toBeNull();
    expect(frameMedia(video(1), matte(1), null, 'demo', 1).matte).toBeNull();
  });
});
