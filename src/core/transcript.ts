// Transcripts: whisper's word timings for a footage file (source seconds), carried through the cuts onto the
// output timeline, and grouped into short timed lines that read like captions.
import { footageSpans, type Project } from './model';

/** A spoken word in its footage file, in source seconds. */
export interface SourceWord { text: string; start: number; end: number }
/** A word on the output timeline. `cut` marks the first word heard after a cut. */
export interface TimelineWord { text: string; at: number; end: number; src: string; srcAt: number; srcEnd: number; cut?: boolean }
export interface Phrase { text: string; at: number; end: number }

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const PUNCT_ONLY = /^[\p{P}\s]+$/u;
const NON_SPEECH = /^[[(].*[\])]$/;

/** Words from whisper-cli's `-oj` output run with `-ml 1 -sow` (one word per segment). Never throws. */
export function parseWhisperWords(json: unknown): SourceWord[] {
  const segs = (json as { transcription?: unknown } | null)?.transcription;
  if (!Array.isArray(segs)) return [];
  const words: SourceWord[] = [];
  for (const s of segs) {
    const text = typeof s?.text === 'string' ? s.text.trim() : '';
    const from = Number(s?.offsets?.from), to = Number(s?.offsets?.to);
    if (!text || NON_SPEECH.test(text) || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    const prev = words[words.length - 1];
    // Whisper sometimes gives a question mark or a comma a segment of its own: it belongs to the word before.
    if (PUNCT_ONLY.test(text)) { if (prev) { prev.text += text; prev.end = r3(to / 1000); } continue; }
    words.push({ text, start: r3(from / 1000), end: r3(to / 1000) });
  }
  return words;
}

/** Whisper's word times butt up against each other, so a pause is handed to the words around it, and a word
 *  can sit early by the length of the pause before it. Measured pauses (source seconds, from the audio itself)
 *  put that right: a word running into a pause ends where it starts, and the words whisper put inside a pause
 *  are moved to where the speech starts again, keeping their share of the time. */
export function snapToSpeech(words: SourceWord[], silences: [number, number][]): SourceWord[] {
  const out = words.map((w) => ({ ...w }));
  for (const [a, b] of silences) {
    const late: SourceWord[] = [];
    for (const w of out) {
      if (w.start >= a && w.start < b) late.push(w);
      else if (w.start < a && w.end > a) {
        if (w.end <= b || a - w.start >= w.end - b) w.end = a;
        else w.start = b;
      }
    }
    if (!late.length) continue;
    const from = b, to = Math.max(Math.max(...late.map((w) => w.end)), b + 0.08 * late.length);
    const total = late.reduce((s, w) => s + Math.max(0.01, w.end - w.start), 0);
    let t = from;
    for (const w of late) {
      const len = ((to - from) * Math.max(0.01, w.end - w.start)) / total;
      w.start = r3(t); t += len; w.end = r3(t);
    }
  }
  return out;
}

/** Every word the cut keeps, on the output timeline. A word belongs to a clip when it starts inside it, or
 *  when most of it is inside; its times are clamped to the clip. Clips with no transcript are skipped. */
export function wordsOnTimeline(p: Project, bySrc: Record<string, SourceWord[]>): TimelineWord[] {
  const out: TimelineWord[] = [];
  for (const { clip, start } of footageSpans(p)) {
    let first = true;
    for (const w of bySrc[clip.src] ?? []) {
      const mid = (w.start + w.end) / 2;
      const inside = (v: number) => v >= clip.in && v < clip.out;
      if (!inside(w.start) && !inside(mid)) continue;
      const s = Math.max(w.start, clip.in), e = Math.min(w.end, clip.out);
      out.push({ text: w.text, at: r3(start + s - clip.in), end: r3(start + e - clip.in), src: clip.src, srcAt: w.start, srcEnd: w.end, ...(first ? { cut: true } : {}) });
      first = false;
    }
  }
  return out;
}

const PAUSE = 0.3, MAX_WORDS = 8;
const SENTENCE_END = /[.?!؟…]$/;

/** Short lines of speech: a new line after a pause, a sentence end, a cut, or eight words. */
export function phrases(words: TimelineWord[]): Phrase[] {
  const lines: Phrase[] = [];
  let cur: TimelineWord[] = [];
  const flush = () => {
    if (cur.length) lines.push({ text: cur.map((w) => w.text).join(' '), at: cur[0].at, end: cur[cur.length - 1].end });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    if (prev && (w.cut || w.at - prev.end >= PAUSE || SENTENCE_END.test(prev.text) || cur.length >= MAX_WORDS)) flush();
    cur.push(w);
  }
  flush();
  return lines;
}

export function transcriptLines(words: TimelineWord[]): string[] {
  return phrases(words).map((l) => `${l.at.toFixed(2)}–${l.end.toFixed(2)}  ${l.text}`);
}
