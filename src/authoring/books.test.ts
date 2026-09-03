import { describe, expect, it } from 'vitest'
import type { Book } from '../content/types'
import { BLOCK_TYPES } from '../content/types'
import { validateBook } from '../content/validate'
import { derivePreview, type PreviewBoundary } from './preview'

const authoredBookModules = import.meta.glob('../../books/*/book.json', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const authoredManifestModules = import.meta.glob('../../books/*/manifest.json', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

interface AuthoringManifest {
  catalog?: { order?: number }
  preview?: { boundary?: PreviewBoundary }
  learning?: { chapters?: Record<string, string[]> }
}

function slugFromPath(path: string): string {
  const slug = /\/books\/([^/]+)\/(?:book|manifest)\.json$/.exec(path)?.[1]
  if (!slug) throw new Error(`unexpected authored path ${path}`)
  return slug
}

function loadBooks(): Map<string, Book> {
  return new Map(
    Object.entries(authoredBookModules).map(([path, raw]) => {
      const slug = slugFromPath(path)
      const result = validateBook(JSON.parse(raw) as unknown)
      if (!result.ok) {
        throw new Error(
          `${slug} failed validation:\n${result.issues
            .map((issue) => `${issue.path} [${issue.code}] ${issue.message}`)
            .join('\n')}`,
        )
      }
      return [slug, result.value]
    }),
  )
}

function loadManifests(): Map<string, AuthoringManifest> {
  return new Map(
    Object.entries(authoredManifestModules).map(([path, raw]) => [
      slugFromPath(path),
      JSON.parse(raw) as AuthoringManifest,
    ]),
  )
}

describe('authored Book catalog', () => {
  it('discovers and validates every Book through the content-only workflow', () => {
    const books = loadBooks()
    expect([...books.keys()]).toEqual(
      expect.arrayContaining(['email-manners', 'keigo-essentials', 'meeting-japanese']),
    )
    expect(books.size).toBeGreaterThanOrEqual(3)
    for (const [slug, book] of books) expect(book.slug).toBe(slug)
  })

  it('keeps the free keigo fixture as the renderer grammar coverage Book', () => {
    const book = loadBooks().get('keigo-essentials')
    if (!book) throw new Error('missing keigo-essentials')
    const used = new Set(book.chapters.flatMap((chapter) => chapter.blocks.map((block) => block.type)))
    expect([...used].sort()).toEqual([...BLOCK_TYPES].sort())
  })

  it('preserves both Prototype Books as entirely free and without preview boundaries', () => {
    const books = loadBooks()
    const manifests = loadManifests()
    for (const slug of ['keigo-essentials', 'email-manners']) {
      expect(books.get(slug)?.price).toEqual({ tier: 'free' })
      expect(manifests.get(slug)?.preview?.boundary).toBeUndefined()
    }
  })
})

describe('commercial Book', () => {
  it('has substantial original product content and an honest commercial identity', () => {
    const book = loadBooks().get('meeting-japanese')
    if (!book) throw new Error('missing meeting-japanese')

    expect(book.title).toBe('会議の日本語')
    expect(book.subtitle).toBe('意見を伝え、合意をつくる実践フレーズ')
    expect(book.authors).toEqual([
      expect.objectContaining({ name: 'Business Japanese Hub 編集部', role: 'editorial' }),
    ])
    expect(book.price).toEqual({ tier: 'paid', amount: 12, currency: 'USD' })
    expect(book.chapters).toHaveLength(9)
    expect(book.chapters.reduce((total, chapter) => total + chapter.blocks.length, 0)).toBeGreaterThanOrEqual(108)
    expect(JSON.stringify(book).length).toBeGreaterThan(12_000)
    expect(JSON.stringify(book)).not.toMatch(/prototype|test|fixture|sample|プロトタイプ|テスト|サンプル/i)
  })

  it('contains the canonical Course Correction Learn module without inventing an evidence skill', () => {
    const book = loadBooks().get('meeting-japanese')
    const manifest = loadManifests().get('meeting-japanese')
    const chapter = book?.chapters.find((candidate) => candidate.id === 'mj-ch-09')
    if (!book || !manifest || !chapter) throw new Error('missing Course Correction module')

    const blocks = chapter.blocks
    const serialized = JSON.stringify(chapter)
    const vocabularyTerms = new Set(
      blocks.flatMap((block) => (block.type === 'vocabulary' ? [block.term] : [])),
    )

    expect(chapter.slug).toBe('course-correction')
    expect(chapter.title).toBe('議論を本筋に戻す')
    expect(blocks.filter((block) => block.type === 'exercise')).toHaveLength(4)
    expect(blocks.filter((block) => block.type === 'dialogue')).toHaveLength(3)
    expect(vocabularyTerms).toEqual(
      new Set([
        '本題',
        '本筋',
        '論点',
        '整理する',
        '議論が広がる',
        '脱線する',
        '一旦',
        '話を戻す',
        '進行',
        '次の項目',
        '別途',
        '持ち帰る',
      ]),
    )
    expect(serialized).toContain('承接 → Pivot → 收斂')
    expect(serialized).toContain('文法上は正しいが直接的')
    expect(serialized).toContain('進行役 → 全員')
    expect(serialized).toContain('同僚 → 同僚')
    expect(serialized).toContain('後輩 → 先輩・上司')
    expect(serialized).toContain('語氣：')
    expect(serialized).toContain('選項是「此情境較合適」的判斷')
    expect(manifest.learning?.chapters?.['mj-ch-09']).toBeUndefined()
  })

  it('publishes only the first chapter as a genuine partial preview', () => {
    const book = loadBooks().get('meeting-japanese')
    const manifest = loadManifests().get('meeting-japanese')
    if (!book || !manifest?.preview?.boundary) throw new Error('missing commercial preview metadata')

    expect(manifest.catalog?.order).toBe(10)
    expect(manifest.preview.boundary).toEqual({ kind: 'chapter', chapterId: 'mj-ch-1' })
    const preview = derivePreview(book, manifest.preview.boundary)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.value.chapters.map((chapter) => chapter.id)).toEqual(['mj-ch-1'])
    expect(preview.value.paidStart).toEqual({
      chapterId: book.chapters[1]?.id,
      blockId: book.chapters[1]?.blocks[0]?.id,
    })
    expect(preview.value.isPartial).toBe(true)
  })
})
