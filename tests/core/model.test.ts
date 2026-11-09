import { describe, it, expect } from 'vitest';
import { parseProject, duration, footageAt, footageSpans, type Project } from '../../src/core/model';

const withClips = (clips: [number, number][]): Project => {
  const { project } = parseProject(JSON.stringify({
    tracks: { footage: clips.map(([a, b], i) => ({ id: `f${i + 1}`, src: `media/${i}.mov`, in: a, out: b })) },
  }));
  return project!;
};

describe('parseProject', () => {
  it('fills defaults for a bare project', () => {
    const { project, error } = parseProject('{"tracks":{}}');
    expect(error).toBeUndefined();
    expect(project!.format).toEqual({ w: 1080, h: 1920, fps: 30 });
    expect(project!.style).toBe('flat9k');
    expect(project!.mode).toBe('dark');
    expect(project!.dir).toBe('ltr');
    expect(project!.tracks).toEqual({ footage: [], graphics: [], captions: [], audio: [] });
  });

  it('returns an error instead of throwing on half-written JSON', () => {
    const r = parseProject('{"name":');
    expect(r.project).toBeUndefined();
    expect(r.error).toMatch(/JSON/);
  });

  it('returns an error when the top level is not an object', () => {
    expect(parseProject('[1,2]').error).toMatch(/object/);
  });
});

describe('timeline maths', () => {
  it('sums footage clips into the duration', () => {
    expect(duration(withClips([[2, 5], [0, 4]]))).toBe(7);
  });

  it('maps output time to the clip and its source time', () => {
    const hit = footageAt(withClips([[2, 5], [0, 4]]), 4)!;
    expect(hit.clip.id).toBe('f2');
    expect(hit.index).toBe(1);
    expect(hit.srcTime).toBeCloseTo(1);
  });

  it('returns null past the end of the footage', () => {
    expect(footageAt(withClips([[0, 2]]), 2.5)).toBeNull();
  });

  it('lists clip spans back to back', () => {
    expect(footageSpans(withClips([[2, 5], [0, 4]])).map((s) => [s.start, s.end])).toEqual([[0, 3], [3, 7]]);
  });

  it('uses the last graphic or caption end when there is no footage', () => {
    const { project } = parseProject(JSON.stringify({
      tracks: { graphics: [{ id: 'g1', type: 'stat', at: 2, dur: 3, props: {} }], captions: [{ id: 'c1', text: 'x', at: 6, dur: 1.5 }] },
    }));
    expect(duration(project!)).toBe(7.5);
  });

  it('never reports a duration under one second', () => {
    expect(duration(parseProject('{}').project!)).toBe(1);
  });
});

describe('parseProject reports fields it had to replace', () => {
  it('names each wrong-typed field instead of silently using the default', () => {
    const { project, coerced } = parseProject(JSON.stringify({ tracks: { footage: {}, graphics: [{ id: 'g1', type: 'stat', at: '3.2', dur: 2, props: {} }], captions: [{ id: 'c1', text: 5, at: 0, dur: 1 }] } }));
    expect(project).toBeTruthy();
    expect(coerced).toEqual(expect.arrayContaining([
      'tracks.footage should be a list',
      'tracks.graphics[0].at should be a number (got "3.2")',
      'tracks.captions[0].text should be text (got 5)',
    ]));
  });
  it('reports nothing for a clean file or for fields that are simply missing', () => {
    expect(parseProject(JSON.stringify({ tracks: { graphics: [{ id: 'g1', type: 'stat', at: 1, dur: 2, props: {} }] } })).coerced).toEqual([]);
  });
});
