// Reads and writes from the app window. It remembers the text it last read or wrote per file, and writes
// only if the file still holds that text, so the app never overwrites an edit Claude made in between.
const known = new Map<string, string | null>();

export async function readDisk(rel: string): Promise<string | null> {
  const text = await window.vibe.read(rel);
  known.set(rel, text);
  return text;
}

/** The text this window last read or wrote for `rel` (undefined if it never has). */
export const lastSeen = (rel: string) => known.get(rel);

/** False when the file changed on disk since this window last saw it: nothing was written. */
export async function writeDisk(rel: string, text: string): Promise<boolean> {
  const r = await window.vibe.write(rel, text, known.get(rel));
  if (r.ok) known.set(rel, text); // on a refusal, keep the old text: the reload that follows must see a change
  return r.ok;
}
