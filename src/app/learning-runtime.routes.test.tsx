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

  it('keeps authored Japanese, Traditional Chinese, and English exercise runs tagged', () => {
    const unit = getLearningUnitByPracticeSlug(COURSE_CORRECTION_PRACTICE_SLUG)
    const exerciseWithChineseExplanation = unit?.practice.exercises.find((exercise) =>
      exercise.question.some((part) => part.text.includes('プロジェクト進捗会議')),
    )
    const exerciseWithEmbeddedEnglish = unit?.practice.exercises.find((exercise) =>
      exercise.question.some((part) => part.text.includes('Pivot')),
    )

    expect(exerciseWithChineseExplanation?.question.some((part) => part.lang === 'ja')).toBe(true)
    expect(exerciseWithChineseExplanation?.explanation?.some((part) => part.lang === 'zh-TW')).toBe(true)
    expect(exerciseWithChineseExplanation?.explanation?.find((part) => part.text === 'framing')).toMatchObject({
      lang: 'en',
    })

    expect(exerciseWithEmbeddedEnglish?.question.find((part) => part.text === 'Pivot')).toMatchObject({
      lang: 'en',
    })
    expect(exerciseWithEmbeddedEnglish?.answer?.find((part) => part.text === 'defer')).toMatchObject({
      lang: 'en',
    })
    expect(exerciseWithEmbeddedEnglish?.explanation?.find((part) => part.text === 'parking')).toMatchObject({
      lang: 'en',
    })
    expect(exerciseWithEmbeddedEnglish?.explanation?.some((part) => part.lang === 'ja')).toBe(true)
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
