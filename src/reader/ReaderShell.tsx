/**
 * ReaderShell — the immersive reading surface.
 *
 * Owns reader settings, the collapsible chrome, the TOC / settings / vocabulary
 * overlays, and the reading-position wiring. It is deliberately the only place
 * that knows about overlays and settings, so `ReaderPage` stays a thin resolver.
 *
 * `ReaderPage` supplies validated restore anchors and the current-user store;
 * the shell saves settled anchors through that store.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Book, Chapter, VocabularyBlock } from '../content/types'
import { useStrings } from '../i18n/strings'
import { canRead, type PreviewBoundary } from '../lib/entitlement'
import { tierOf, toChapterOrderRefs } from '../lib/bookAccess'
import {
  noopReadingPositionStore,
  type ReadingAnchor,
  type ReadingPositionStore,
} from './readingPosition'
import { FONT_SCALE, initialReaderSettings, type ReaderSettings } from './readerSettings'
import { useChromeVisibility } from './useChromeVisibility'
import { useMediaQuery } from './useMediaQuery'
import { useReadingPosition } from './useReadingPosition'
import { BlockRenderer } from './BlockRenderer'
import { ReaderChapterHeader } from './ReaderChapterHeader'
import { ReaderChapterNav } from './ReaderChapterNav'
import { ReaderDialog } from './ReaderDialog'
import { ReaderMarginalia } from './ReaderMarginalia'
import { ReaderPaidBoundary } from './ReaderPaidBoundary'
import { ReaderProgress } from './ReaderProgress'
import { ReaderSettingsPanel } from './ReaderSettingsPanel'
import { ReaderToc } from './ReaderToc'
import { ReaderTopBar } from './ReaderTopBar'

export interface ReaderShellProps {
  book: Book
  chapter: Chapter
  /** Current-user reading-position store assembled by ReaderPage. */
  store?: ReadingPositionStore
  /**
   * Server-authoritative ownership (the entitlement gate input). Only blocks
   * inside the preview boundary are rendered when unowned.
   */
  owned?: boolean
  /** Gate-shaped preview boundary (registry metadata; see src/reader/catalog.ts). */
  previewBoundary?: PreviewBoundary
  /** Validated, readable saved anchor for this one Continue entry. */
  restoreAnchor?: ReadingAnchor
  /** Current semantic viewport to restore only when a paid pending state remounts the shell. */
  liveRestoreAnchor?: ReadingAnchor
  /** Stable identity of the Continue navigation, retained when its marker is consumed. */
  restoreEntryKey?: string
  /** Owner identity bound to the local, one-entry consumed marker. */
  resumeOwnerId?: string | null
  /** Reset a viewport inherited from a different consumed owner/book entry. */
  resetInitialViewport?: boolean
  /** Keep transient anchors out of persistence while the initial read settles. */
  canPersistPosition?: boolean
  /** Suppress the first measurement save after a consumed resume remount. */
  skipInitialPositionSave?: boolean
}

function VocabularyDetail({ block }: { block: VocabularyBlock }) {
  const strings = useStrings()
  return (
    <div className="reader-vocab-detail">
      <p className="reader-vocab-detail__term">
        {block.term}
        {block.reading && <span className="reader-vocab-detail__reading">（{block.reading}）</span>}
      </p>
      {block.partOfSpeech && (
        <p className="reader-vocab-detail__pos">
          {strings.reader.partOfSpeech}: {block.partOfSpeech}
        </p>
      )}
      <p className="reader-vocab-detail__meaning">
        <strong>{strings.reader.meaning}: </strong>
        {block.meaning}
      </p>
      {block.example && (
        <p className="reader-vocab-detail__example">
          <strong>{strings.reader.example}: </strong>
          {block.example}
        </p>
      )}
    </div>
  )
}

