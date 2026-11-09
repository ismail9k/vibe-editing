// Where the app looks for ffmpeg, ffprobe and whisper-cli. Opened from Finder or the Dock, macOS gives an app
// only /usr/bin:/bin:/usr/sbin:/sbin, which misses Homebrew, so the usual install folders are added after it.

export const TOOL_DIRS = ['/opt/homebrew/bin', '/usr/local/bin'];

/** `path` with any missing tool folders appended, so a folder the user put first still wins. */
export function withToolDirs(path: string | undefined, dirs = TOOL_DIRS): string {
  const parts = (path ?? '').split(':').filter(Boolean);
  for (const d of dirs) if (!parts.includes(d)) parts.push(d);
  return parts.join(':');
}
