import { describe, it, expect } from 'vitest';
import { parseProject, duration, type Project } from '../../src/core/model';
import * as ops from '../../src/core/ops';

const base = (): Project => parseProject(JSON.stringify({
  tracks: {
    footage: [{ id: 'f1', src: 'media/a.mov', in: 2, out: 5 }, { id: 'f2', src: 'media/b.mov', in: 0, out: 4 }],
    graphics: [{ id: 'g1', type: 'stat', at: 1, dur: 2, props: { value: '90%' } }],
  },
})).project!;

describe('footage ops', () => {
  it('splits the clip under the playhead without changing the duration', () => {
    const p = ops.splitFootage(base(), 1);
    expect(p.tracks.footage.map((c) => [c.in, c.out])).toEqual([[2, 3], [3, 5], [0, 4]]);
    expect(new Set(p.tracks.footage.map((c) => c.id)).size).toBe(3);
    expect(duration(p)).toBe(duration(base()));
  });

  it('does nothing when splitting on a clip edge', () => {
    expect(ops.splitFootage(base(), 3).tracks.footage).toHaveLength(2);
  });

  it('trims a clip start by moving its in point, clamped to keep 0.1 s', () => {
    const p = ops.trimClip(base(), 'f1', 'start', 10);
    expect(p.tracks.footage[0].in).toBeCloseTo(4.9);
  });

  it('reorders clips', () => {
    expect(ops.moveClip(base(), 'f2', 0).tracks.footage.map((c) => c.id)).toEqual(['f2', 'f1']);
  });

  it('appends a clip covering the whole source', () => {
    const p = ops.addClip(base(), 'media/c.mov', 6);
    expect(p.tracks.footage[2]).toMatchObject({ src: 'media/c.mov', in: 0, out: 6 });
  });
});

describe('item ops', () => {
  it('adds a graphic with a fresh id', () => {
    const { project, id } = ops.addGraphic(base(), 'card', 3, 2.5, { title: 'Hi' });
    expect(id).toBe('g2');
    expect(project.tracks.graphics[1]).toEqual({ id: 'g2', type: 'card', at: 3, dur: 2.5, props: { title: 'Hi' } });
  });

  it('trims the start of a graphic and keeps its end fixed', () => {
    const g = ops.trimItem(base(), 'graphics', 'g1', 'start', 2).tracks.graphics[0];
    expect(g.at).toBe(2);
    expect(g.dur).toBe(1);
  });

  it('never trims a graphic below 0.1 s', () => {
    const g = ops.trimItem(base(), 'graphics', 'g1', 'end', 0).tracks.graphics[0];
    expect(g.dur).toBeCloseTo(0.1);
  });

  it('moves a graphic but never before zero', () => {
    expect(ops.moveItem(base(), 'graphics', 'g1', -3).tracks.graphics[0].at).toBe(0);
  });

  it('updates and deletes items without touching the input', () => {
    const p0 = base();
    const p1 = ops.updateItem(p0, 'graphics', 'g1', { props: { value: '50%' } });
    expect(p1.tracks.graphics[0].props.value).toBe('50%');
    expect(p0.tracks.graphics[0].props.value).toBe('90%');
    expect(ops.deleteItem(p1, 'graphics', 'g1').tracks.graphics).toHaveLength(0);
    expect(ops.deleteItem(p1, 'footage', 'f1').tracks.footage).toHaveLength(1);
  });
});

describe('clips know how long their media is', () => {
  const start = () => ops.addClip(parseProject('{}').project!, 'media/a.mov', 20);
  it('addClip records the media length', () => {
    expect(start().tracks.footage[0]).toMatchObject({ in: 0, out: 20, srcDur: 20 });
  });
  it('trimming the end stops at the end of the media', () => {
    const p = start();
    const id = p.tracks.footage[0].id;
    const shorter = ops.trimClip(p, id, 'end', -5);
    expect(ops.trimClip(shorter, id, 'end', 9).tracks.footage[0].out).toBe(20);
  });
  it('both halves of a split keep the media length', () => {
    const halves = ops.splitFootage(start(), 8).tracks.footage;
    expect(halves.map((c) => c.srcDur)).toEqual([20, 20]);
  });
});

