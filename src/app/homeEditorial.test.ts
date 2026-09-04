import { describe, expect, it } from 'vitest'
import { listCatalogEntries } from '../reader/catalog'
import {
  listEditorialFeatures,
  listEditorialSelections,
  listHomeContentSamples,
  publicChaptersForEntry,
} from './homeEditorial'

describe('home editorial content projection', () => {
  const entries = listCatalogEntries()

  it('keeps paid material to its released public chapter prefix', () => {
    const paidEntry = entries.find((entry) => entry.book.price?.tier === 'paid')
    expect(paidEntry).toBeDefined()

    const publicChapters = publicChaptersForEntry(paidEntry!)

    expect(publicChapters.map(({ chapter }) => chapter.id)).toEqual(['mj-ch-1'])
    expect(publicChapters[0]?.blocks.map((block) => block.id)).toContain('mj-ch01-blk-07')
    expect(publicChapters.flatMap(({ blocks }) => blocks).map((block) => block.id)).not.toContain(
      'mj-ch02-blk-01',
    )
  })

  it('selects real dialogue, vocabulary, and example material with book sources', () => {
    const samples = listHomeContentSamples(entries)

    expect(samples.map((sample) => sample.kind)).toEqual(['dialogue', 'vocabulary', 'example'])
    expect(samples.map((sample) => sample.expression)).toEqual([
      '本日の目的は、三つの企画案から来月検証する一案を決めることです。',
      '敬語（けいご）',
      'お手数をおかけしますが、ご確認のほどよろしくお願いいたします。',
    ])
    expect(samples.every((sample) => sample.sourceLabel.includes(' / '))).toBe(true)
  })

  it('builds the supported numbered set and only real media selections', () => {
    const features = listEditorialFeatures(entries)
    const selections = listEditorialSelections(entries)

    expect(features.map((feature) => feature.label)).toEqual(['BOOK', 'CHAPTER', 'EXPRESSION'])
    expect(features.every((feature) => feature.title && feature.body)).toBe(true)
    expect(selections.length).toBeGreaterThanOrEqual(2)
    expect(selections.length).toBeLessThanOrEqual(3)
    expect(selections[0]?.media.kind).toBe('cover')
    expect(selections.some((selection) => selection.media.kind === 'image')).toBe(true)
    expect(selections.every((selection) => selection.body.length > 0)).toBe(true)
  })
})
