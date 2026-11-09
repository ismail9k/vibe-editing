import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject } from '../../src/core/model';
import { matteSize, matteDecodeArgs, matteEncodeArgs, usesMatte, wantsMatte, missingMattes, runChain, helper, matteReady, stampMatte, partialPath } from '../../src/main/matte';

describe('matteSize', () => {
  it('keeps the long side at 960 and even sides', () => {
    expect(matteSize(3840, 2160, 0)).toEqual([960, 540]);
    expect(matteSize(1080, 1920, 0)).toEqual([540, 960]);
    expect(matteSize(1001, 777, 0)).toEqual([960, 746]);
  });
  it('swaps sides for footage shot sideways, since ffmpeg turns frames upright', () => {
    expect(matteSize(3840, 2160, -90)).toEqual([540, 960]);
    expect(matteSize(3840, 2160, 270)).toEqual([540, 960]);
    expect(matteSize(3840, 2160, -180)).toEqual([960, 540]);
  });
  it('never upscales small footage', () => {
    expect(matteSize(640, 360, 0)).toEqual([640, 360]);
  });
});

describe('matte ffmpeg args', () => {
  it('decodes the whole file to BGRA at 30 fps, tone-mapping HDR', () => {
    const a = matteDecodeArgs('/p/media/a.mov', 960, 540, true);
    expect(a).toContain('/p/media/a.mov');
    expect(a).not.toContain('-ss');
    const vf = a[a.indexOf('-vf') + 1];
    expect(vf).toContain('tonemap=tonemap=reinhard');
    expect(vf).toMatch(/fps=30,format=bgra$/);
    expect(a.slice(-5)).toEqual(['-f', 'rawvideo', '-pix_fmt', 'bgra', 'pipe:1']);
  });
  it('encodes grey frames from stdin to H.264', () => {
    const a = matteEncodeArgs(960, 540, '/p/media/.matte/a.mov.matte.partial.mp4');
    expect(a.join(' ')).toContain('-f rawvideo -pix_fmt gray -s 960x540 -r 30 -i pipe:0');
    expect(a).toContain('libx264');
    expect(a.at(-1)).toBe('/p/media/.matte/a.mov.matte.partial.mp4');
  });
});

describe('which projects need mattes', () => {
  const p = parseProject(JSON.stringify({ tracks: {
    footage: [{ id: 'f1', src: 'media/a.mov', in: 0, out: 2 }, { id: 'f2', src: 'media/a.mov', in: 4, out: 6 }, { id: 'f3', src: 'media/b.mov', in: 0, out: 1 }],
    graphics: [{ id: 'g1', type: 'orbit', at: 0, dur: 1 }],
  } })).project!;
  it('needs them when a graphic is a matte component', () => {
    expect(usesMatte(p, { orbit: { matte: true } })).toBe(true);
    expect(usesMatte(p, { orbit: {} })).toBe(false);
    expect(usesMatte(p, {})).toBe(false);
  });
  it('lists each source without a ready matte once', () => {
    expect(missingMattes(p, (src) => src === 'media/b.mov')).toEqual(['media/a.mov']);
  });
  it('wants mattes for components that aim at the speaker, without needing them', () => {
    expect(wantsMatte(p, { orbit: { aims: true } })).toBe(true);
    expect(wantsMatte(p, { orbit: { matte: true } })).toBe(true);
    expect(wantsMatte(p, { orbit: {} })).toBe(false);
    expect(usesMatte(p, { orbit: { aims: true } })).toBe(false);
  });
});

