export const CANONICAL_CAREER_GAME_ORIGIN =
  'https://business-japanese-career-game.pages.dev'

export function resolveCareerGameOrigin(environmentValue: unknown): string {
  if (typeof environmentValue !== 'string') return CANONICAL_CAREER_GAME_ORIGIN

  try {
    const candidate = new URL(environmentValue)
    const safeProtocol =
      candidate.protocol === 'https:' ||
      (candidate.protocol === 'http:' &&
        (candidate.hostname === 'localhost' || candidate.hostname === '127.0.0.1'))

    if (
      !safeProtocol ||
      candidate.username ||
      candidate.password ||
      candidate.search ||
      candidate.hash ||
      (candidate.pathname !== '/' && candidate.pathname !== '')
    ) {
      return CANONICAL_CAREER_GAME_ORIGIN
    }

    return candidate.origin
  } catch {
    return CANONICAL_CAREER_GAME_ORIGIN
  }
}

export function careerGameHomeHref(environmentValue: unknown): string {
  return `${resolveCareerGameOrigin(environmentValue)}/`
}
