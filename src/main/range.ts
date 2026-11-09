// HTTP Range headers for the vibe:// protocol (video seeking asks for byte ranges).

/** The inclusive byte span a `Range: bytes=…` header asks for, 'unsatisfiable' (answer 416), or null to send the
 *  whole file. Only the first range of a multi-range header is honoured. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const m = /^bytes=(\d*)-(\d*)/.exec(header?.trim() ?? '');
  if (!m || (!m[1] && !m[2])) return null;
  let start: number, end: number;
  if (!m[1]) {
    // bytes=-N is a suffix: the last N bytes.
    const n = parseInt(m[2], 10);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, size - n); end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
  }
  return start >= size || start > end ? 'unsatisfiable' : { start, end };
}
