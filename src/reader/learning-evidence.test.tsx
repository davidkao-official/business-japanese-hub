import { act, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LearningEvidenceProvider } from '../lib/learning/LearningEvidenceContext'
import type { LibraryLearningEvidenceRepository } from '../lib/learning/repository'
import { createMockRepository, renderWithAppProviders } from '../test/appProviders'
import { ReaderPage } from './ReaderPage'

const user = { id: 'u-learning', email: 'reader@example.com' }

function renderReader(
  session: typeof user | null,
  evidenceRepository: LibraryLearningEvidenceRepository,
) {
  return renderWithAppProviders(
    <LearningEvidenceProvider repository={evidenceRepository}>
      <Routes>
        <Route path="/books/:slug/read/:chapterSlug" element={<ReaderPage />} />
      </Routes>
    </LearningEvidenceProvider>,
    {
      initialEntries: ['/books/email-manners/read/requests-and-closings'],
      session,
      repository: session ? createMockRepository() : null,
    },
  )
}

describe('Library chapter-open learning evidence', () => {
  it('records an accessible chapter for the authenticated account', async () => {
    const evidenceRepository: LibraryLearningEvidenceRepository = {
      recordChapterOpened: vi.fn().mockResolvedValue(undefined),
    }

    renderReader(user, evidenceRepository)

    expect(await screen.findByRole('heading', { level: 1, name: '依頼と締めの表現' })).toBeInTheDocument()
    await waitFor(() =>
      expect(evidenceRepository.recordChapterOpened).toHaveBeenCalledWith(
        {
          bookId: 'book-sample-bj-email',
          chapterId: 'bm-ch-3',
        },
        'u-learning',
      ),
    )
  })

  it('keeps anonymous reading network-free', async () => {
    const evidenceRepository: LibraryLearningEvidenceRepository = {
      recordChapterOpened: vi.fn().mockResolvedValue(undefined),
    }

    renderReader(null, evidenceRepository)

    expect(await screen.findByRole('heading', { level: 1, name: '依頼と締めの表現' })).toBeInTheDocument()
    expect(evidenceRepository.recordChapterOpened).not.toHaveBeenCalled()
  })

  it('does not create a second opening when auth refreshes the same user identity', async () => {
    const evidenceRepository: LibraryLearningEvidenceRepository = {
      recordChapterOpened: vi.fn().mockResolvedValue(undefined),
    }
    const { authClient } = renderReader(user, evidenceRepository)

    await waitFor(() => expect(evidenceRepository.recordChapterOpened).toHaveBeenCalledTimes(1))
    await act(async () => {
      authClient.emitAuthStateChange({ ...user })
    })

    expect(evidenceRepository.recordChapterOpened).toHaveBeenCalledTimes(1)
  })

  it('does not interrupt reading when best-effort evidence recording fails', async () => {
    const evidenceRepository: LibraryLearningEvidenceRepository = {
      recordChapterOpened: vi.fn().mockRejectedValue(new Error('secret backend detail')),
    }

    renderReader(user, evidenceRepository)

    expect(await screen.findByRole('heading', { level: 1, name: '依頼と締めの表現' })).toBeInTheDocument()
    await waitFor(() => expect(evidenceRepository.recordChapterOpened).toHaveBeenCalledTimes(1))
  })
})
