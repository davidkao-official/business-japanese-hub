import { useEffect } from 'react'

/**
 * Sets `document.title` for the current page. Lightweight route-level
 * affordance for assistive tech and browser UX; intentionally decoupled
 * from the router so it works in tests and any composition.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title
  }, [title])
}
