// The sound effects every workspace starts with (library/sounds/*.wav), synthesised from code so they need no
// download and no licence. `npm run sounds` writes them into presets/; a test keeps the files in step with this.
// The approach (noise through moving filters, pitch-swept sines, bell partials) follows lemo-opuscar's sfx.py (MIT).

export const RATE = 48000;

/** Seeded noise, so every run writes the same files. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  };
}

const buf = (sec: number) => new Float64Array(Math.round(sec * RATE));
const noise = (sec: number, seed: number) => { const r = rng(seed), x = buf(sec); for (let i = 0; i < x.length; i++) x[i] = r(); return x; };

/** A state-variable filter whose cutoff (Hz) and resonance can move over time: f(t) is read every sample. */
function svf(x: Float64Array, mode: 'low' | 'band' | 'high', cutoff: (t: number) => number, q = 0.7) {
  const y = new Float64Array(x.length);
  let low = 0, band = 0;
  const damp = 1 / q;
  for (let i = 0; i < x.length; i++) {
    const f = 2 * Math.sin(Math.PI * Math.min(cutoff(i / RATE), RATE / 6) / RATE);
    low += f * band;
    const high = x[i] - low - damp * band;
    band += f * high;
    y[i] = mode === 'low' ? low : mode === 'band' ? band : high;
  }
  return y;
}

/** A sine whose frequency follows f(t), phase-continuous. */
function sweep(sec: number, f: (t: number) => number) {
  const y = buf(sec);
  let ph = 0;
  for (let i = 0; i < y.length; i++) { ph += (2 * Math.PI * f(i / RATE)) / RATE; y[i] = Math.sin(ph); }
  return y;
}

/** Multiplies x by env(t) in place. */
function shape(x: Float64Array, env: (t: number) => number) { for (let i = 0; i < x.length; i++) x[i] *= env(i / RATE); return x; }
const decay = (tau: number) => (t: number) => Math.exp(-t / tau);
/** Rises over `a` seconds and falls to nothing by the end. */
const swell = (a: number, len: number, curve = 2) => (t: number) => (t < a ? (t / a) ** curve : Math.max(0, 1 - (t - a) / (len - a)) ** curve);
const mix = (...xs: [Float64Array, number][]) => {
  const y = new Float64Array(Math.max(...xs.map(([x]) => x.length)));
  for (const [x, g] of xs) for (let i = 0; i < x.length; i++) y[i] += x[i] * g;
  return y;
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Soft saturation: gives a low boom the harmonics that let it through a phone speaker, which can't play 45 Hz. */
const drive = (x: Float64Array, k: number) => x.map((v) => Math.tanh(v * k) / Math.tanh(k));

/** A short fade at each end (0.5 ms in, so a click keeps its attack; 2 ms out) so nothing clicks where it starts or
 *  stops, then the peak to -3 dBFS. */
function finish(x: Float64Array) {
  const fin = Math.round(0.0005 * RATE), fout = Math.round(0.002 * RATE);
  const y = x.map((v, i) => v * Math.min(1, i / fin, (x.length - 1 - i) / fout));
  let peak = 0;
  for (const v of y) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.708 / peak : 0;
  return y.map((v) => v * g);
}

/** Every sound, by file name. Each one is short and dry, so it sits under any style. */
export const SOUNDS: Record<string, { what: string; make: () => Float64Array }> = {
  whoosh: {
    what: 'air past the camera: a graphic flying in, a slide, a zoom',
    make: () => { const d = 0.5; return shape(svf(noise(d, 1), 'band', (t) => 350 * 9 ** Math.sin(Math.PI * t / d), 2.2), swell(0.3, d)); },
  },
  swish: {
    what: 'a quick, thin whoosh: a word or card snapping in',
    make: () => { const d = 0.22; return shape(svf(noise(d, 2), 'band', (t) => lerp(1800, 7000, t / d), 1.8), swell(0.12, d)); },
  },
  riser: {
    what: 'tension building into a reveal (end it on the cut)',
    make: () => {
      const d = 1.6, up = (t: number) => (t / d) ** 2;
      const air = svf(noise(d, 3), 'band', (t) => lerp(300, 5000, up(t)), 3);
      const tone = sweep(d, (t) => lerp(180, 1400, up(t)));
      return shape(mix([air, 1], [tone, 0.25]), (t) => (t / d) ** 2.5 * Math.min(1, (d - t) / 0.03));
    },
  },
  pop: {
    what: 'a bubble or badge appearing',
    make: () => shape(sweep(0.14, (t) => 1100 * Math.exp(-t * 28) + 260), decay(0.035)),
  },
  click: {
    what: 'a button or toggle, a cursor click',
    make: () => mix([shape(svf(noise(0.04, 5), 'high', () => 2500), decay(0.004)), 1], [shape(sweep(0.04, () => 2300), decay(0.008)), 0.5]),
  },
  tick: {
    what: 'one key of typing: put one on each word or letter group as text types in',
    make: () => shape(svf(noise(0.03, 6), 'band', () => 4200, 2.5), decay(0.005)),
  },
  ding: {
    what: 'a bell: a number landing, a tick in a checklist',
    make: () => {
      const f = 1320, partials: [number, number, number][] = [[1, 1, 0.9], [2.76, 0.5, 0.45], [5.4, 0.25, 0.25], [8.93, 0.12, 0.12]];
      return mix(...partials.map(([r, g, tau]) => [shape(sweep(1.4, () => f * r), decay(tau)), g] as [Float64Array, number]));
    },
  },
  thump: {
    what: 'a soft low hit: a card landing, a stat settling',
    make: () => mix([drive(shape(sweep(0.5, (t) => 45 + 110 * Math.exp(-t * 18)), decay(0.12)), 3), 1], [shape(svf(noise(0.5, 8), 'low', () => 400), decay(0.03)), 0.4]),
  },
  hit: {
    what: 'a hard impact with a boom under it: type slamming in, a big reveal',
    make: () => {
      const d = 1;
      const boom = drive(shape(sweep(d, (t) => 38 + 140 * Math.exp(-t * 14)), decay(0.25)), 4);
      const crack = shape(svf(noise(d, 9), 'low', (t) => 200 + 7000 * Math.exp(-t * 20)), decay(0.06));
      return mix([boom, 1], [crack, 0.8]);
    },
  },
};

/** One sound as a 16-bit mono WAV file. */
export function wav(name: string): Uint8Array {
  const x = finish(SOUNDS[name].make());
  const out = new Uint8Array(44 + x.length * 2), v = new DataView(out.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), true);
  return out;
}
