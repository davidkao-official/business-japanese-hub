import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithAppProviders } from '../test/appProviders'
import { LearnUnitPage } from './LearnUnitPage'
import { PracticeActivityPage } from './PracticeActivityPage'

afterEach(() => cleanup())

describe('learning runtime route identities', () => {
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
