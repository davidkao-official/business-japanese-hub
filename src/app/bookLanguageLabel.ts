/** Japanese-facing language label for book metadata. Unknown tags stay visible. */
export function bookLanguageLabel(language: string): string {
  return language.toLowerCase() === 'ja' ? '日本語' : language
}
