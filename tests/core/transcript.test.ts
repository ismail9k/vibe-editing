import { describe, it, expect } from 'vitest';
import { parseProject } from '../../src/core/model';
import { parseWhisperWords, phrases, snapToSpeech, transcriptLines, wordsOnTimeline } from '../../src/core/transcript';

const seg = (from: number, to: number, text: string) => ({ offsets: { from, to }, text });

describe('parseWhisperWords', () => {
  it('reads one word per segment in seconds, trimmed', () => {
    const words = parseWhisperWords({ transcription: [seg(50, 320, ' الاي'), seg(320, 480, ' اي')] });
    expect(words).toEqual([{ text: 'الاي', start: 0.05, end: 0.32 }, { text: 'اي', start: 0.32, end: 0.48 }]);
  });

  it('drops blanks and non-speech markers', () => {
    const words = parseWhisperWords({ transcription: [seg(0, 100, ' '), seg(100, 900, ' [BLANK_AUDIO]'), seg(900, 1000, ' (music)'), seg(1000, 1200, ' hi')] });
    expect(words.map((w) => w.text)).toEqual(['hi']);
  });

  it('glues punctuation-only segments onto the word before', () => {
    const words = parseWhisperWords({ transcription: [seg(0, 400, ' ليه'), seg(400, 500, '؟'), seg(500, 900, ' طب')] });
    expect(words).toEqual([{ text: 'ليه؟', start: 0, end: 0.5 }, { text: 'طب', start: 0.5, end: 0.9 }]);
  });

  it('returns nothing for a file that is not whisper JSON', () => {
    expect(parseWhisperWords({})).toEqual([]);
    expect(parseWhisperWords(null)).toEqual([]);
  });
});

describe('wordsOnTimeline', () => {
  const project = parseProject(JSON.stringify({
    tracks: { footage: [{ id: 'f1', src: 'media/a.mp4', in: 0, out: 2 }, { id: 'f2', src: 'media/a.mp4', in: 3, out: 5 }, { id: 'f3', src: 'media/b.mp4', in: 1, out: 2 }] },
  })).project!;
  const bySrc = {
    'media/a.mp4': [{ text: 'one', start: 0.5, end: 1 }, { text: 'gone', start: 2.2, end: 2.8 }, { text: 'two', start: 3.5, end: 4 }, { text: 'edge', start: 4.8, end: 5.4 }],
    'media/b.mp4': [{ text: 'three', start: 1.2, end: 1.5 }],
  };

  it('puts each kept word on the output timeline and drops the ones cut out', () => {
    const words = wordsOnTimeline(project, bySrc);
    expect(words.map((w) => [w.text, w.at, w.end, w.src, w.srcAt])).toEqual([
      ['one', 0.5, 1, 'media/a.mp4', 0.5],
      ['two', 2.5, 3, 'media/a.mp4', 3.5],
      ['edge', 3.8, 4, 'media/a.mp4', 4.8],
      ['three', 4.2, 4.5, 'media/b.mp4', 1.2],
    ]);
  });

  it('marks the first word of each clip, so phrases break on cuts', () => {
    expect(wordsOnTimeline(project, bySrc).map((w) => !!w.cut)).toEqual([true, true, false, true]);
  });

  it('skips clips with no transcript', () => {
    expect(wordsOnTimeline(project, { 'media/b.mp4': bySrc['media/b.mp4'] }).map((w) => w.text)).toEqual(['three']);
  });
});

describe('phrases', () => {
  const w = (text: string, at: number, end: number, cut = false) => ({ text, at, end, src: 'a', srcAt: at, srcEnd: end, ...(cut ? { cut } : {}) });

  it('breaks on pauses, sentence ends and cuts', () => {
    const lines = phrases([w('a', 0, 0.2), w('b', 0.2, 0.4), w('c', 1, 1.2), w('d?', 1.2, 1.4), w('e', 1.4, 1.6), w('f', 1.6, 1.8, true)]);
    expect(lines.map((l) => l.text)).toEqual(['a b', 'c d?', 'e', 'f']);
    expect(lines[1]).toMatchObject({ at: 1, end: 1.4 });
  });

  it('keeps a line to a readable length', () => {
    const many = Array.from({ length: 20 }, (_, i) => w(`w${i}`, i * 0.2, i * 0.2 + 0.2));
    expect(phrases(many).every((l) => l.text.split(' ').length <= 8)).toBe(true);
  });

  it('prints one timed line per phrase', () => {
    expect(transcriptLines([w('hello', 1.234, 1.5), w('there', 1.5, 2.05)])).toEqual(['1.23–2.05  hello there']);
  });
});

describe('snapToSpeech', () => {
  const sw = (text: string, start: number, end: number) => ({ text, start, end });

  it('moves words whisper put inside a pause to where the speech starts again', () => {
    // From a real take: the pause runs 2.00–2.40, but whisper hands it to the next two words.
    const words = snapToSpeech([sw('دقائق', 1.6, 2.08), sw('بس', 2.08, 2.28), sw('هل', 2.28, 2.48), sw('انت', 2.48, 2.78)], [[2.0, 2.4]]);
    expect(words[0]).toEqual(sw('دقائق', 1.6, 2.0));
    expect(words[1].start).toBeCloseTo(2.4);
    expect(words[2].start).toBeGreaterThan(words[1].start);
    expect(words[2].end).toBeLessThanOrEqual(2.78);
    expect(words[3]).toEqual(sw('انت', 2.48, 2.78));
  });

  it('trims a word that runs into a pause', () => {
    expect(snapToSpeech([sw('الفجر', 14.43, 14.88), sw('هتعرف', 14.88, 15.28)], [[14.68, 15.17]]))
      .toEqual([sw('الفجر', 14.43, 14.68), sw('هتعرف', 15.17, 15.28)]);
  });

  it('leaves words alone when there are no pauses', () => {
    const words = [sw('a', 0, 1), sw('b', 1, 2)];
    expect(snapToSpeech(words, [])).toEqual(words);
  });

  it('keeps the longer side of a word that spans a whole pause', () => {
    expect(snapToSpeech([sw('long', 1, 3)], [[2.6, 2.8]])).toEqual([sw('long', 1, 2.6)]);
    expect(snapToSpeech([sw('long', 1, 3)], [[1.1, 1.3]])).toEqual([sw('long', 1.3, 3)]);
  });
});
