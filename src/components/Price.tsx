/**
 * Price — quiet display of a book's declared price (or free).
 * Ownership state is intentionally NOT shown here; that belongs to the card /
 * detail meta layers (docs/ui-ux-research.md §8.3 — no green "owned" badge).
 */

import type { Book } from '../content/types'
import { tierOf } from '../lib/bookAccess'
import { formatPrice } from '../lib/price'
import { useStrings } from '../i18n/strings'

export function Price({ book }: { book: Book }) {
  const strings = useStrings()
  const tier = tierOf(book)

  if (tier === 'free') {
    return <span className="price price--free">{strings.storefront.free}</span>
  }

  const label = book.price ? formatPrice(book.price) : null
  if (!label) return null
  return <span className="price">{label}</span>
}
