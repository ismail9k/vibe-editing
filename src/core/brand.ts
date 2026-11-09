// The brand: colours, modes and fonts every style draws with. Lives in library/brand.json.
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

export const themeOf = (brand: Brand, mode: Mode): ThemeTokens => brand.modes[mode] ?? brand.modes.dark;

/** "IBM Plex Sans, IBM Plex Sans Arabic" → '"IBM Plex Sans", "IBM Plex Sans Arabic"' */
export const cssFamily = (list: string, fallback: string) =>
  list.split(',').map((f) => f.trim()).filter(Boolean).map((f) => `"${f.replace(/"/g, '')}"`).concat(fallback).join(', ');
