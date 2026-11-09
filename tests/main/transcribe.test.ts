import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findModel, modelUrl, transcriptPath, cachedWords, whisperArgs, parseSilences, DEFAULT_MODEL } from '../../src/main/transcribe';

const tmp = () => mkdtempSync(join(tmpdir(), 'vibe-tr-'));

describe('findModel', () => {
  it('takes a path to a model file as it is', () => {
    const d = tmp(), f = join(d, 'mine.bin');
    writeFileSync(f, 'x');
    expect(findModel(f, [])).toBe(f);
  });

  it('finds a named model in the first folder that has it', () => {
    const a = tmp(), b = tmp();
    writeFileSync(join(b, 'ggml-small.bin'), 'x');
    expect(findModel('small', [a, b])).toBe(join(b, 'ggml-small.bin'));
    expect(findModel('medium', [a, b])).toBeNull();
  });

  it('without a choice, picks the best model already on the machine', () => {
    const a = tmp(), b = tmp();
    writeFileSync(join(a, 'ggml-small.bin'), 'x');
    writeFileSync(join(b, 'ggml-large-v3.bin'), 'x');
    writeFileSync(join(b, 'ggml-medium.en.bin'), 'x');
    expect(findModel(undefined, [a, b])).toBe(join(b, 'ggml-large-v3.bin'));
  });

  it('ignores English-only models when it picks one itself, since films may be in any language', () => {
    const a = tmp();
    writeFileSync(join(a, 'ggml-medium.en.bin'), 'x');
    expect(findModel(undefined, [a, join(a, 'missing')])).toBeNull();
  });

  it('downloads only models it knows by name', () => {
    expect(modelUrl(DEFAULT_MODEL)).toBe(`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${DEFAULT_MODEL}.bin`);
    expect(modelUrl('../evil')).toBeNull();
  });
});

describe('transcript cache', () => {
  it('keeps a file\'s words next to its mattes', () => {
    expect(transcriptPath('/w/p', 'media/take.mp4')).toBe('/w/p/media/.transcript/take.mp4.json');
  });

  it('trusts the cache only for the same file, model and language', () => {
    const dir = tmp();
    mkdirSync(join(dir, 'media/.transcript'), { recursive: true });
    writeFileSync(join(dir, 'media/a.mp4'), 'footage');
    const words = [{ text: 'hi', start: 0, end: 0.5 }];
    const write = (o: object) => writeFileSync(transcriptPath(dir, 'media/a.mp4'), JSON.stringify(o));
    const st = statSync(join(dir, 'media/a.mp4'));
    write({ size: st.size, mtimeMs: st.mtimeMs, model: 'small', lang: 'auto', silences: [], words });
    expect(cachedWords(dir, 'media/a.mp4', 'small', 'auto')).toEqual(words);
    expect(cachedWords(dir, 'media/a.mp4', 'large-v3', 'auto')).toBeNull();
    expect(cachedWords(dir, 'media/a.mp4', 'small', 'ar')).toBeNull();
    utimesSync(join(dir, 'media/a.mp4'), new Date(), new Date(Date.now() + 5000));
    expect(cachedWords(dir, 'media/a.mp4', 'small', 'auto')).toBeNull();
  });

  it('keeps only well-formed words from the cache, without control characters', () => {
    const dir = tmp();
    mkdirSync(join(dir, 'media/.transcript'), { recursive: true });
    writeFileSync(join(dir, 'media/a.mp4'), 'footage');
    const st = statSync(join(dir, 'media/a.mp4'));
    const words = [{ text: 'hi\u001b[2J', start: 0, end: 0.5 }, { text: 7, start: 1, end: 2 }, { text: 'x', start: 'a', end: 2 }, { text: 'ok', start: 1, end: 1.5 }];
    writeFileSync(transcriptPath(dir, 'media/a.mp4'), JSON.stringify({ size: st.size, mtimeMs: st.mtimeMs, model: 'small', lang: 'auto', silences: [], words }));
    expect(cachedWords(dir, 'media/a.mp4', 'small', 'auto')).toEqual([{ text: 'hi[2J', start: 0, end: 0.5 }, { text: 'ok', start: 1, end: 1.5 }]);
  });

  it('has no cache for a file never transcribed', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'a.mp4'), 'x');
    expect(cachedWords(dir, 'a.mp4', 'small', 'auto')).toBeNull();
  });
});

describe('whisperArgs', () => {
  it('asks for one word per segment as JSON, in the given language', () => {
    const a = whisperArgs('/m.bin', '/t/a.wav', '/t/a', 'ar');
    expect(a).toEqual(expect.arrayContaining(['-m', '/m.bin', '-f', '/t/a.wav', '-of', '/t/a', '-l', 'ar', '-ml', '1', '-sow', '-oj', '-np', '-pp']));
  });
});

describe('parseSilences', () => {
  it('reads ffmpeg silencedetect output, closing a pause that runs to the end', () => {
    const log = [
      '[silencedetect @ 0x1] silence_start: 2.00244',
      '[silencedetect @ 0x1] silence_end: 2.402438 | silence_duration: 0.3985',
      'size=N/A time=00:00:53.06',
      '[silencedetect @ 0x1] silence_start: 52.2',
    ].join('\n');
    expect(parseSilences(log, 53.07)).toEqual([[2.002, 2.402], [52.2, 53.07]]);
  });
});
