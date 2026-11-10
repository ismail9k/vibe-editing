// Dragging on the timeline snaps an item's edges onto other items, cuts and the playhead.
import { describe, it, expect } from 'vitest';
import { parseProject, type Project } from '../../src/core/model';
import { snapDelta, snapTargets } from '../../src/core/snap';

const base = (): Project => parseProject(JSON.stringify({
  tracks: {
    footage: [{ id: 'f1', src: 'media/a.mov', in: 0, out: 3 }, { id: 'f2', src: 'media/a.mov', in: 5, out: 9 }],
    graphics: [{ id: 'g1', type: 'stat', at: 1, dur: 2, props: {} }, { id: 'g2', type: 'card', at: 4.5, dur: 1, props: {} }],
    captions: [{ id: 'c1', text: 'hi', at: 0.5, dur: 1.2 }],
    audio: [{ id: 'a1', src: 'media/click.wav', at: 6 }],
  },
})).project!;

describe('snapTargets', () => {
  it('collects the other items, the cuts, zero and the playhead', () => {
    expect(snapTargets(base(), { track: 'graphics', id: 'g1' }, [2.25])).toEqual([0, 0.5, 1.7, 2.25, 3, 4.5, 5.5, 6, 7]);
  });

  it('leaves out the dragged item itself', () => {
    const t = snapTargets(base(), { track: 'captions', id: 'c1' });
    expect(t).not.toContain(0.5);
    expect(t).not.toContain(1.7);
    expect(t).toContain(1);
  });

  it('leaves out the cuts that move with a trimmed clip', () => {
    const t = snapTargets(base(), { track: 'footage', id: 'f2' });
    expect(t).toContain(3);
    expect(t).not.toContain(7);
  });
});

describe('snapDelta', () => {
  const targets = [0, 2, 5];

  it('pulls a near edge onto the target', () => {
    expect(snapDelta([1], 0.9, targets, 0.2)).toEqual({ dt: 1, at: 2 });
  });

  it('snaps whichever edge of a block lands closer', () => {
    // A block 1..3 moved by 1.95: start lands on 2.95, end on 4.95; the end is 0.05 from 5.
    const r = snapDelta([1, 3], 1.95, targets, 0.2);
    expect(r.at).toBe(5);
    expect(r.dt).toBeCloseTo(2);
  });

  it('leaves the drag alone when nothing is close', () => {
    expect(snapDelta([1], 0.5, targets, 0.2)).toEqual({ dt: 0.5, at: null });
  });

  it('does nothing without points to snap', () => {
    expect(snapDelta([], 1.98, targets, 0.2)).toEqual({ dt: 1.98, at: null });
  });
});
