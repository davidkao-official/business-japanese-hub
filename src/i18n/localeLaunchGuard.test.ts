import { describe, expect, it } from 'vitest'
import { LAUNCHED_LOCALES } from './locales'
import { jaLearningUi } from './learningUi'
import { getStrings } from './strings'

describe('locale-launch admission (#205)', () => {
  it('never launches a non-Japanese locale backed by the Japanese fallback object', () => {
    for (const locale of LAUNCHED_LOCALES) {
      if (locale !== 'ja') expect(getStrings(locale).learningUi, locale).not.toBe(jaLearningUi)
    }
  })

  it('recognizes the dormant English resource as a fallback, not a completed translation', () => {
    expect(getStrings('en').learningUi).toBe(jaLearningUi)
    expect(LAUNCHED_LOCALES).not.toContain('en')
  })
})
