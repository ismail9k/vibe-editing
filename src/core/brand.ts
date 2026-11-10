// A brand: colours, modes and fonts every style draws with. The workspace's own is library/brand.json; more can
// sit beside it as library/brands/<id>.json, and a film picks one with "brand" in vibe.json.
import type { Mode } from './model';

export interface ThemeTokens {
  bg: string; text: string; muted: string; primaryText: string;
  surface: string; raised: string; sunken: string; border: string; selected: string;
  success?: string; error?: string; warning?: string;
  glow: string[]; glowOpacity: number;
}
export interface Brand {
  name: string;
  colors: { primary: string; onPrimary: string; accent: string; onAccent: string; ink: string };
  modes: Record<Mode, ThemeTokens>;
  fonts: { display: string; body: string; mono: string; serif: string; arabic: string };
  rules: string;
}

/** The id of the workspace's own brand (library/brand.json). A film with no "brand" uses it. */
export const MAIN_BRAND = 'default';
/** Where a brand's file lives in the workspace. */
export const brandFile = (id: string) => (id === MAIN_BRAND ? 'library/brand.json' : `library/brands/${id}.json`);

/** The brand a film asks for, or the workspace's own when it names none (or one that isn't there). */
export const brandOf = (lib: { brand: Brand; brands?: Record<string, Brand> }, id?: string): Brand => (id && lib.brands?.[id]) || lib.brand;

/** A hand-written brand file may leave things out: whatever is missing comes from the workspace's own brand, so a
 *  brand that only changes two colours still draws. */
export function fillBrand(main: Brand, raw: Partial<Brand>, id: string): Brand {
  const part = <T extends object>(a: T, b: unknown): T => ({ ...a, ...(b && typeof b === 'object' ? (b as Partial<T>) : {}) });
  const modes = part(main.modes, raw.modes);
  for (const m of Object.keys(main.modes) as Mode[]) modes[m] = part(main.modes[m], modes[m]);
  return {
    name: typeof raw.name === 'string' && raw.name ? raw.name : id,
    colors: part(main.colors, raw.colors), modes, fonts: part(main.fonts, raw.fonts),
    rules: typeof raw.rules === 'string' ? raw.rules : main.rules,
  };
}

export const themeOf = (brand: Brand, mode: Mode): ThemeTokens => brand.modes[mode] ?? brand.modes.dark;

/** "IBM Plex Sans, IBM Plex Sans Arabic" → '"IBM Plex Sans", "IBM Plex Sans Arabic"' */
export const cssFamily = (list: string, fallback: string) =>
  list.split(',').map((f) => f.trim()).filter(Boolean).map((f) => `"${f.replace(/"/g, '')}"`).concat(fallback).join(', ');
