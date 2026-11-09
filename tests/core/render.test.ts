import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseProject } from '../../src/core/model';
import { renderFrame, type Library } from '../../src/core/render';
import { boxFromAlpha } from '../../src/core/painter';

// A stand-in 2D context: keeps a real save/restore stack for the state we check, no-ops for drawing.
function fakeCtx() {
  type St = { alpha: number; dash: number[]; fill: string };
  let st: St = { alpha: 1, dash: [], fill: '#000' };
  const stack: St[] = [];
  const log: { fills: { fill: string; x: number }[]; draws: { img: unknown; args: number[] }[] } = { fills: [], draws: [] };
  const target: Record<string, unknown> = {
    save() { stack.push({ ...st, dash: [...st.dash] }); },
    restore() { if (stack.length) st = stack.pop()!; },
    setLineDash(d: number[]) { st.dash = d; },
    getLineDash() { return st.dash; },
    measureText(s: string) { return { width: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }; },
    fillRect(x: number) { log.fills.push({ fill: st.fill, x }); },
    drawImage(img: unknown, ...args: number[]) { log.draws.push({ img, args }); },
    get depth() { return stack.length; },
  };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k === 'globalAlpha') return st.alpha;
      if (k === 'fillStyle') return st.fill;
      if (k in t) return t[k as string];
      return () => {};
    },
    set(t, k, v) {
      if (k === 'globalAlpha') st.alpha = v; else if (k === 'fillStyle') st.fill = v; else t[k as string] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D & { depth: number }, state: () => st, log };
}

const brand = JSON.parse(readFileSync('presets/library/brand.json', 'utf8'));
const meta = { name: 'x', description: '', duration: 2, defaults: {}, schema: {} };
const film = (graphics: object[], captions: object[] = []) => parseProject(JSON.stringify({
  style: 'flat9k', tracks: { footage: [{ id: 'f1', src: 'media/a.mov', in: 0, out: 10 }], graphics, captions },
})).project!;

describe('renderFrame isolates a component that throws', () => {
  it('unwinds its saves and state so later graphics and frames start clean', () => {
    const seen: { alpha: number; dash: number[] }[] = [];
    const { ctx, state } = fakeCtx();
    const lib = {
      brand, styles: {},
      components: {
        boom: { id: 'boom', meta, mod: { draw: (p: { ctx: CanvasRenderingContext2D }) => {
          p.ctx.save(); p.ctx.globalAlpha = 0.1; p.ctx.setLineDash([4, 4]);
          p.ctx.save(); p.ctx.save();
          throw new Error('kaboom');
        } } },
        probe: { id: 'probe', meta, mod: { draw: (p: { ctx: CanvasRenderingContext2D }) => { seen.push({ alpha: p.ctx.globalAlpha, dash: [...p.ctx.getLineDash()] }); } } },
      },
    } as unknown as Library;
    const project = film([{ id: 'g1', type: 'boom', at: 0, dur: 5, props: {} }, { id: 'g2', type: 'probe', at: 0.5, dur: 5, props: {} }]);
    const errors = renderFrame(ctx, project, lib, 1);
    expect(errors, JSON.stringify(errors)).toEqual(["g1 (boom): kaboom"]);
    expect(seen[0]).toEqual({ alpha: 1, dash: [] });
    expect(ctx.depth).toBe(0);
    expect(state().dash).toEqual([]);
    renderFrame(ctx, project, lib, 1.5);
    expect(ctx.depth).toBe(0);
    expect(seen[1]).toEqual({ alpha: 1, dash: [] });
  });

  it('a component that restores more than it saved cannot pop the frame state', () => {
    const { ctx } = fakeCtx();
    const lib = { brand, styles: {}, components: {
      greedy: { id: 'greedy', meta, mod: { draw: (p: { ctx: CanvasRenderingContext2D }) => { p.ctx.restore(); p.ctx.restore(); } } },
    } } as unknown as Library;
    expect(renderFrame(ctx, film([{ id: 'g1', type: 'greedy', at: 0, dur: 5, props: {} }]), lib, 1)).toEqual([]);
    expect(ctx.depth).toBe(0);
  });

  it('draws the red box for a caption that fails too', () => {
    const { ctx, log } = fakeCtx();
    const lib = { brand, styles: { broken: { id: 'broken', meta: { name: 'b', description: '', params: {} }, mod: () => ({ text() { throw new Error('bad text'); }, measure() { throw new Error('bad measure'); }, fit() { throw new Error('bad fit'); } }) } }, components: {} } as unknown as Library;
    const p = parseProject(JSON.stringify({ style: 'broken', tracks: { footage: [{ id: 'f1', src: 'a.mov', in: 0, out: 9 }], captions: [{ id: 'c1', text: 'hello', at: 0, dur: 3 }] } })).project!;
    const errors = renderFrame(ctx, p, lib, 1);
    expect(errors.some((e) => e.startsWith('caption c1'))).toBe(true);
    expect(log.fills.some((f) => f.fill.startsWith('rgba(160,20,20'))).toBe(true);
  });
});

