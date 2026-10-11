import { describe, expect, it } from 'vitest'
import catalogDocument from './released-discovery-catalog.json'
import { validatePracticeDiscoveryCatalog } from './discoveryCatalog'
import { freeSpiSamplePayload } from './freeSpiSamplePayload'
import { discoveryFreeSampleCount, freeSampleCount, nextFreeSampleUnit, nextPracticeUnit } from './freeSampleUnits'

if (!validatePracticeDiscoveryCatalog(catalogDocument)) throw new Error('invalid discovery catalog')
const family = catalogDocument.families[0]!

describe('free sample unit navigation', () => {
  it('counts the same selectable samples at unit, domain, and family levels', () => {
    expect(freeSampleCount('spi', 'nonverbal', 'rate-and-work')).toBe(2)
    expect(discoveryFreeSampleCount(family)).toBe(16)
    expect(family.domains.map((domain) => discoveryFreeSampleCount(family, domain))).toEqual([8, 8])
    expect(freeSampleCount('unknown', 'nonverbal', 'rate-and-work')).toBe(0)
  })

  it('follows the displayed unit order rather than the sample payload order', () => {
    expect(nextFreeSampleUnit(family, 'nonverbal', 'conditions-and-ordering')).toMatchObject({
      domain: 'nonverbal', category: { category: 'percentage-profit-loss' },
    })
  })

  it('includes units without free samples for member navigation, in the same displayed order', () => {
    const domain = family.domains[0]!
    const memberUnit = { ...domain.categories[0]!, category: 'member-only-unit' }
    const memberFamily = {
      ...family,
      domains: [{ ...domain, categories: [domain.categories[0]!, memberUnit, ...domain.categories.slice(1)] }, ...family.domains.slice(1)],
    }
    expect(nextPracticeUnit(memberFamily, 'nonverbal', 'conditions-and-ordering')).toMatchObject({
      domain: 'nonverbal', category: { category: 'member-only-unit' },
    })
    expect(nextFreeSampleUnit(memberFamily, 'nonverbal', 'conditions-and-ordering')).toMatchObject({
      domain: 'nonverbal', category: { category: 'percentage-profit-loss' },
    })
  })

  it.each([
    ['nonverbal', 'sets-and-counting', 'verbal', 'reading-inference'],
    ['verbal', 'vocabulary-in-context', 'nonverbal', 'conditions-and-ordering'],
  ])('wraps from %s/%s to %s/%s', (domain, category, nextDomain, nextCategory) => {
    expect(nextFreeSampleUnit(family, domain, category)).toMatchObject({
      domain: nextDomain, category: { category: nextCategory },
    })
    expect(nextPracticeUnit(family, domain, category)).toMatchObject({
      domain: nextDomain, category: { category: nextCategory },
    })
  })

  it('skips units that have no selectable free sample questions', () => {
    const payload = {
      ...freeSpiSamplePayload,
      questionBank: {
        ...freeSpiSamplePayload.questionBank,
        questions: freeSpiSamplePayload.questionBank.questions.filter((question) =>
          !['percentage-profit-loss', 'rate-and-work'].includes(question.category)),
      },
    }
    expect(nextFreeSampleUnit(family, 'nonverbal', 'conditions-and-ordering', payload)).toMatchObject({
      domain: 'nonverbal', category: { category: 'sets-and-counting' },
    })
  })

  it.each([
    { questions: [] },
    { questions: freeSpiSamplePayload.questionBank.questions.filter((question) => question.category === 'rate-and-work') },
  ])(
    'omits the next step when no other unit has free samples', ({ questions }) => {
      const payload = { ...freeSpiSamplePayload, questionBank: { ...freeSpiSamplePayload.questionBank, questions } }
      expect(nextFreeSampleUnit(family, 'nonverbal', 'rate-and-work', payload)).toBeUndefined()
    },
  )

  it('omits navigation for an unknown current unit', () => {
    expect(nextFreeSampleUnit(family, 'nonverbal', 'unknown')).toBeUndefined()
  })
})
