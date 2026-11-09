import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Watchdog } from '../../src/main/watchdog';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Watchdog', () => {
  it('fires once after the worker goes quiet', () => {
    const idle = vi.fn();
    new Watchdog(1000, idle);
    vi.advanceTimersByTime(999);
    expect(idle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it('starts the wait over on each sign of life', () => {
    const idle = vi.fn(), w = new Watchdog(1000, idle);
    for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(800); w.kick(); }
    expect(idle).not.toHaveBeenCalled();
  });

  it('does not count time spent on our side', async () => {
    const idle = vi.fn(), w = new Watchdog(1000, idle);
    const slow = w.hold(() => new Promise((r) => setTimeout(r, 5000)));
    await vi.advanceTimersByTimeAsync(5000);
    await slow;
    expect(idle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it('stays quiet once stopped', () => {
    const idle = vi.fn(), w = new Watchdog(1000, idle);
    w.stop();
    w.kick();
    vi.advanceTimersByTime(5000);
    expect(idle).not.toHaveBeenCalled();
  });
});
