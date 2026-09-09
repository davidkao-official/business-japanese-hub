import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { LearnUnitPage } from './app/LearnUnitPage'
import { PracticeActivityPage } from './app/PracticeActivityPage'
import {
  COURSE_CORRECTION_LEARN_SLUG,
  COURSE_CORRECTION_PRACTICE_SLUG,
} from './app/learningUnits'
import { getBookBySlug } from './reader/catalog'
import { createMockRepository, renderWithAppProviders } from './test/appProviders'

function renderAt(path: string) {
  vi.stubEnv('BASE_URL', '/')
  window.history.replaceState(null, '', path)
  return render(<App />)
}

const meetingJapanese = getBookBySlug('meeting-japanese')
if (!meetingJapanese) throw new Error('meeting-japanese released Book is required by #110 acceptance')
const meetingJapaneseId = meetingJapanese.id

const owner = { id: 'u-110-owner', email: 'owner@example.com' }

function ownedEntitlement() {
  return {
    bookId: meetingJapaneseId,
    provider: 'manual' as const,
    grantedAt: '2026-09-08T00:00:00.000Z',
  }
}

function renderLearningRoute(
  path: string,
  options: {
    session?: typeof owner | null
    repository?: ReturnType<typeof createMockRepository> | null
  } = {},
) {
  return renderWithAppProviders(
    <Routes>
      <Route path="/learn/:slug" element={<LearnUnitPage />} />
      <Route path="/practice/:slug" element={<PracticeActivityPage />} />
    </Routes>,
    {
      initialEntries: [path],
      session: options.session ?? null,
      repository: options.repository ?? null,
    },
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.history.replaceState(null, '', '/')
})

describe('Issue #110 — reusable Learn and Practice presentation surfaces', () => {
  it('surfaces the released Meeting Facilitation course-correction module through Learn', () => {
    renderAt('/learn')

    const main = screen.getByRole('main')
    const moduleLink = within(main).getByRole('link', {
      name: /議論を本筋に戻す|Course Correction/i,
    })

    expect(moduleLink.getAttribute('href')).toMatch(/^\/learn\/.+/)
  })

  it('keeps the entitled Learn module discoverable without exposing its body signed out', async () => {
    renderLearningRoute(`/learn/${COURSE_CORRECTION_LEARN_SLUG}`)

    expect(
      await screen.findByRole('heading', { level: 1, name: /議論を本筋に戻す/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/承接\s*→\s*Pivot\s*→\s*收斂/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\$\s*12|12\s*USD/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /購入|purchase|buy/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /購入|purchase|buy/i })).not.toBeInTheDocument()
  })

  it('fails closed for an authenticated user without the released Book entitlement', async () => {
    const repository = createMockRepository()
    renderLearningRoute(`/learn/${COURSE_CORRECTION_LEARN_SLUG}`, {
      session: owner,
      repository,
    })

    await waitFor(() => {
      expect(repository.getEntitlement).toHaveBeenCalledWith(meetingJapanese.id)
    })

    expect(
      screen.getByRole('heading', { level: 1, name: /議論を本筋に戻す/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/承接\s*→\s*Pivot\s*→\s*收斂/i)).not.toBeInTheDocument()
  })

  it('renders the entitled Learn body and generic Practice activity for an existing owner', async () => {
    const repository = createMockRepository({
      entitlements: { [meetingJapanese.id]: ownedEntitlement() },
    })

    const learnView = renderLearningRoute(`/learn/${COURSE_CORRECTION_LEARN_SLUG}`, {
      session: owner,
      repository,
    })

    expect(await screen.findByText(/承接\s*→\s*Pivot\s*→\s*收斂/i)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Practice|練習改寫/i }),
    ).toHaveAttribute('href', `/practice/${COURSE_CORRECTION_PRACTICE_SLUG}`)
    learnView.unmount()

    renderLearningRoute(`/practice/${COURSE_CORRECTION_PRACTICE_SLUG}`, {
      session: owner,
      repository,
    })

    expect(await screen.findByRole('heading', { level: 2, name: 'Exercise 01' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Submit' }).length).toBeGreaterThan(0)
    expect(document.body).toHaveTextContent(/場面|情境|situational/i)
    expect(document.body).toHaveTextContent(/書き換え|改寫|rewrite/i)
    expect(document.body).not.toHaveTextContent(/SPI/i)
  })

  it('does not expose entitled Practice exercises through direct signed-out navigation', async () => {
    renderLearningRoute(`/practice/${COURSE_CORRECTION_PRACTICE_SLUG}`)

    expect(
      await screen.findByRole('heading', { level: 1, name: /Practice/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Exercise 01' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Submit|Reveal answer/i })).not.toBeInTheDocument()
  })
})
