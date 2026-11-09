// IBM Plex, bundled so frames never fall back to a system font.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-serif/400.css';
import '@fontsource/ibm-plex-serif/700.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';

const FACES = [
  '400 32px "IBM Plex Sans"', '600 32px "IBM Plex Sans"', '700 32px "IBM Plex Sans"',
  '400 32px "IBM Plex Mono"', '600 32px "IBM Plex Mono"', '400 32px "IBM Plex Serif"', '700 32px "IBM Plex Serif"',
  '400 32px "IBM Plex Sans Arabic"', '600 32px "IBM Plex Sans Arabic"', '700 32px "IBM Plex Sans Arabic"',
];

// @fontsource splits each family into unicode-range subsets, and the browser loads only the subsets the
// sample text touches. Arabic text carries Latin digits, spaces and brand words, so load both for every face.
const SAMPLE = 'Aa09 .,%$#@ عربي ٠١٢';

/** Resolves once every face the renderer uses is loaded (latin and arabic glyphs). */
export async function fontsReady() {
  await Promise.all(FACES.map((f) => document.fonts.load(f, SAMPLE)));
  await document.fonts.ready;
}