describe('changeComponent', () => {
  const schema = { value: { type: 'text' as const, label: 'Value' }, title: { type: 'text' as const, label: 'Title' }, count: { type: 'bool' as const, label: 'Count' } };
  const placed = () => ops.updateItem(ops.updateItem(base(), 'graphics', 'g1', { props: { value: '90%', label: 'devs', count: 'yes' } }), 'graphics', 'g1', { x: 0.3, y: 0.2, w: 0.5 });

  it('swaps the type in place, keeping the id and timing', () => {
    const g = ops.changeComponent(placed(), 'g1', 'card', { schema }).tracks.graphics[0];
    expect([g.id, g.type, g.at, g.dur]).toEqual(['g1', 'card', 1, 2]);
  });

  it('keeps only props the new component has with the right type', () => {
    expect(ops.changeComponent(placed(), 'g1', 'card', { schema }).tracks.graphics[0].props).toEqual({ value: '90%' });
  });

  it('drops the position override', () => {
    const g = ops.changeComponent(placed(), 'g1', 'card', { schema }).tracks.graphics[0];
    expect([g.x, g.y, g.w]).toEqual([undefined, undefined, undefined]);
  });

  it('leaves the project alone for the same type or an unknown id', () => {
    const p = placed();
    expect(ops.changeComponent(p, 'g1', 'stat', { schema })).toBe(p);
    expect(ops.changeComponent(p, 'nope', 'card', { schema })).toBe(p);
  });
});

describe('times the app writes', () => {
  it('are whole milliseconds, however the drag or playhead came out', () => {
    const { project, id } = ops.addGraphic(parseProject('{}').project!, 'stat', 2.8834999999999993, 2, {});
    expect(project.tracks.graphics[0].at).toBe(2.883);
    expect(ops.moveItem(project, 'graphics', id, 3.0833333333333335).tracks.graphics[0].at).toBe(3.083);
    const trimmed = ops.trimItem(project, 'graphics', id, 'end', 4.00049).tracks.graphics[0];
    expect(trimmed.dur).toBe(1.117);
  });
});

describe('duplicateItem', () => {
  const base = parseProject(JSON.stringify({ tracks: {
    footage: [{ id: 'f1', src: 'media/a.mp4', in: 1, out: 3 }, { id: 'f2', src: 'media/b.mp4', in: 0, out: 2 }],
    graphics: [{ id: 'g1', type: 'stat', at: 1, dur: 2, props: { value: '9' }, x: 0.4 }],
    captions: [{ id: 'c1', text: 'hi', at: 0.5, dur: 1 }],
    audio: [{ id: 'a1', src: 'media/pop.wav', at: 2, gain: 0.5 }],
  } })).project!;

  it('puts a copy of a graphic or caption right after the original, with its own id', () => {
    const g = ops.duplicateItem(base, 'graphics', 'g1')!;
    expect(g.id).toBe('g2');
    expect(g.project.tracks.graphics[1]).toEqual({ id: 'g2', type: 'stat', at: 3, dur: 2, props: { value: '9' }, x: 0.4 });
    const c = ops.duplicateItem(base, 'captions', 'c1')!;
    expect(c.project.tracks.captions[1]).toMatchObject({ id: 'c2', at: 1.5, dur: 1, text: 'hi' });
  });

  it('puts a copy of a clip next in the footage order', () => {
    const f = ops.duplicateItem(base, 'footage', 'f1')!;
    expect(f.project.tracks.footage.map((c) => [c.id, c.in, c.out])).toEqual([['f1', 1, 3], ['f3', 1, 3], ['f2', 0, 2]]);
  });

  it('starts a copy of a sound after the original ends', () => {
    const a = ops.duplicateItem(base, 'audio', 'a1', 0.8)!;
    expect(a.project.tracks.audio[1]).toEqual({ id: 'a2', src: 'media/pop.wav', at: 2.8, gain: 0.5 });
  });

  it('gives nothing for an item that is not there, and leaves the project alone', () => {
    expect(ops.duplicateItem(base, 'graphics', 'nope')).toBeNull();
    expect(base.tracks.graphics).toHaveLength(1);
  });
});

