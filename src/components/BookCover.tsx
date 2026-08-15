/**
 * BookCover — cover art with the book's original aspect ratio.
 *
 * The cover's `width` / `height` (from the book's own metadata) set the aspect
 * ratio so layout does not shift while the image loads; the image is never
 * cropped (docs/ui-ux-research.md §5: preserve the original ratio, contain
 * only). Covers are the one surface allowed an object shadow (§6.2).
 */

import type { Book } from '../content/types'

export interface BookCoverProps {
  book: Book
  className?: string
}

export function BookCover({ book, className = '' }: BookCoverProps) {
  const cover = book.cover
  if (!cover) return null

  const aspectRatio =
    cover.width && cover.height
      ? ({ aspectRatio: `${cover.width} / ${cover.height}` } as const)
      : undefined

  return (
    <figure className={`book-cover${className ? ` ${className}` : ''}`}>
      <img
        className="book-cover__img"
        src={cover.src}
        alt={cover.alt}
        width={cover.width}
        height={cover.height}
        loading="lazy"
        style={aspectRatio}
      />
    </figure>
  )
}
