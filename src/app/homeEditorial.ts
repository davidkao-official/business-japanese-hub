import type { Book, Chapter, ContentBlock, ImageBlock } from '../content/types'
import { canRead } from '../lib/entitlement'
import { tierOf, toChapterOrderRefs } from '../lib/bookAccess'
import { listCatalogEntries, type CatalogEntry } from '../reader/catalog'

export interface PublicChapterContent {
  entry: CatalogEntry
  chapter: Chapter
  blocks: ContentBlock[]
}

export interface HomeContentSample {
  id: string
  book: Book
  chapter: Chapter
  kind: 'dialogue' | 'example' | 'vocabulary'
  sourceLabel: string
  expression: string
  expressionLanguage: string
  meaning: string
  meaningLanguage: string
  supporting?: string
  supportingLanguage?: string
}

export interface EditorialFeature {
  label: 'BOOK' | 'CHAPTER' | 'EXPRESSION'
  title: string
  titleLanguage: string
  body: string
  bodyLanguage: string
}

export type EditorialMedia =
  | { kind: 'cover'; book: Book }
  | { kind: 'image'; image: ImageBlock }

export interface EditorialSelection {
  id: string
  book: Book
  chapter: Chapter
  sourceLabel: string
  title: string
  body: string
  media: EditorialMedia
}

/**
 * Project each catalog entry to the public ordered prefix used by the LP.
 *
 * Catalog entries contain the complete immutable Book snapshot so the Reader
 * can enforce the same boundary at runtime. The storefront must still make
 * its own presentation projection: an unowned paid Book contributes only
 * blocks accepted by the generic entitlement gate.
 */
export function publicChaptersForEntry(entry: CatalogEntry): PublicChapterContent[] {
  const { book, previewBoundary } = entry
  const tier = tierOf(book)
  const chapters = toChapterOrderRefs(book)

  return book.chapters.flatMap((chapter) => {
    const blocks = chapter.blocks.filter((block) =>
      canRead({
        tier,
        owned: false,
        position: { chapterId: chapter.id, blockId: block.id },
        chapters,
        previewBoundary,
      }),
    )

    return blocks.length > 0 ? [{ entry, chapter, blocks }] : []
  })
}

function sourceLabel(book: Book, chapter: Chapter): string {
  return `${book.title} / ${chapter.title}`
}

/**
 * Example translations predate per-field language metadata in the content
 * model. Keep the Book language as the source-language default, while
 * recognizing the released Traditional Chinese translation and plain-English
 * fallback without changing the published content itself.
 */
function languageForTranslation(text: string, bookLanguage: string): string {
  if (bookLanguage !== 'ja') return bookLanguage
  if (/[\u3040-\u30ff]/u.test(text)) return bookLanguage
  if (/[\u3400-\u9fff]/u.test(text)) return 'zh-TW'
  return /[A-Za-z]/u.test(text) ? 'en' : bookLanguage
}

function sampleFromBlock(
  content: PublicChapterContent,
  block: ContentBlock,
): HomeContentSample | undefined {
  const { book } = content.entry
  const { chapter } = content

  if (block.type === 'dialogue') {
    const firstLine = block.lines[0]
    if (!firstLine?.text || !block.context) return undefined
    return {
      id: `${book.id}:${block.id}`,
      book,
      chapter,
      kind: 'dialogue',
      sourceLabel: sourceLabel(book, chapter),
      expression: firstLine.text,
      expressionLanguage: book.language,
      meaning: block.context,
      meaningLanguage: book.language,
      supporting: firstLine.note,
      supportingLanguage: firstLine.note ? book.language : undefined,
    }
  }

  if (block.type === 'vocabulary') {
    if (!block.term || !block.meaning) return undefined
    return {
      id: `${book.id}:${block.id}`,
      book,
      chapter,
      kind: 'vocabulary',
      sourceLabel: sourceLabel(book, chapter),
      expression: block.reading ? `${block.term}（${block.reading}）` : block.term,
      expressionLanguage: book.language,
      meaning: block.meaning,
      meaningLanguage: book.language,
      supporting: block.example,
      supportingLanguage: block.example ? book.language : undefined,
    }
  }

  if (block.type === 'example') {
    if (!block.text || (!block.translation && !block.note)) return undefined
    return {
      id: `${book.id}:${block.id}`,
      book,
      chapter,
      kind: 'example',
      sourceLabel: sourceLabel(book, chapter),
      expression: block.text,
      expressionLanguage: book.language,
      meaning: block.translation ?? block.note ?? '',
      meaningLanguage: block.translation
        ? languageForTranslation(block.translation, book.language)
        : book.language,
      supporting: block.translation ? block.note : undefined,
      supportingLanguage: block.note ? book.language : undefined,
    }
  }

  return undefined
}

/**
 * Select up to three real public examples, preferring one supported editorial
 * grammar per Book so the strip represents the published catalog. The
 * selector is content-model driven and intentionally has no book or block
 * slug branches, so future releases can replace the source material safely.
 */
