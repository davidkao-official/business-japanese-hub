/**
 * BookCard — the storefront's compact catalog tile.
 *
 * Deliberately NOT a universal card: cover → title → proposition → author →
 * price / owned state, with no chip wall (docs/ui-ux-research.md §4.1, §6.4).
 * The whole card links to the book detail.
 */

import { Link } from 'react-router-dom'
import type { Book } from '../content/types'
import { tierOf } from '../lib/bookAccess'
import { useStrings } from '../i18n/strings'
import { formatPrice } from '../lib/price'
import { BookCover } from './BookCover'

export interface BookCardProps {
  book: Book
  /** Server-authoritative ownership for this book (storefront-level fetch). */
  owned: boolean
  /** While ownership resolves, the price/owned meta is withheld (no wrong flash). */
  loading?: boolean
}

export function BookCard({ book, owned, loading = false }: BookCardProps) {
  const strings = useStrings()

  const metaLabel = owned
    ? strings.storefront.owned
    : tierOf(book) === 'free'
      ? strings.storefront.free
      : book.price
        ? formatPrice(book.price)
        : null

  return (
    <li className="book-card">
      <Link className="book-card__link" to={`/books/${book.slug}`}>
        <BookCover book={book} className="book-card__cover" />
        <span className="book-card__title">{book.title}</span>
        {book.subtitle && <span className="book-card__subtitle">{book.subtitle}</span>}
        {book.authors.length > 0 && (
          <span className="book-card__author">{book.authors.map((a) => a.name).join(' / ')}</span>
        )}
        {!loading && metaLabel && <span className="book-card__meta">{metaLabel}</span>}
      </Link>
    </li>
  )
}
