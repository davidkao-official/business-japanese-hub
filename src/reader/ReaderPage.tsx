import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@business-japanese-hub/platform-auth'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { getBookBySlug, getCatalogEntry } from './catalog'
import { useStrings } from '../i18n/strings'
import { ReaderShell } from './ReaderShell'
import { ReaderGate } from './ReaderGate'
import { canRead } from '../lib/entitlement'
import { offersPreview, tierOf, toChapterOrderRefs } from '../lib/bookAccess'
import { useBookState, useSaveReadingState } from '../lib/persistence/useBookState'
import { useUserState } from '../lib/persistence/UserStateContext'
import { useLearningEvidenceRepository } from '../lib/learning/LearningEvidenceContext'
import type { ReadingPositionStore } from './readingPosition'
import type { ReadingAnchor } from './readingPosition'

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

function ReaderResumeUnavailable() {
  const strings = useStrings()
  return (
    <section className="reader-notfound" role="alert">
      <h1 className="reader-notfound__title">{strings.library.loadFailed}</h1>
      <Link className="reader-notfound__link" to="/library">
        {strings.reader.backToLibrary}
      </Link>
    </section>
  )
}

function blockIdFromHash(hash: string): string | undefined {
  if (!hash.startsWith('#') || hash.length === 1) return undefined
  try {
    const targetId = decodeURIComponent(hash.slice(1))
    return targetId.startsWith('block-') ? targetId.slice('block-'.length) : undefined
  } catch {
    return undefined
  }
}

interface ReaderPositionSnapshot {
  ownerId: string | null
  ownerEpoch: number
  bookId: string
  entryKey: string
  anchor: ReadingAnchor
}

