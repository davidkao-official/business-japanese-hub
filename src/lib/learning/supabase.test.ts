import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { SupabaseLibraryLearningEvidenceRepository } from './supabase'

function clientWithInvoke(result: unknown) {
  const invoke = vi.fn().mockResolvedValue(result)
  return {
    client: { functions: { invoke } } as unknown as SupabaseClient,
    invoke,
  }
}

describe('SupabaseLibraryLearningEvidenceRepository', () => {
  it('submits only the stable content reference plus an idempotency UUID', async () => {
    const { client, invoke } = clientWithInvoke({ data: { recorded: 2 }, error: null })
    const repository = new SupabaseLibraryLearningEvidenceRepository(client, () =>
      '70000000-0000-4000-8000-000000000001',
    )

    await repository.recordChapterOpened({
      bookId: 'book-sample-bj-email',
      chapterId: 'bm-ch-3',
    })

    expect(invoke).toHaveBeenCalledWith('library-learning-evidence', {
      body: {
        bookId: 'book-sample-bj-email',
        chapterId: 'bm-ch-3',
        eventId: '70000000-0000-4000-8000-000000000001',
      },
    })
  })

  it('does not expose backend details when recording fails', async () => {
    const { client } = clientWithInvoke({ data: null, error: new Error('provider secret detail') })
    const repository = new SupabaseLibraryLearningEvidenceRepository(client)

    await expect(
      repository.recordChapterOpened({ bookId: 'book-a', chapterId: 'chapter-a' }),
    ).rejects.toThrow('Learning evidence could not be recorded')
  })

  it('coalesces duplicate in-flight chapter-open effects with one idempotency key', async () => {
    let resolveInvoke: ((value: { data: unknown; error: null }) => void) | undefined
    const invoke = vi.fn(
      () =>
        new Promise<{ data: unknown; error: null }>((resolve) => {
          resolveInvoke = resolve
        }),
    )
    const client = { functions: { invoke } } as unknown as SupabaseClient
    const repository = new SupabaseLibraryLearningEvidenceRepository(client, () =>
      '70000000-0000-4000-8000-000000000002',
    )
    const input = { bookId: 'book-a', chapterId: 'chapter-a' }

    const first = repository.recordChapterOpened(input)
    const duplicate = repository.recordChapterOpened(input)
    expect(invoke).toHaveBeenCalledTimes(1)

    resolveInvoke?.({ data: { recorded: 1 }, error: null })
    await Promise.all([first, duplicate])
  })
})
