import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import catalogDocument from './released-discovery-catalog.json'
import { FREE_PRACTICE_CONTENT_IDS, FREE_SPI_SAMPLE_CONTENT_ID, FREE_SPI_SAMPLE_REVISION, isFreePracticeContentId } from './freeSample'
import { freeSpiSamplePayload } from './freeSpiSamplePayload'
import { scoreQuestion, selectableQuestions, validateRuntimePayload } from './runtime'

const migration = readFileSync(resolve(import.meta.dirname, '../../supabase/migrations/20261011090000_practice_free_spi_sample.sql'), 'utf8')

describe('public SPI free sample', () => {
  it('is a valid runtime payload whose revision is the sha256 of its serialized form', () => {
    expect(validateRuntimePayload(freeSpiSamplePayload)).not.toBeNull()
    expect(createHash('sha256').update(JSON.stringify(freeSpiSamplePayload)).digest('hex')).toBe(FREE_SPI_SAMPLE_REVISION)
  })

  it('seeds exactly the bundled payload and identity on the server', () => {
    const match = /select public\.import_practice_question_release\(\s*'([^']+)',\s*'([a-f0-9]{64})',\s*\$free_spi_sample\$([\s\S]*)\$free_spi_sample\$::jsonb\s*\);/.exec(migration)
    expect(match).not.toBeNull()
    expect(match![1]).toBe(FREE_SPI_SAMPLE_CONTENT_ID)
    expect(match![2]).toBe(FREE_SPI_SAMPLE_REVISION)
    expect(JSON.parse(match![3]!)).toEqual(freeSpiSamplePayload)
  })

  it('offers two browser-runnable questions in every released SPI category', () => {
    for (const family of catalogDocument.families) {
      for (const domain of family.domains) {
        for (const category of domain.categories) {
          expect(selectableQuestions(freeSpiSamplePayload, family.testFamily, domain.domain, category.category, 'untimed-learning'), category.category).toHaveLength(2)
        }
      }
    }
    expect(freeSpiSamplePayload.questionBank.questions).toHaveLength(16)
  })

  it('uses identities distinct from the member bank and scores each expected answer as correct', () => {
    for (const question of freeSpiSamplePayload.questionBank.questions) {
      expect(question.id.startsWith('spi-free-')).toBe(true)
      const expected = question.answer.expectedAnswer
      if (expected.kind !== 'single-choice') throw new Error(`unexpected answer kind for ${question.id}`)
      expect(scoreQuestion(question, expected.choiceId)).toBe(true)
      for (const choice of question.answer.input.kind === 'single-choice' ? question.answer.input.choices : []) {
        if (choice.id !== expected.choiceId) expect(scoreQuestion(question, choice.id)).toBe(false)
      }
    }
  })

  it('admits only the public sample to the Free tier', () => {
    expect(FREE_PRACTICE_CONTENT_IDS).toEqual([FREE_SPI_SAMPLE_CONTENT_ID])
    expect(isFreePracticeContentId(FREE_SPI_SAMPLE_CONTENT_ID)).toBe(true)
    expect(isFreePracticeContentId(catalogDocument.releaseIdentity.contentId)).toBe(false)
  })
})