describe('deleting a clip', () => {
  // Three clips: 0-3, 3-5 (the one deleted), 5-9.
  const film = (): Project => parseProject(JSON.stringify({
    tracks: {
      footage: [
        { id: 'f1', src: 'media/a.mov', in: 0, out: 3 },
        { id: 'f2', src: 'media/a.mov', in: 3, out: 5 },
        { id: 'f3', src: 'media/a.mov', in: 5, out: 9 },
      ],
      graphics: [
        { id: 'before', type: 'stat', at: 1, dur: 1.5, props: {} },
        { id: 'inside', type: 'stat', at: 3.2, dur: 1, props: {} },
        { id: 'across', type: 'stat', at: 2, dur: 5, props: {} },
        { id: 'tail', type: 'stat', at: 4, dur: 3, props: {} },
        { id: 'after', type: 'stat', at: 6, dur: 2, props: {} },
      ],
      captions: [{ id: 'c1', text: 'gone', at: 3, dur: 2 }, { id: 'c2', text: 'kept', at: 5, dur: 1 }],
      audio: [{ id: 'bed', src: 'media/bed.wav', at: 0 }, { id: 'in', src: 'media/hit.wav', at: 4 }, { id: 'hit', src: 'media/hit.wav', at: 5.5 }],
    },
  })).project!;
  const times = (list: { id: string; at: number; dur?: number }[]) => Object.fromEntries(list.map((x) => [x.id, x.dur === undefined ? x.at : [x.at, x.dur]]));

  it('pulls everything after it back by its length, so it stays on the same footage', () => {
    const p = ops.deleteItem(film(), 'footage', 'f2');
    expect(times(p.tracks.graphics)).toEqual({ before: [1, 1.5], across: [2, 3], tail: [3, 2], after: [4, 2] });
    expect(times(p.tracks.captions)).toEqual({ c2: [3, 1] });
    expect(times(p.tracks.audio)).toEqual({ bed: 0, in: 3, hit: 3.5 });
    expect(duration(p)).toBe(7);
  });

  it('leaves the other tracks alone when the item deleted is not a clip', () => {
    const p = ops.deleteItem(film(), 'captions', 'c1');
    expect(p.tracks.graphics).toEqual(film().tracks.graphics);
    expect(p.tracks.audio).toEqual(film().tracks.audio);
  });

  it('keeps a sound that starts with the first clip', () => {
    expect(ops.deleteItem(film(), 'footage', 'f1').tracks.audio.map((a) => [a.id, a.at])).toEqual([['bed', 0], ['in', 1], ['hit', 2.5]]);
  });
});

describe('trimming a clip', () => {
  // Two clips, 0-4 and 4-8, each from the middle of a 10 s file so both edges can go either way.
  const film = (): Project => parseProject(JSON.stringify({
    tracks: {
      footage: [
        { id: 'f1', src: 'media/a.mov', in: 2, out: 6, srcDur: 10 },
        { id: 'f2', src: 'media/a.mov', in: 2, out: 6, srcDur: 10 },
      ],
      graphics: [
        { id: 'early', type: 'stat', at: 0.5, dur: 1, props: {} },
        { id: 'late', type: 'stat', at: 3.2, dur: 0.6, props: {} },
        { id: 'across', type: 'stat', at: 2, dur: 4, props: {} },
        { id: 'next', type: 'stat', at: 4, dur: 2, props: {} },
      ],
      captions: [{ id: 'c1', text: 'one', at: 3, dur: 1 }, { id: 'c2', text: 'two', at: 5, dur: 1 }],
      audio: [{ id: 'bed', src: 'media/bed.wav', at: 0 }, { id: 'hit', src: 'media/hit.wav', at: 4 }],
    },
  })).project!;
  const times = (p: Project) => Object.fromEntries([...p.tracks.graphics, ...p.tracks.captions, ...p.tracks.audio]
    .map((x) => [x.id, 'dur' in x ? [x.at, x.dur] : x.at]));

  it('pulls later items back when the end is trimmed off', () => {
    expect(times(ops.trimClip(film(), 'f1', 'end', -1))).toEqual({
      early: [0.5, 1], across: [2, 3], next: [3, 2], c2: [4, 1], bed: 0, hit: 3,
    });
  });

  it('pushes later items on when the end is drawn out', () => {
    expect(times(ops.trimClip(film(), 'f1', 'end', 1))).toEqual({
      early: [0.5, 1], late: [3.2, 0.6], across: [2, 5], next: [5, 2], c1: [3, 1], c2: [6, 1], bed: 0, hit: 5,
    });
  });

  it('keeps items on their footage when the start is trimmed off', () => {
    expect(times(ops.trimClip(film(), 'f1', 'start', 1))).toEqual({
      early: [0, 0.5], late: [2.2, 0.6], across: [1, 4], next: [3, 2], c1: [2, 1], c2: [4, 1], bed: 0, hit: 3,
    });
  });

  it('keeps items on their footage when the start is drawn out', () => {
    expect(times(ops.trimClip(film(), 'f2', 'start', -1))).toEqual({
      early: [0.5, 1], late: [3.2, 0.6], across: [2, 5], next: [5, 2], c1: [3, 1], c2: [6, 1], bed: 0, hit: 5,
    });
  });

  it('moves nothing when the trim is stopped by the end of the media', () => {
    const full = ops.trimClip(film(), 'f1', 'end', 4);
    expect(times(ops.trimClip(full, 'f1', 'end', 3))).toEqual(times(full));
  });
});