describe('runChain', () => {
  const node = (code: string) => spawn(process.execPath, ['-e', code], { stdio: ['pipe', 'pipe', 'pipe'] });

  it('stops the whole chain and names the step when one step dies, instead of waiting on a full pipe', async () => {
    const forever = node("const b = Buffer.alloc(1 << 16); (function w() { while (process.stdout.write(b)); process.stdout.once('drain', w); })()");
    const middle = node('process.stdin.pipe(process.stdout)');
    const dies = node("process.stderr.write('disk full\\n'); process.exit(3)");
    const t0 = Date.now();
    await expect(runChain([forever, middle, dies], ['decode', 'cut', 'encode'])).rejects.toThrow(/encode.*disk full/);
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(forever.exitCode !== null || forever.signalCode !== null).toBe(true);
  }, 8000);

  it('resolves when every step finishes cleanly', async () => {
    const a = node("process.stdout.write('x'.repeat(100000))");
    const b = node('process.stdin.pipe(process.stdout)');
    const c = node("let n = 0; process.stdin.on('data', (d) => n += d.length); process.stdin.on('end', () => process.exit(n === 100000 ? 0 : 1))");
    await expect(runChain([a, b, c], ['a', 'b', 'c'])).resolves.toBeUndefined();
  });
});

describe.skipIf(process.platform !== 'darwin')('helper', () => {
  const setup = () => {
    const appDir = mkdtempSync(join(tmpdir(), 'vibe-app-')), binDir = join(appDir, 'bin');
    mkdirSync(join(appDir, 'native')); mkdirSync(binDir);
    writeFileSync(join(appDir, 'native', 'vibe-matte.swift'), `// ${Math.random()}`);
    return { appDir, binDir };
  };
  const slowCompile = (calls: string[]) => async (_src: string, out: string) => {
    calls.push(out); await new Promise((r) => setTimeout(r, 50)); writeFileSync(out, 'bin');
  };

  it('builds once when two runs ask for it at the same time', async () => {
    const tools = setup(), calls: string[] = [];
    const [a, b] = await Promise.all([helper(tools, slowCompile(calls)), helper(tools, slowCompile(calls))]);
    expect(a).toBe(b);
    expect(existsSync(a)).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('clears old builds but leaves another run\'s build in progress alone', async () => {
    const tools = setup();
    writeFileSync(join(tools.binDir, 'vibe-matte-deadbeef'), 'old');
    writeFileSync(join(tools.binDir, 'vibe-matte-cafebabe.999.1a2b.tmp'), 'building');
    const bin = await helper(tools, slowCompile([]));
    expect(readdirSync(tools.binDir).sort()).toEqual([bin.split('/').pop(), 'vibe-matte-cafebabe.999.1a2b.tmp'].sort());
  });

  it('builds into a temp name of its own', async () => {
    const tools = setup(), calls: string[] = [];
    await helper(tools, slowCompile(calls));
    expect(calls[0]).toMatch(/vibe-matte-[0-9a-f]{8}\.\d+\.[0-9a-f]{8}\.tmp$/);
  });
});

describe('matte freshness', () => {
  const project = () => {
    const dir = mkdtempSync(join(tmpdir(), 'vibe-proj-'));
    mkdirSync(join(dir, 'media', '.matte'), { recursive: true });
    writeFileSync(join(dir, 'media', 'a.mov'), 'footage');
    return dir;
  };

  it('trusts a matte only once it is stamped with the footage it was cut from', () => {
    const dir = project();
    expect(matteReady(dir, 'media/a.mov')).toBe(false);
    writeFileSync(join(dir, 'media/.matte/a.mov.matte.mp4'), 'matte');
    expect(matteReady(dir, 'media/a.mov')).toBe(false); // left by a run that died, or an older build
    stampMatte(dir, 'media/a.mov');
    expect(matteReady(dir, 'media/a.mov')).toBe(true);
  });

  it('re-cuts when the footage file is replaced', () => {
    const dir = project();
    writeFileSync(join(dir, 'media/.matte/a.mov.matte.mp4'), 'matte');
    stampMatte(dir, 'media/a.mov');
    writeFileSync(join(dir, 'media', 'a.mov'), 'a different take');
    utimesSync(join(dir, 'media', 'a.mov'), new Date(), new Date(Date.now() + 5000));
    expect(matteReady(dir, 'media/a.mov')).toBe(false);
  });

  it('gives every run its own partial file, so two runs never write into one', () => {
    const out = '/p/media/.matte/a.mov.matte.mp4';
    expect(partialPath(out)).not.toBe(partialPath(out));
    expect(partialPath(out)).toMatch(/^\/p\/media\/\.matte\/a\.mov\.matte\.\d+\.[0-9a-f]{8}\.partial\.mp4$/);
  });
});
