import { describe, it, expect, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { FrameReader } from '../../src/main/frames';

describe('FrameReader', () => {
  it('cuts a byte stream into whole frames, however the chunks arrive', async () => {
    const s = new PassThrough(), r = new FrameReader(s, 4);
    s.write(Buffer.from([1, 2, 3])); s.write(Buffer.from([4, 5])); s.write(Buffer.from([6, 7, 8, 9, 10])); s.end();
    expect([...(await r.next())!]).toEqual([1, 2, 3, 4]);
    expect([...(await r.next())!]).toEqual([5, 6, 7, 8]);
    expect(await r.next()).toBeNull(); // 9, 10 is a partial frame: dropped at the end
    expect(await r.next()).toBeNull();
  });

  it('waits for data that has not arrived yet', async () => {
    const s = new PassThrough(), r = new FrameReader(s, 2);
    const pending = r.next();
    setTimeout(() => s.write(Buffer.from([7, 8])), 5);
    expect([...(await pending)!]).toEqual([7, 8]);
  });

  it('pauses the stream while frames pile up, so memory stays bounded', async () => {
    const s = new PassThrough(), r = new FrameReader(s, 1, 2);
    s.write(Buffer.from([1, 2, 3, 4, 5]));
    await new Promise((ok) => setTimeout(ok, 5));
    expect(s.isPaused()).toBe(true);
    await r.next(); await r.next(); await r.next(); await r.next();
    expect(s.isPaused()).toBe(false);
  });

  it('copies only the frame it hands out, never the whole queue', async () => {
    const s = new PassThrough(), r = new FrameReader(s, 4, 3);
    s.write(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])); // three frames queued in one chunk
    s.write(Buffer.from([13, 14])); s.write(Buffer.from([15, 16]));
    await new Promise((ok) => setTimeout(ok, 5));
    const alloc = vi.spyOn(Buffer, 'allocUnsafe'), concat = vi.spyOn(Buffer, 'concat');
    const got: number[][] = [];
    for (let i = 0; i < 4; i++) got.push([...(await r.next())!]);
    expect(got).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]]);
    expect(concat).not.toHaveBeenCalled();
    // Only the frame split over two chunks needs a buffer of its own, and only one frame long.
    expect(alloc.mock.calls).toEqual([[4]]);
    alloc.mockRestore(); concat.mockRestore();
  });
});
