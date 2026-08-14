/**
 * Reader settings — V1 surface (research §8.2).
 *
 * Exactly three groups for now: text size, theme, typeface. Font sizes are
 * scales applied against the fixed reader base sizes (mobile 17px / desktop
 * 18px) so the whole surface scales proportionally. Em-based measure keeps the
 * 34em target regardless of scale.
 */

export type ReaderFontSize = 'small' | 'standard' | 'large' | 'xlarge'
export type ReaderTheme = 'light' | 'sepia' | 'dark'
export type ReaderFont = 'serif' | 'sans'

export interface ReaderSettings {
  fontSize: ReaderFontSize
  theme: ReaderTheme
  font: ReaderFont
}

/** Multiplier applied to the reader body base size. */
export const FONT_SCALE: Record<ReaderFontSize, number> = {
  small: 0.95,
  standard: 1,
  large: 1.15,
  xlarge: 1.3,
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 'standard',
  theme: 'light',
  font: 'serif',
}

/** OS-level color scheme, applied as the initial theme before the user chooses. */
export function initialReaderSettings(): ReaderSettings {
  const prefersDark =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  return { ...DEFAULT_READER_SETTINGS, theme: prefersDark ? 'dark' : 'light' }
}
