// The little markdown Claude writes in the panel: paragraphs, headings, lists, quotes, fenced code, and inline code,
// bold, italics and links. Parsed into plain data so the panel renders it as React elements, never as raw HTML.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'bold'; v: Inline[] }
  | { t: 'em'; v: Inline[] }
  | { t: 'link'; v: string; href: string }
  | { t: 'br' };

export type Block =
  | { t: 'p'; v: Inline[] }
  | { t: 'h'; level: number; v: Inline[] }
  | { t: 'quote'; v: Inline[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'list'; ordered: boolean; items: Inline[][] };

const FENCE = /^```\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) out.push({ t: 'p', v: lines2inline(para) }); para = []; };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      while (++i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i]);
      out.push({ t: 'code', lang: fence[1], v: body.join('\n') }); // an unclosed fence is still streaming in
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    const h = HEADING.exec(line);
    if (h) { flush(); out.push({ t: 'h', level: h[1].length, v: parseInline(h[2]) }); continue; }
    const q = QUOTE.exec(line);
    if (q) { flush(); out.push({ t: 'quote', v: parseInline(q[1]) }); continue; }
    const b = BULLET.exec(line), n = b ? null : NUMBERED.exec(line);
    if (b || n) {
      flush();
      const ordered = !!n, item = parseInline((b ?? n)![1]), last = out.at(-1);
      if (last?.t === 'list' && last.ordered === ordered) last.items.push(item);
      else out.push({ t: 'list', ordered, items: [item] });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

function lines2inline(lines: string[]): Inline[] {
  return lines.flatMap((l, i) => (i ? [{ t: 'br' } as Inline, ...parseInline(l)] : parseInline(l)));
}

// `code`, **bold**, *italics* (not inside words or sums: 2*3*4), [text](url). Underscores are left alone,
// since Claude writes file and field names with them.
const INLINE = /`([^`]+)`|\*\*(?!\s)(.+?)(?<!\s)\*\*|(?<![\w*])\*(?![\s*])([^*]+?)(?<!\s)\*(?![\w*])|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let at = 0;
  const text = (v: string) => { if (!v) return; const last = out.at(-1); if (last?.t === 'text') last.v += v; else out.push({ t: 'text', v }); };
  for (const m of src.matchAll(INLINE)) {
    text(src.slice(at, m.index));
    if (m[1] !== undefined) out.push({ t: 'code', v: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'bold', v: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ t: 'em', v: parseInline(m[3]) });
    else out.push({ t: 'link', v: m[4], href: m[5] });
    at = m.index! + m[0].length;
  }
  text(src.slice(at));
  return out;
}
