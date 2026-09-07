import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithAppProviders } from '../test/appProviders'
import { PracticeActivityPage } from './PracticeActivityPage'
import { COURSE_CORRECTION_PRACTICE_SLUG } from './learningUnits'

afterEach(() => cleanup())

describe('Practice activity projection', () => {
  it('renders every released exercise and locally reveals answer feedback', () => {
    renderWithAppProviders(
      <Routes>
        <Route path="/practice/:slug" element={<PracticeActivityPage />} />
      </Routes>,
      { initialEntries: [`/practice/${COURSE_CORRECTION_PRACTICE_SLUG}`] },
    )

    const cards = Array.from(document.querySelectorAll<HTMLElement>('.practice-activity-card'))
    expect(cards).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Submit' })).toHaveLength(4)
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
    expect(screen.getByText(/書き換えてください/)).toBeInTheDocument()
    expect(screen.getByText(/三つの立場/)).toBeInTheDocument()
    expect(cards.every((card) => within(card).getAllByRole('heading', { level: 2 }).length === 1)).toBe(true)
    expect(cards.every((card) => card.querySelector('.practice-activity-card__label') === null)).toBe(true)

    const firstCard = cards[0]
    if (!firstCard) throw new Error('missing first practice exercise')
    expect(
      within(firstCard).getByRole('group', {
        name: /プロジェクト進捗会議で、先輩が過去案件の話を続けています。/,
      }),
    ).toBeInTheDocument()
    fireEvent.click(within(firstCard).getAllByRole('radio')[1]!)
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Submit' }))

    expect(within(firstCard).getByRole('button', { name: 'Reveal answer' })).toBeInTheDocument()
    expect(within(firstCard).queryByText('二つ目')).not.toBeInTheDocument()
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Reveal answer' }))

    expect(within(firstCard).getByText('二つ目')).toBeInTheDocument()
    expect(within(firstCard).getByText(/Feedback:/)).toBeInTheDocument()

    const thirdCard = cards[2]
    if (!thirdCard) throw new Error('missing third practice exercise')
    fireEvent.change(within(thirdCard).getByRole('textbox'), { target: { value: '回到主線' } })
    fireEvent.click(within(thirdCard).getByRole('button', { name: 'Submit' }))
    fireEvent.click(within(thirdCard).getByRole('button', { name: 'Reveal answer' }))

    expect(thirdCard.querySelectorAll('br')).toHaveLength(2)
    expect(within(thirdCard).getByText(/①ここまでの意見/)).toBeInTheDocument()
    expect(within(thirdCard).getByText(/②少し論点/)).toBeInTheDocument()
  })
})