function ChapterLearningEvidence({ bookId, chapterId }: { bookId: string; chapterId: string }) {
  const { user, loading } = useAuth()
  const repository = useLearningEvidenceRepository()
  const userId = user?.id

  useEffect(() => {
    if (loading || !userId || !repository) return
    void repository.recordChapterOpened({ bookId, chapterId }, userId).catch(() => {
      // Learning evidence is best effort and must never interrupt the Reader.
    })
  }, [loading, userId, repository, bookId, chapterId])

  return null
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
  const location = useLocation()
  const { user, authLoading, repository } = useUserState()
  const { slug, chapterSlug } = useParams<{ slug: string; chapterSlug?: string }>()
  const book = slug ? getBookBySlug(slug) : undefined
  const entry = slug ? getCatalogEntry(slug) : undefined
  const previewBoundary = entry?.previewBoundary
  const navigationState =
    typeof location.state === 'object' && location.state !== null ? location.state : {}
  const consumedState = navigationState.readerResumeConsumed
  const resumeEntryKey =
    typeof navigationState.readerResumeEntryKey === 'string'
      ? navigationState.readerResumeEntryKey
      : location.key
  const [positionSnapshot, setPositionSnapshot] = useState<ReaderPositionSnapshot | null>(null)
  const currentOwnerId = user?.id ?? null
  const [ownerObservation, setOwnerObservation] = useState(() => ({
    initialized: !authLoading,
    ownerId: authLoading ? null : currentOwnerId,
    generation: 0,
    transitioned: false,
  }))
  let ownerTransition = false
  if (!authLoading) {
    if (!ownerObservation.initialized) {
      setOwnerObservation({
        initialized: true,
        ownerId: currentOwnerId,
        generation: ownerObservation.generation,
        transitioned: false,
      })
    } else if (ownerObservation.ownerId !== currentOwnerId) {
      ownerTransition = true
      setOwnerObservation({
        initialized: true,
        ownerId: currentOwnerId,
        generation: ownerObservation.generation + 1,
        transitioned: true,
      })
    } else {
      ownerTransition = ownerObservation.transitioned
    }
  }

  const { owned, readingState, loading, error } = useBookState(book?.id ?? '')
  const saveState = useSaveReadingState()

  // Bind the current user-scoped reading state to the Reader's save callback.
  // Continue restoration and same-owner remount snapshots are resolved below;
  // live snapshots never become late restores in an already-mounted shell.
  const store = useMemo<ReadingPositionStore>(
    () => ({
      load: () =>
        readingState
          ? {
              chapterId: readingState.chapterId,
              blockId: readingState.blockId ?? '',
              offset: readingState.offset ?? undefined,
            }
          : null,
      save: (bookId, anchor) => {
        if (bookId !== book?.id) return
        setPositionSnapshot({
          ownerId: currentOwnerId,
          ownerEpoch: ownerObservation.generation,
          bookId,
          entryKey: resumeEntryKey,
          anchor,
        })
        setOwnerObservation((previous) =>
          previous.ownerId === currentOwnerId && previous.transitioned
            ? { ...previous, transitioned: false }
            : previous,
        )
        if (loading || error) return
        saveState({
          bookId,
          chapterId: anchor.chapterId,
          blockId: anchor.blockId,
          offset: anchor.offset,
        })
      },
    }),
    [
      readingState,
      saveState,
      loading,
      error,
      currentOwnerId,
      ownerObservation.generation,
      book?.id,
      resumeEntryKey,
    ],
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

  const tier = book ? tierOf(book) : 'paid'
  const chapterRefs = book ? toChapterOrderRefs(book) : []
  const hasPreview = offersPreview(tier, previewBoundary)
  const readable = (chapterId: string, blockId?: string) =>
    canRead({
      tier,
      owned,
      position: { chapterId, ...(blockId ? { blockId } : {}) },
      chapters: chapterRefs,
      previewBoundary,
    })
  const hashBlockId = blockIdFromHash(location.hash)
  const hashChapter = book && hashBlockId
    ? book.chapters.find((candidate) => candidate.blocks.some((block) => block.id === hashBlockId))
    : undefined
  const hashIsReadable = Boolean(hashChapter && hashBlockId && readable(hashChapter.id, hashBlockId))
  const hasResumeMarker = new URLSearchParams(location.search).get('resume') === '1'
  const resumeCandidate = !location.hash && (!chapterSlug || hasResumeMarker)
  const resumeEntryConsumed =
    typeof consumedState === 'object' &&
    consumedState !== null &&
    'bookId' in consumedState &&
    consumedState.bookId === book?.id &&
    'userId' in consumedState &&
    consumedState.userId === (user?.id ?? null)
  const consumedMarkerIsStale =
    typeof consumedState === 'object' &&
    consumedState !== null &&
    'bookId' in consumedState &&
    'userId' in consumedState &&
    (consumedState.bookId !== book?.id || consumedState.userId !== (user?.id ?? null))
  let resumeViewportAnchor: ReadingAnchor | undefined
  if (
    !location.hash &&
    chapter &&
    positionSnapshot?.ownerId === currentOwnerId &&
    positionSnapshot.ownerEpoch === ownerObservation.generation &&
    positionSnapshot.bookId === book?.id &&
    positionSnapshot.entryKey === resumeEntryKey &&
    positionSnapshot.anchor.chapterId === chapter.id &&
    readable(chapter.id)
  ) {
    const savedBlockId = positionSnapshot.anchor.blockId
    const savedBlockIndex = savedBlockId
      ? chapter.blocks.findIndex((block) => block.id === savedBlockId)
      : -1

    if (!savedBlockId) {
      resumeViewportAnchor = positionSnapshot.anchor
    } else if (savedBlockIndex === -1) {
      // A removed or malformed live block degrades to this chapter's start.
      resumeViewportAnchor = { chapterId: chapter.id, blockId: '' }
    } else if (readable(chapter.id, savedBlockId)) {
      resumeViewportAnchor = positionSnapshot.anchor
    } else {
      // If access changed during the paid refresh, keep only the earlier
      // readable prefix and never seed the Reader with a gated live block.
      const earlierReadableBlock = chapter.blocks
        .slice(0, savedBlockIndex)
        .reverse()
        .find((block) => readable(chapter.id, block.id))
      resumeViewportAnchor = {
        chapterId: chapter.id,
        blockId: earlierReadableBlock?.id ?? '',
      }
    }
  }
  const resumeIntent = resumeCandidate && !resumeEntryConsumed
  const previousBookViewport = Boolean(
    book && positionSnapshot && positionSnapshot.bookId !== book.id,
  )
  const identityPending = repository !== null && authLoading
  const ownershipPending =
    repository !== null && tier !== 'free' && tier !== 'preview' && loading
  const resumePending = resumeIntent && repository !== null && loading
  if (!book) {
    return <ReaderNotFound message={strings.reader.bookNotFound} />
  }

  if (resumeIntent && error) {
    return <ReaderResumeUnavailable />
  }

  if (identityPending || resumePending || ownershipPending) {
    return (
      <section className="reader-pending" aria-live="polite">
        <p>{strings.book.pending}</p>
      </section>
    )
  }

  const firstReadable = book.chapters.find((candidate) => readable(candidate.id))

  // A block fragment is an explicit navigation target and takes precedence
  // over any saved Continue position. Generic reader links can resolve the
  // fragment's chapter without consulting or restoring user state.
  if (!chapterSlug && location.hash && hashChapter && hashBlockId && hashIsReadable) {
    return (
      <Navigate
        to={`/books/${book.slug}/read/${hashChapter.slug}${location.search}${location.hash}`}
        replace
      />
    )
  }

  const savedChapter = readingState ? book.chapters.find((candidate) => candidate.id === readingState.chapterId) : undefined
  const savedChapterReadable = Boolean(savedChapter && readable(savedChapter.id))

  if (resumeIntent) {
    const targetChapter = savedChapterReadable ? savedChapter : firstReadable
    if (!targetChapter) return <ReaderGate book={book} hasPreview={hasPreview} />

    const targetIsSaved = Boolean(readingState && savedChapterReadable)
    const targetQuery = targetIsSaved ? '?resume=1' : ''
    if (!chapterSlug || chapterSlug !== targetChapter.slug || hasResumeMarker !== targetIsSaved) {
      return (
        <Navigate
          to={`/books/${book.slug}/read/${targetChapter.slug}${targetQuery}`}
          replace
        />
      )
    }
  }

  if (chapterSlug) {
    if (!chapter) {
      return <ReaderNotFound message={strings.reader.chapterNotFound} />
    }
    if (!readable(chapter.id)) {
      return <ReaderGate book={book} hasPreview={hasPreview} />
    }

    let restoreAnchor: ReadingAnchor | undefined
    if (resumeIntent && readingState && savedChapterReadable && savedChapter?.id === chapter.id) {
      const savedBlockIndex = readingState.blockId
        ? chapter.blocks.findIndex((block) => block.id === readingState.blockId)
        : -1
      if (savedBlockIndex >= 0 && !readable(chapter.id, chapter.blocks[savedBlockIndex].id)) {
        const earlierReadableBlock = chapter.blocks
          .slice(0, savedBlockIndex)
          .reverse()
          .find((block) => readable(chapter.id, block.id))
        restoreAnchor = {
          chapterId: chapter.id,
          blockId: earlierReadableBlock?.id ?? '',
        }
      } else if (savedBlockIndex >= 0) {
        restoreAnchor = {
          chapterId: chapter.id,
          blockId: chapter.blocks[savedBlockIndex].id,
          ...(readingState.offset == null ? {} : { offset: readingState.offset }),
        }
      } else {
        // A missing/deleted block degrades safely to this chapter's opening.
        restoreAnchor = { chapterId: chapter.id, blockId: '' }
      }
    }

    return (
      <>
        <ChapterLearningEvidence bookId={book.id} chapterId={chapter.id} />
        <ReaderShell
          key={`${book.id}:${repository ? user?.id ?? 'anonymous' : 'no-sync'}`}
          book={book}
          chapter={chapter}
          store={store}
          owned={owned}
          previewBoundary={previewBoundary}
          restoreAnchor={restoreAnchor}
          liveRestoreAnchor={resumeViewportAnchor}
          restoreEntryKey={resumeEntryKey}
          resumeOwnerId={currentOwnerId}
          resetInitialViewport={ownerTransition || previousBookViewport || consumedMarkerIsStale}
          canPersistPosition={!loading && !error}
          skipInitialPositionSave={
            ownerTransition ||
            previousBookViewport ||
            consumedMarkerIsStale ||
            resumeEntryConsumed ||
            Boolean(resumeViewportAnchor)
          }
        />
      </>
    )
  }

  if (!firstReadable) {
    // Nothing is readable — e.g. a whole paid book with no preview.
    return <ReaderGate book={book} hasPreview={hasPreview} />
  }

  return <Navigate to={`/books/${book.slug}/read/${firstReadable.slug}`} replace />
}
