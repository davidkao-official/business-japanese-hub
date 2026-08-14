/**
 * ReaderShell — the immersive reading surface.
 *
 * Owns reader settings, the collapsible chrome, the TOC / settings / vocabulary
 * overlays, and the reading-position wiring. It is deliberately the only place
 * that knows about overlays and settings, so `ReaderPage` stays a thin resolver.
 *
 * The `store` prop is the #7 persistence seam: the shell loads on mount and
 * saves on every anchor change through the store, which is a no-op in #5.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Book, Chapter, VocabularyBlock } from '../content/types'
import { useStrings } from '../i18n/strings'
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
import { ReaderProgress } from './ReaderProgress'
import { ReaderSettingsPanel } from './ReaderSettingsPanel'
import { ReaderToc } from './ReaderToc'
import { ReaderTopBar } from './ReaderTopBar'

export interface ReaderShellProps {
  book: Book
  chapter: Chapter
  /** Reading-position persistence seam (#7 swaps the no-op store). */
  store?: ReadingPositionStore
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

export function ReaderShell({ book, chapter, store = noopReadingPositionStore }: ReaderShellProps) {
  const strings = useStrings()
  const contentRef = useRef<HTMLElement>(null)
  const isDesktop = useMediaQuery('(min-width: 64rem)')

  const [settings, setSettings] = useState<ReaderSettings>(initialReaderSettings)
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [vocabBlock, setVocabBlock] = useState<VocabularyBlock | null>(null)

  const chrome = useChromeVisibility(isDesktop)

  const onAnchorChange = useCallback(
    (anchor: ReadingAnchor) => {
      store.save(book.id, anchor)
    },
    [store, book.id],
  )
  const progress = useReadingPosition(book, chapter, contentRef, onAnchorChange)

  // #5 persistence seam: exercise load on mount (no-op store; #7 resumes).
  useEffect(() => {
    store.load(book.id)
  }, [store, book.id])

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

  const vocabBlocks = useMemo(
    () => chapter.blocks.filter((block): block is VocabularyBlock => block.type === 'vocabulary'),
    [chapter],
  )

  const toggleToc = useCallback(() => setTocOpen((current) => !current), [])
  const openVocab = useCallback((block: VocabularyBlock) => setVocabBlock(block), [])
  const closeVocab = useCallback(() => setVocabBlock(null), [])
  const closeToc = useCallback(() => setTocOpen(false), [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

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
              {chapter.blocks.map((block) => (
                <BlockRenderer
                  key={block.id}
                  block={block}
                  onOpenVocab={openVocab}
                  openVocabBlockId={vocabBlock?.id}
                />
              ))}
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