export function listHomeContentSamples(entries = listCatalogEntries()): HomeContentSample[] {
  const publicBlocks = entries.flatMap((entry) => publicChaptersForEntry(entry))
  const candidates = publicBlocks.flatMap((content) =>
    content.blocks.flatMap((block) => {
      const sample = sampleFromBlock(content, block)
      return sample ? [sample] : []
    }),
  )
  const selected: HomeContentSample[] = []
  const kinds: HomeContentSample['kind'][] = ['dialogue', 'vocabulary', 'example']

  for (const kind of kinds) {
    const firstCandidate = candidates.find(
      (sample) =>
        sample.kind === kind &&
        !selected.some((selectedSample) => selectedSample.book.id === sample.book.id),
    )
    if (!firstCandidate) continue
    const bookCandidates = candidates.filter(
      (sample) => sample.kind === kind && sample.book.id === firstCandidate.book.id,
    )
    selected.push(bookCandidates.at(-1) ?? firstCandidate)
  }
  if (selected.length === 3) return selected

  for (const candidate of candidates) {
    if (selected.some((sample) => sample.id === candidate.id)) continue
    selected.push(candidate)
    if (selected.length === 3) break
  }

  return selected
}

/**
 * Build the numbered index from currently published material. Each item is a
 * real Book/chapter/expression surfaced by the catalog, rather than a claim
 * about users, outcomes, or unpublished product capability.
 */
export function listEditorialFeatures(entries = listCatalogEntries()): EditorialFeature[] {
  const featureEntry = entries[0]
  const firstChapter = featureEntry ? publicChaptersForEntry(featureEntry)[0] : undefined
  const firstSample = listHomeContentSamples(entries)[0]
  const features: EditorialFeature[] = []

  if (featureEntry?.book.description) {
    features.push({
      label: 'BOOK',
      title: featureEntry.book.title,
      titleLanguage: featureEntry.book.language,
      body: featureEntry.book.description,
      bodyLanguage: featureEntry.book.language,
    })
  }

  if (firstChapter?.chapter.summary) {
    features.push({
      label: 'CHAPTER',
      title: firstChapter.chapter.title,
      titleLanguage: firstChapter.entry.book.language,
      body: firstChapter.chapter.summary,
      bodyLanguage: firstChapter.entry.book.language,
    })
  }

  if (firstSample) {
    features.push({
      label: 'EXPRESSION',
      title: firstSample.expression,
      titleLanguage: firstSample.expressionLanguage,
      body: firstSample.meaning,
      bodyLanguage: firstSample.meaningLanguage,
    })
  }

  return features.slice(0, 6)
}

function selectionForChapter(
  content: PublicChapterContent,
  media: EditorialMedia,
): EditorialSelection | undefined {
  const body = content.chapter.summary ?? content.entry.book.description
  if (!body) return undefined

  return {
    id: `${content.entry.book.id}:${content.chapter.id}:${media.kind}`,
    book: content.entry.book,
    chapter: content.chapter,
    sourceLabel: sourceLabel(content.entry.book, content.chapter),
    title: content.chapter.title,
    body,
    media,
  }
}

/**
 * Select up to three editorial spreads from released covers and image blocks.
 * A spread is emitted only when a real asset and real chapter copy are both
 * available; no decorative placeholder is inserted to pad the page.
 */
export function listEditorialSelections(entries = listCatalogEntries()): EditorialSelection[] {
  const contents = entries.flatMap((entry) => publicChaptersForEntry(entry))
  const selections: EditorialSelection[] = []

  const coverContent = contents.find((content) => content.entry.book.cover)
  if (coverContent?.entry.book.cover) {
    const selection = selectionForChapter(coverContent, {
      kind: 'cover',
      book: coverContent.entry.book,
    })
    if (selection) selections.push(selection)
  }

  const imageContent = contents.find((content) =>
    content.blocks.some((block) => block.type === 'image' && Boolean(block.src) && Boolean(block.alt)),
  )
  const image = imageContent?.blocks.find(
    (block): block is ImageBlock => block.type === 'image' && Boolean(block.src) && Boolean(block.alt),
  )
  if (imageContent && image) {
    const selection = selectionForChapter(imageContent, { kind: 'image', image })
    if (selection && !selections.some((candidate) => candidate.id === selection.id)) {
      selections.push(selection)
    }
  }

  for (const content of contents) {
    if (selections.length >= 3) break
    if (!content.entry.book.cover) continue
    if (selections.some((candidate) => candidate.book.id === content.entry.book.id)) continue
    const selection = selectionForChapter(content, {
      kind: 'cover',
      book: content.entry.book,
    })
    if (selection && !selections.some((candidate) => candidate.id === selection.id)) {
      selections.push(selection)
    }
  }

  return selections.slice(0, 3)
}
