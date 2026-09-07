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

    const firstCard = cards[0]
    if (!firstCard) throw new Error('missing first practice exercise')
    fireEvent.click(within(firstCard).getAllByRole('radio')[1]!)
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Submit' }))

    expect(within(firstCard).getByRole('button', { name: 'Reveal answer' })).toBeInTheDocument()
    expect(within(firstCard).queryByText('二つ目')).not.toBeInTheDocument()
    fireEvent.click(within(firstCard).getByRole('button', { name: 'Reveal answer' }))

    expect(within(firstCard).getByText('二つ目')).toBeInTheDocument()
    expect(within(firstCard).getByText(/Feedback:/)).toBeInTheDocument()
  })
})
