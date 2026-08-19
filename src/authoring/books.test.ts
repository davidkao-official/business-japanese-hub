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
    expect(book.chapters).toHaveLength(8)
    expect(book.chapters.reduce((total, chapter) => total + chapter.blocks.length, 0)).toBeGreaterThanOrEqual(72)
    expect(JSON.stringify(book).length).toBeGreaterThan(12_000)
    expect(JSON.stringify(book)).not.toMatch(/prototype|test|fixture|sample|プロトタイプ|テスト|サンプル/i)
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