const landscape = { width: 1920, height: 1080, tag: 'frame' };
const sceneMeta = { ...meta, scene: true };
const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 2));

describe('the renderer draws the footage', () => {
  it('fills the frame with the clip (cover-fit) when no scene component is on', () => {
    const { ctx, log } = fakeCtx();
    const lib = { brand, styles: {}, components: {} } as unknown as Library;
    renderFrame(ctx, film([]), lib, 1, { frame: landscape as unknown as CanvasImageSource, matte: null });
    const d = log.draws.find((x) => x.img === landscape)!;
    near(d.args, [656.25, 0, 607.5, 1080, 0, 0, 1080, 1920]);
  });

  it('leaves the footage to a scene component while it is on screen', () => {
    const { ctx, log } = fakeCtx();
    const lib = { brand, styles: {}, components: { zoom: { id: 'zoom', meta: sceneMeta, mod: { draw: (p: { footage: (o: object) => void }) => p.footage({ zoom: 2, focus: [0.5, 0.25] }) } } } } as unknown as Library;
    renderFrame(ctx, film([{ id: 'g1', type: 'zoom', at: 0, dur: 5, props: {} }]), lib, 1, { frame: landscape as unknown as CanvasImageSource, matte: null });
    const draws = log.draws.filter((x) => x.img === landscape);
    expect(draws).toHaveLength(1); // only the component's zoomed draw, no base pass
    near(draws[0].args, [808.125, 0, 303.75, 540, 0, 0, 1080, 1920]);
  });

  it('gives scene components a stand-in subject when there is no footage at all (Studio)', () => {
    const { ctx } = fakeCtx();
    let box: { x: number; y: number; w: number; h: number; head: { x: number; y: number; r: number } } | null = null;
    const lib = { brand, styles: {}, components: { probe: { id: 'probe', meta: sceneMeta, mod: { draw: (p: { subject: () => void; subjectBox: () => typeof box }) => { p.subject(); box = p.subjectBox(); } } } } } as unknown as Library;
    const p = parseProject(JSON.stringify({ tracks: { graphics: [{ id: 'g1', type: 'probe', at: 0, dur: 3, props: {} }] } })).project!;
    expect(renderFrame(ctx, p, lib, 1)).toEqual([]);
    expect(box!.head.y).toBeLessThan(box!.y + box!.h / 2);
    expect(box!.w).toBeGreaterThan(0);
  });
});

describe('boxFromAlpha', () => {
  it('finds the subject and its head in a matte', () => {
    const w = 10, h = 20, a = new Uint8Array(w * h);
    for (let y = 4; y < 20; y++) for (let x = 2; x < 8; x++) a[y * w + x] = 255; // shoulders
    for (let y = 4; y < 8; y++) for (let x = 2; x < 8; x++) a[y * w + x] = (x >= 4 && x < 6) ? 255 : 0; // a narrow head on top
    const b = boxFromAlpha(a, w, h, 1)!;
    expect(b).toMatchObject({ x: 0.2, y: 0.2, w: 0.6, h: 0.8 });
    expect(b.head.x).toBeCloseTo(0.5, 2);
    expect(b.head.y).toBeGreaterThan(0.2);
    expect(b.head.y).toBeLessThan(0.45);
  });
  it('is null for an empty matte', () => {
    expect(boxFromAlpha(new Uint8Array(200), 10, 20, 1)).toBeNull();
  });
});
