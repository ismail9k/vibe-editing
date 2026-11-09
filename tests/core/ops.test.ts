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