export function ReaderShell({
  book,
  chapter,
  store = noopReadingPositionStore,
  owned = false,
  previewBoundary,
  restoreAnchor,
  liveRestoreAnchor,
  restoreEntryKey,
  resumeOwnerId = null,
  resetInitialViewport = false,
  canPersistPosition = true,
  skipInitialPositionSave = false,
}: ReaderShellProps) {
  const strings = useStrings()
  const contentRef = useRef<HTMLElement>(null)
  const isDesktop = useMediaQuery('(min-width: 64rem)')
  const location = useLocation()
  const { hash, key: locationKey } = location
  const navigate = useNavigate()
  const appliedRestoreKeyRef = useRef<string | null>(null)

  const [settings, setSettings] = useState<ReaderSettings>(initialReaderSettings)
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [vocabBlock, setVocabBlock] = useState<VocabularyBlock | null>(null)
  // Capture a live position only on mount. A save from this still-mounted shell
  // must never turn into a late restore and jump the reader backwards.
  const currentEntryKey = restoreEntryKey ?? locationKey
  const [initialLiveRestore] = useState(() =>
    liveRestoreAnchor
      ? { anchor: liveRestoreAnchor, entryKey: currentEntryKey, chapterId: chapter.id }
      : undefined,
  )
  const liveRestoreForEntry =
    initialLiveRestore &&
    initialLiveRestore.entryKey === currentEntryKey &&
    initialLiveRestore.chapterId === chapter.id
      ? initialLiveRestore.anchor
      : undefined
  const restoreAnchorForEntry = restoreAnchor ?? liveRestoreForEntry
  const shouldResetInitialViewportRef = useRef(
    resetInitialViewport && !restoreAnchorForEntry && !hash,
  )

  const chrome = useChromeVisibility(isDesktop)

  // Entitlement gate: the chapter's ordered blocks are filtered to the readable
  // prefix (deny-by-default via `canRead`); a single boundary marker is rendered
  // where the preview ends, and blocks beyond it are never mounted.
  const tier = tierOf(book)
  const chapterRefs = useMemo(() => toChapterOrderRefs(book), [book])
  const firstGatedIndex = useMemo(() => {
    return chapter.blocks.findIndex((block) => {
      return !canRead({
        tier,
        owned,
        position: { chapterId: chapter.id, blockId: block.id },
        chapters: chapterRefs,
        previewBoundary,
      })
    })
  }, [chapter, owned, previewBoundary, chapterRefs, tier])
  const visibleBlocks = useMemo(
    () => (firstGatedIndex === -1 ? chapter.blocks : chapter.blocks.slice(0, firstGatedIndex)),
    [chapter, firstGatedIndex],
  )

  const onAnchorChange = useCallback(
    (anchor: ReadingAnchor) => {
      store.save(book.id, anchor)
    },
    [store, book.id],
  )
  const progress = useReadingPosition(
    book,
    chapter,
    contentRef,
    onAnchorChange,
    {
      restore: restoreAnchorForEntry
        ? { anchor: restoreAnchorForEntry, key: currentEntryKey }
        : undefined,
      canPersist: canPersistPosition,
      entryKey: currentEntryKey,
      skipInitialPersistence: skipInitialPositionSave,
    },
  )

  useLayoutEffect(() => {
    if (!shouldResetInitialViewportRef.current) return
    shouldResetInitialViewportRef.current = false
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [book.id])

  // Apply an explicit Continue anchor or mount-captured live remount anchor
  // once for this route entry. This runs before position measurement so
  // reflow/settings/session rerenders cannot replace it with an opening anchor.
  useLayoutEffect(() => {
    const stableRestoreKey = restoreEntryKey ?? locationKey
    if (!restoreAnchorForEntry || hash || appliedRestoreKeyRef.current === stableRestoreKey) return
    appliedRestoreKeyRef.current = stableRestoreKey

    if (restoreAnchorForEntry.chapterId !== chapter.id) return
    if (!restoreAnchorForEntry.blockId) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    } else {
      const targetId = `block-${restoreAnchorForEntry.blockId}`
      const target = document.getElementById(targetId)
      if (!target || !contentRef.current?.contains(target)) return
      target.scrollIntoView({ behavior: 'instant', block: 'start' })
      target.focus({ preventScroll: true })
    }

    const search = new URLSearchParams(location.search)
    if (search.get('resume') === '1') {
      search.delete('resume')
      const nextSearch = search.toString()
      const priorState =
        typeof location.state === 'object' && location.state !== null ? location.state : {}
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
          hash: location.hash,
        },
        {
          replace: true,
          state: {
            ...priorState,
            readerResumeConsumed: { bookId: book.id, userId: resumeOwnerId },
            readerResumeEntryKey: stableRestoreKey,
          },
        },
      )
    }
  }, [
    restoreAnchorForEntry,
    locationKey,
    hash,
    chapter.id,
    book.id,
    visibleBlocks,
    restoreEntryKey,
    resumeOwnerId,
    location.pathname,
    location.search,
    location.state,
    location.hash,
    navigate,
  ])

  // React Router's client-side navigation does not perform the browser's native
  // fragment scroll. Consume a resolved block fragment after readable blocks
  // mount, then place keyboard focus at the same stable target.
  useEffect(() => {
    if (!hash.startsWith('#') || hash.length === 1) return
    let targetId: string
    try {
      targetId = decodeURIComponent(hash.slice(1))
    } catch {
      return
    }
    if (!targetId.startsWith('block-')) return

    const target = document.getElementById(targetId)
    if (!target || !contentRef.current?.contains(target)) return
    target.scrollIntoView({ behavior: 'instant', block: 'start' })
    target.focus({ preventScroll: true })
  }, [hash, book.id, chapter.id, visibleBlocks])

  // The reader manages its own color scheme on the whole document surface so
  // overscroll matches; restored when the reader unmounts.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.readerTheme = settings.theme
    return () => {
      delete root.dataset.readerTheme
    }
  }, [settings.theme])

  const chapterIndex = book.chapters.findIndex((c) => c.id === chapter.id)
  const prevChapter = chapterIndex > 0 ? book.chapters[chapterIndex - 1] : undefined
  const nextChapter =
    chapterIndex >= 0 && chapterIndex < book.chapters.length - 1
      ? book.chapters[chapterIndex + 1]
      : undefined

  // Only vocabulary that is actually readable feeds the marginalia rail: a
  // block beyond the preview boundary must not leak paid content sideways.
  const vocabBlocks = useMemo(
    () => visibleBlocks.filter((block): block is VocabularyBlock => block.type === 'vocabulary'),
    [visibleBlocks],
  )

  const toggleToc = useCallback(() => setTocOpen((current) => !current), [])
  const openVocab = useCallback((block: VocabularyBlock) => setVocabBlock(block), [])
  const closeVocab = useCallback(() => setVocabBlock(null), [])
  const closeToc = useCallback(() => {
    chrome.reveal()
    setTocOpen(false)
  }, [chrome.reveal])
  const closeSettings = useCallback(() => {
    chrome.reveal()
    setSettingsOpen(false)
  }, [chrome.reveal])

  return (
    <div
      className="reader-shell"
      lang={book.language}
      data-reader-font={settings.font}
      style={{ '--reader-font-scale': FONT_SCALE[settings.fontSize] } as CSSProperties}
    >
      <ReaderProgress percent={progress.percent} />

      <ReaderTopBar
        book={book}
        chapter={chapter}
        tocOpen={tocOpen}
        hidden={!chrome.visible}
        onToggleToc={toggleToc}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {!chrome.visible && (
        <button
          type="button"
          className="reader-peek"
          aria-label={strings.reader.revealChrome}
          onClick={chrome.reveal}
        >
          <span aria-hidden="true">⌄</span>
        </button>
      )}

      <div className={`reader-layout${vocabBlocks.length > 0 ? ' reader-layout--marginalia' : ''}`}>
        <main className="reader-main" ref={contentRef}>
          <a className="reader-skip" href="#chapter-body">
            {strings.reader.skipToChapterBody}
          </a>
          <div id="chapter-body" tabIndex={-1} className="reader-chapter-body">
            <ReaderChapterHeader chapter={chapter} />
            <div className="reader-blocks">
              {visibleBlocks.map((block) => (
                <BlockRenderer
                  key={block.id}
                  block={block}
                  onOpenVocab={openVocab}
                  openVocabBlockId={vocabBlock?.id}
                />
              ))}
              {firstGatedIndex !== -1 && <ReaderPaidBoundary book={book} />}
            </div>
            <ReaderChapterNav book={book} prev={prevChapter} next={nextChapter} />
          </div>
        </main>

        {vocabBlocks.length > 0 && <ReaderMarginalia chapter={chapter} vocab={vocabBlocks} />}
      </div>

      <ReaderDialog
        placement="toc"
        open={tocOpen}
        onClose={closeToc}
        label={strings.reader.tableOfContents}
        title={strings.reader.tableOfContents}
        bodyId="reader-toc-panel"
      >
        <ReaderToc book={book} current={chapter} onNavigate={closeToc} />
      </ReaderDialog>

      <ReaderDialog
        placement="settings"
        open={settingsOpen}
        onClose={closeSettings}
        label={strings.reader.settings}
        title={strings.reader.settings}
      >
        <ReaderSettingsPanel settings={settings} onChange={setSettings} />
      </ReaderDialog>

      <ReaderDialog
        placement="vocab"
        open={vocabBlock !== null}
        onClose={closeVocab}
        label={vocabBlock ? `${strings.reader.vocab} — ${vocabBlock.term}` : strings.reader.vocab}
        title={vocabBlock?.term}
      >
        {vocabBlock && <VocabularyDetail block={vocabBlock} />}
      </ReaderDialog>
    </div>
  )
}
