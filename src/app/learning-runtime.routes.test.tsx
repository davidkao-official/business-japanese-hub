import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithAppProviders } from '../test/appProviders'
import { LearnUnitPage } from './LearnUnitPage'
import { PracticeActivityPage } from './PracticeActivityPage'
import { getBookBySlug } from '../reader/catalog'
import {
  COURSE_CORRECTION_LEARN_SLUG,
  COURSE_CORRECTION_PRACTICE_SLUG,
  getLearningUnitByLearnSlug,
  getLearningUnitByPracticeSlug,
} from './learningUnits'

afterEach(() => cleanup())

describe('learning runtime route identities', () => {
  it('maps Learn and Practice through separate route identities', () => {
    const learnUnit = getLearningUnitByLearnSlug(COURSE_CORRECTION_LEARN_SLUG)
    const practiceUnit = getLearningUnitByPracticeSlug(COURSE_CORRECTION_PRACTICE_SLUG)
    const releasedChapter = getBookBySlug('meeting-japanese')?.chapters.find(
      ({ slug }) => slug === 'course-correction',
    )
    const releasedExerciseIds = releasedChapter?.blocks.flatMap((block) =>
      block.type === 'exercise' ? [block.id] : [],
    )

    expect(releasedChapter).toBeDefined()
    expect(learnUnit?.title).toBe(releasedChapter?.title)
    expect(learnUnit?.learnSlug).toBe(`meeting-japanese-${releasedChapter?.slug}`)
    expect(learnUnit?.practiceSlug).toBe(releasedChapter?.slug)
    expect(practiceUnit?.practice.exercises.map(({ id }) => id)).toEqual(releasedExerciseIds)
    expect(learnUnit?.practiceSlug).toBe(COURSE_CORRECTION_PRACTICE_SLUG)
    expect(practiceUnit?.learnSlug).toBe(COURSE_CORRECTION_LEARN_SLUG)
    expect(getLearningUnitByPracticeSlug(COURSE_CORRECTION_LEARN_SLUG)).toBeUndefined()
    expect(getLearningUnitByLearnSlug(COURSE_CORRECTION_PRACTICE_SLUG)).toBeUndefined()
  })

  it.each([
    ['/learn/unknown-course', <LearnUnitPage />],
    ['/practice/unknown-activity', <PracticeActivityPage />],
  ])('renders the existing 404 for an unknown route slug: %s', (path, element) => {
    renderWithAppProviders(
      <Routes>
        <Route path="/learn/:slug" element={element} />
        <Route path="/practice/:slug" element={element} />
      </Routes>,
      { initialEntries: [path] },
    )

    expect(screen.getByRole('heading', { name: 'ページが見つかりません' })).toBeInTheDocument()
  })
})
