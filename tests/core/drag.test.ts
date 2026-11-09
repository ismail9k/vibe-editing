import { describe, it, expect } from 'vitest';
import { alphaBounds, drawnNear, inside, moved, resized } from '../../src/core/drag';

// A W x H RGBA image with an opaque rectangle.
function image(W: number, H: number, r?: { x: number; y: number; w: number; h: number }) {
  const data = new Uint8ClampedArray(W * H * 4);
  if (r) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) data[(y * W + x) * 4 + 3] = 255;
  return data;
}

describe('alphaBounds', () => {
  it('boxes the drawn pixels', () => {
    expect(alphaBounds(image(100, 80, { x: 10, y: 20, w: 30, h: 10 }), 100, 80, 1)).toEqual({ x: 10, y: 20, w: 30, h: 10 });
  });
  it('covers the drawing when sampling every other pixel', () => {
    const b = alphaBounds(image(100, 80, { x: 10, y: 20, w: 31, h: 11 }), 100, 80, 2)!;
    expect(b.x).toBe(10); expect(b.y).toBe(20);
    expect(b.x + b.w).toBeGreaterThanOrEqual(41); expect(b.y + b.h).toBeGreaterThanOrEqual(31);
  });
  it('is null for an empty image', () => {
    expect(alphaBounds(image(20, 20), 20, 20)).toBeNull();
  });
});

describe('drawnNear', () => {
  const img = image(100, 100, { x: 50, y: 50, w: 1, h: 1 });
  it('finds a thin stroke within the radius', () => {
    expect(drawnNear(img, 100, 100, 53, 50, 4)).toBe(true);
    expect(drawnNear(img, 100, 100, 60, 50, 4)).toBe(false);
  });
  it('stays inside the image near its edges', () => {
    expect(drawnNear(img, 100, 100, 0, 0, 6)).toBe(false);
    expect(drawnNear(img, 100, 100, 99, 99, 6)).toBe(false);
  });
});

describe('inside', () => {
  it('counts the padding', () => {
    const b = { x: 10, y: 10, w: 10, h: 10 };
    expect(inside(b, 15, 15)).toBe(true);
    expect(inside(b, 22, 15)).toBe(false);
    expect(inside(b, 22, 15, 3)).toBe(true);
  });
});

describe('moved', () => {
  const W = 1000, H = 2000;
  const start = { x: 0.3, y: 0.2, w: 0.4 };
  const box = { x: 100, y: 400, w: 400, h: 100 };
  it('moves by the pointer delta in frame fractions', () => {
    expect(moved(start, box, 100, -200, W, H).pos).toEqual({ x: 0.4, y: 0.1, w: 0.4 });
  });
  it('snaps the drawing centre to the frame centre lines and reports the guides', () => {
    // centre x = 300 + 195 = 495, within 15 px of 500; centre y = 450 + 540 = 990, within 30 px of 1000
    const r = moved(start, box, 195, 540, W, H);
    expect(r.guides).toEqual({ v: true, h: true });
    expect(r.pos.x).toBeCloseTo(0.5); expect(r.pos.y).toBeCloseTo(0.475);
  });
  it('does not snap when free', () => {
    const r = moved(start, box, 195, 540, W, H, true);
    expect(r.guides).toEqual({ v: false, h: false });
    expect(r.pos.x).toBeCloseTo(0.495);
  });
});

describe('resized', () => {
  const W = 1000;
  const start = { x: 0.5, y: 0.2, w: 0.4 };
  const box = { x: 300, y: 400, w: 400, h: 100 }; // the drawing fills its 400 px place box
  it('dragging the right side keeps the left side put', () => {
    const p = resized(start, box, 'right', 200, W);
    expect(p.w).toBeCloseTo(0.6); expect(p.x).toBeCloseTo(0.6); expect(p.y).toBe(0.2);
    expect(p.x * W - (p.w * W) / 2).toBeCloseTo(300);
  });
  it('dragging the left side keeps the right side put', () => {
    const p = resized(start, box, 'left', 100, W);
    expect(p.w).toBeCloseTo(0.3);
    expect(p.x * W + (p.w * W) / 2).toBeCloseTo(700);
  });
  it('scales a drawing narrower than its place box about the place centre', () => {
    // drawn 200 px wide in the middle of a 400 px box: doubling the drawing doubles w
    const p = resized(start, { x: 400, y: 400, w: 200, h: 100 }, 'right', 200, W);
    expect(p.w).toBeCloseTo(0.8);
    expect(p.x * W - 200 * 2 / 2).toBeCloseTo(400); // drawn left edge (centre - 100 * k) stays at 400
  });
  it('never goes narrower than the minimum', () => {
    expect(resized(start, box, 'right', -1000, W).w).toBeCloseTo(0.4 * 40 / 400);
  });
});
