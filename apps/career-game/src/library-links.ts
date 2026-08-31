import type { LibraryLink } from '@business-japanese-hub/career-game'

export const CANONICAL_LIBRARY_ORIGIN = 'https://business-japanese-hub.pages.dev'

export function resolveLibraryOrigin(environmentValue: unknown): string {
  if (typeof environmentValue !== 'string') return CANONICAL_LIBRARY_ORIGIN

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
      return CANONICAL_LIBRARY_ORIGIN
    }

    return candidate.origin
  } catch {
    return CANONICAL_LIBRARY_ORIGIN
  }
}

export function libraryHomeHref(environmentValue: unknown): string {
  return `${resolveLibraryOrigin(environmentValue)}/`
}

export function libraryLinkHref(link: LibraryLink, environmentValue: unknown): string {
  const parameters = new URLSearchParams({ bookId: link.bookId })
  if (link.chapterId) parameters.set('chapterId', link.chapterId)
  if (link.blockId) parameters.set('blockId', link.blockId)
  return `${resolveLibraryOrigin(environmentValue)}/library-link?${parameters}`
}
