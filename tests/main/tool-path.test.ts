import { describe, expect, it } from 'vitest';
import { withToolDirs } from '../../src/main/tool-path';

describe('withToolDirs', () => {
  it('adds Homebrew to the bare PATH a Finder-launched app gets', () => {
    expect(withToolDirs('/usr/bin:/bin:/usr/sbin:/sbin')).toBe('/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin');
  });

  it('keeps the order of folders already there', () => {
    expect(withToolDirs('/usr/local/bin:/my/ffmpeg:/opt/homebrew/bin')).toBe('/usr/local/bin:/my/ffmpeg:/opt/homebrew/bin');
  });

  it('copes with no PATH at all', () => {
    expect(withToolDirs(undefined)).toBe('/opt/homebrew/bin:/usr/local/bin');
  });
});
