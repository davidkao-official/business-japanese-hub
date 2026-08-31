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

    await repository.recordChapterOpened(
      {
        bookId: 'book-sample-bj-email',
        chapterId: 'bm-ch-3',
      },
      'user-1',
    )

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
      repository.recordChapterOpened(
        { bookId: 'book-a', chapterId: 'chapter-a' },
        'user-1',
      ),
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

    const first = repository.recordChapterOpened(input, 'user-1')
    const duplicate = repository.recordChapterOpened(input, 'user-1')
    expect(invoke).toHaveBeenCalledTimes(1)

    resolveInvoke?.({ data: { recorded: 1 }, error: null })
    await Promise.all([first, duplicate])
  })

  it('does not coalesce the same chapter across account identities', async () => {
    const resolvers: Array<(value: { data: unknown; error: null }) => void> = []
    const invoke = vi.fn<
      (name: string, options: { body: unknown }) => Promise<{ data: unknown; error: null }>
    >(
      () =>
        new Promise<{ data: unknown; error: null }>((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const eventIds = [
      '70000000-0000-4000-8000-000000000003',
      '70000000-0000-4000-8000-000000000004',
    ]
    const client = { functions: { invoke } } as unknown as SupabaseClient
    const repository = new SupabaseLibraryLearningEvidenceRepository(
      client,
      () => eventIds.shift()!,
    )
    const input = { bookId: 'book-a', chapterId: 'chapter-a' }

    const first = repository.recordChapterOpened(input, 'user-a')
    const second = repository.recordChapterOpened(input, 'user-b')

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke.mock.calls.map(([, options]) => options?.body)).toEqual([
      {
        bookId: 'book-a',
        chapterId: 'chapter-a',
        eventId: '70000000-0000-4000-8000-000000000003',
      },
      {
        bookId: 'book-a',
        chapterId: 'chapter-a',
        eventId: '70000000-0000-4000-8000-000000000004',
      },
    ])

    for (const resolve of resolvers) resolve({ data: { recorded: 1 }, error: null })
    await Promise.all([first, second])
  })
})
