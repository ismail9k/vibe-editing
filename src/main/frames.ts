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

  /** The next whole frame, or null once the stream has ended (a trailing partial frame is dropped). */
  async next(): Promise<Buffer | null> {
    while (this.size < this.frameSize) {
      if (this.ended) return null;
      await new Promise<void>((ok) => { this.wake = ok; });
    }
    const all = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks, this.size);
    const frame = all.subarray(0, this.frameSize);
    const rest = all.subarray(this.frameSize);
    this.chunks = rest.length ? [rest] : []; this.size = rest.length;
    if (this.size < this.frameSize * this.maxQueued && this.stream.isPaused() && !this.ended) this.stream.resume();
    return frame;
  }
}
