/** Japanese-facing language label for book metadata. Unknown tags stay visible. */
export function bookLanguageLabel(language: string): string {
  return /^ja(?:-|$)/i.test(language) ? '日本語' : language
}
