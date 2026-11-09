import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseProject } from '../../src/core/model';
import { renderFrame, type Library } from '../../src/core/render';

// A stand-in 2D context: keeps a real save/restore stack for the state we check, no-ops for drawing.
function fakeCtx() {
  type St = { alpha: number; dash: number[]; fill: string };
  let st: St = { alpha: 1, dash: [], fill: '#000' };
  const stack: St[] = [];
  const log: { fills: { fill: string; x: number }[] } = { fills: [] };
  const target: Record<string, unknown> = {
    save() { stack.push({ ...st, dash: [...st.dash] }); },
    restore() { if (stack.length) st = stack.pop()!; },
    setLineDash(d: number[]) { st.dash = d; },
    getLineDash() { return st.dash; },
    measureText(s: string) { return { width: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }; },
    fillRect(x: number) { log.fills.push({ fill: st.fill, x }); },
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
    expect(errors).toEqual(['g1 (boom): kaboom']);
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
