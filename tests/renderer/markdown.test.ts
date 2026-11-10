import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from '../../src/renderer/ui/markdown';

describe('parseMarkdown', () => {
  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    expect(parseMarkdown('One\ntwo\n\nThree')).toEqual([
      { t: 'p', v: [{ t: 'text', v: 'One' }, { t: 'br' }, { t: 'text', v: 'two' }] },
      { t: 'p', v: [{ t: 'text', v: 'Three' }] },
    ]);
  });

  it('reads bullet and numbered lists', () => {
    expect(parseMarkdown('- a\n* b\n\n1. c\n2. d')).toEqual([
      { t: 'list', ordered: false, items: [[{ t: 'text', v: 'a' }], [{ t: 'text', v: 'b' }]] },
      { t: 'list', ordered: true, items: [[{ t: 'text', v: 'c' }], [{ t: 'text', v: 'd' }]] },
    ]);
  });

  it('keeps fenced code as it is, even while the fence is still streaming in', () => {
    expect(parseMarkdown('```json\n{ "a": 1 }\n```\nafter')).toEqual([
      { t: 'code', lang: 'json', v: '{ "a": 1 }' },
      { t: 'p', v: [{ t: 'text', v: 'after' }] },
    ]);
    expect(parseMarkdown('```js\nconst x')).toEqual([{ t: 'code', lang: 'js', v: 'const x' }]);
  });

  it('reads headings and quotes', () => {
    expect(parseMarkdown('## What changed\n> careful')).toEqual([
      { t: 'h', level: 2, v: [{ t: 'text', v: 'What changed' }] },
      { t: 'quote', v: [{ t: 'text', v: 'careful' }] },
    ]);
  });
});

describe('parseInline', () => {
  it('reads code, bold, italics and links', () => {
    expect(parseInline('Run `vibe check` **now**, *please*, see [docs](https://x.y)')).toEqual([
      { t: 'text', v: 'Run ' }, { t: 'code', v: 'vibe check' }, { t: 'text', v: ' ' },
      { t: 'bold', v: [{ t: 'text', v: 'now' }] }, { t: 'text', v: ', ' },
      { t: 'em', v: [{ t: 'text', v: 'please' }] }, { t: 'text', v: ', see ' },
      { t: 'link', v: 'docs', href: 'https://x.y' },
    ]);
  });

  it('leaves underscores and stray asterisks in names and sums alone', () => {
    expect(parseInline('chat_events_test and 2*3*4')).toEqual([{ t: 'text', v: 'chat_events_test and 2*3*4' }]);
  });

  it('shows an unfinished bold as typed', () => {
    expect(parseInline('**half')).toEqual([{ t: 'text', v: '**half' }]);
  });
});
