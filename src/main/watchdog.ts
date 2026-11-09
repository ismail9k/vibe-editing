// Gives up on a worker that goes quiet: the hidden render window can hang (a component stuck in a loop, a module
// that never loads), and without this an export would wait forever.

export class Watchdog {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = 0;
  private fired = false;

  /** Calls `onIdle` once `ms` pass with no `kick()` while nothing is `hold()`ing it. */
  constructor(private ms: number, private onIdle: () => void) { this.arm(); }

  /** The worker just showed signs of life. */
  kick() { this.arm(); }

  /** Pause while our side is the one working (decoding, encoding): the worker is waiting on us, not stuck. */
  async hold<T>(work: () => Promise<T>): Promise<T> {
    this.busy++;
    this.clear();
    try { return await work(); } finally { this.busy--; this.arm(); }
  }

  stop() { this.fired = true; this.clear(); }

  private arm() {
    this.clear();
    if (this.fired || this.busy > 0) return;
    this.timer = setTimeout(() => { this.fired = true; this.onIdle(); }, this.ms);
  }

  private clear() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
