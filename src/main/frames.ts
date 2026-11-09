// Raw frames from an ffmpeg pipe, one at a time. The stream is paused while frames pile up, so a fast decoder
// never buffers more than a few 8 MB frames ahead of the render window.
import type { Readable } from 'node:stream';

export class FrameReader {
  private chunks: Buffer[] = [];
  private size = 0;
  private ended = false;
  private wake: (() => void) | null = null;

  constructor(private stream: Readable, private frameSize: number, private maxQueued = 3) {
    stream.on('data', (d: Buffer) => {
      this.chunks.push(d); this.size += d.length;
      if (this.size >= this.frameSize * this.maxQueued) stream.pause();
      this.poke();
    });
    const end = () => { this.ended = true; this.poke(); };
    stream.on('end', end); stream.on('close', end); stream.on('error', end);
  }

  private poke() { const w = this.wake; this.wake = null; w?.(); }

  /** The first n queued bytes, off the front of the queue. Only a frame split across chunks is copied, into a
   *  buffer one frame long; the rest of the queue is left where it is. */
  private take(n: number): Buffer {
    const first = this.chunks[0];
    this.size -= n;
    if (first.length >= n) {
      if (first.length === n) this.chunks.shift(); else this.chunks[0] = first.subarray(n);
      return first.subarray(0, n);
    }
    const out = Buffer.allocUnsafe(n);
    for (let at = 0; at < n;) {
      const c = this.chunks[0], k = Math.min(c.length, n - at);
      c.copy(out, at, 0, k);
      at += k;
      if (k === c.length) this.chunks.shift(); else this.chunks[0] = c.subarray(k);
    }
    return out;
  }

  /** The next whole frame, or null once the stream has ended (a trailing partial frame is dropped). */
  async next(): Promise<Buffer | null> {
    while (this.size < this.frameSize) {
      if (this.ended) return null;
      await new Promise<void>((ok) => { this.wake = ok; });
    }
    const frame = this.take(this.frameSize);
    if (this.size < this.frameSize * this.maxQueued && this.stream.isPaused() && !this.ended) this.stream.resume();
    return frame;
  }
}
