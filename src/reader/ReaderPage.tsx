import { Link, Navigate, useParams } from 'react-router-dom'
import { useMemo } from 'react'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { getBookBySlug, getCatalogEntry } from './catalog'
import { useStrings } from '../i18n/strings'
import { ReaderShell } from './ReaderShell'
import { ReaderGate } from './ReaderGate'
import { canRead } from '../lib/entitlement'
import { offersPreview, tierOf, toChapterOrderRefs } from '../lib/bookAccess'
import { useBookState, useSaveReadingState } from '../lib/persistence/useBookState'
import type { ReadingPositionStore } from './readingPosition'

function ReaderNotFound({ message }: { message: string }) {
  const strings = useStrings()
  return (
    <section className="reader-notfound">
      <h1 className="reader-notfound__title">{message}</h1>
      <Link className="reader-notfound__link" to="/library">
        {strings.reader.backToLibrary}
      </Link>
    </section>
  )
}

/**
 * Reader route resolver: `/books/:slug/read` (resume or first readable chapter)
 * and `/books/:slug/read/:chapterSlug`.
 *
 * This is where the entitlement gate meets the reader:
 *  - free / preview-tier books are readable immediately (public preview must not
 *    require sign-in — docs/ui-ux-research.md §4.2);
 *  - paid books never flash content while ownership is resolving: they show a
 *    neutral pending state, then either the reader (owned / inside the preview
 *    prefix) or the `ReaderGate` denial surface.
 */
export function ReaderPage() {
  const strings = useStrings()
  const { slug, chapterSlug } = useParams<{ slug: string; chapterSlug?: string }>()
  const book = slug ? getBookBySlug(slug) : undefined
  const entry = slug ? getCatalogEntry(slug) : undefined
  const previewBoundary = entry?.previewBoundary

  const { owned, readingState, loading } = useBookState(book?.id ?? '')
  const saveState = useSaveReadingState()

  // Durable reading-position store: preloads the persisted anchor for the
  // (sync) reader seam and persists every anchor change through the repository.
  const store = useMemo<ReadingPositionStore>(
    () => ({
      load: () =>
        readingState
          ? { chapterId: readingState.chapterId, blockId: readingState.blockId ?? '' }
          : null,
      save: (bookId, anchor) =>
        saveState({
          bookId,
          chapterId: anchor.chapterId,
          blockId: anchor.blockId,
          offset: anchor.offset,
        }),
    }),
    [readingState, saveState],
  )

  const chapter = book && chapterSlug ? book.chapters.find((c) => c.slug === chapterSlug) : undefined

  let title = strings.reader.bookNotFound
  if (book && chapterSlug && !chapter) {
    title = strings.reader.chapterNotFound
  } else if (book && chapter) {
    title = `${chapter.title} — ${book.title}`
  } else if (book) {
    // Redirect path (or a book with no chapters): title the destination.
    const first = book.chapters[0]
    title = first ? `${first.title} — ${book.title}` : strings.reader.bookNotFound
  }
  useDocumentTitle(title)

  if (!book) {
    return <ReaderNotFound message={strings.reader.bookNotFound} />
  }

  const tier = tierOf(book)
  const chapterRefs = toChapterOrderRefs(book)
  const hasPreview = offersPreview(tier, previewBoundary)
  const readable = (chapterId: string) =>
    canRead({ tier, owned, position: { chapterId }, chapters: chapterRefs, previewBoundary })
  const ownershipPending = tier !== 'free' && tier !== 'preview' && loading

  if (chapterSlug) {
    if (!chapter) {
      return <ReaderNotFound message={strings.reader.chapterNotFound} />
    }
    // Paid books gate while ownership is still resolving: never flash paid
    // content before the server-authoritative state arrives.
    if (ownershipPending) {
      return (
        <section className="reader-pending" aria-live="polite">
          <p>{strings.book.pending}</p>
        </section>
      )
    }
    if (!readable(chapter.id)) {
      return <ReaderGate book={book} hasPreview={hasPreview} />
    }
    return (
      <ReaderShell
        key={book.id}
        book={book}
        chapter={chapter}
        store={store}
        owned={owned}
        previewBoundary={previewBoundary}
      />
    )
  }

  // No chapter slug: gate while ownership resolves, then resume the last-read
  // position when it is still readable, otherwise the first readable chapter.
  if (ownershipPending) {
    return (
      <section className="reader-pending" aria-live="polite">
        <p>{strings.book.pending}</p>
      </section>
    )
  }

  const resumeChapter = readingState
    ? book.chapters.find((c) => c.id === readingState.chapterId)
    : undefined
  const resumeSlug = resumeChapter && readable(resumeChapter.id) ? resumeChapter.slug : undefined
  const firstReadable = book.chapters.find((c) => readable(c.id))
  const targetSlug = resumeSlug ?? firstReadable?.slug

  if (!targetSlug) {
    // Nothing is readable — e.g. a whole paid book with no preview.
    return <ReaderGate book={book} hasPreview={hasPreview} />
  }

  return <Navigate to={`/books/${book.slug}/read/${targetSlug}`} replace />
}
