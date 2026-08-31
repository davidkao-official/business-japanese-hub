import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  LibraryLearningEvidenceRepository,
  RecordChapterOpenedInput,
} from './repository'

type EventIdFactory = () => string

function browserEventId(): string {
  return globalThis.crypto.randomUUID()
}

export class SupabaseLibraryLearningEvidenceRepository
  implements LibraryLearningEvidenceRepository
{
  private readonly inFlight = new Map<string, Promise<void>>()

  constructor(
    private readonly client: SupabaseClient,
    private readonly createEventId: EventIdFactory = browserEventId,
  ) {}

  async recordChapterOpened(
    input: RecordChapterOpenedInput,
    localIdentityScope: string,
  ): Promise<void> {
    // This scope only separates client-side duplicate effects across accounts.
    // It is deliberately omitted from the request; Edge auth remains authoritative.
    const key = `${localIdentityScope}\0${input.bookId}\0${input.chapterId}`
    const existing = this.inFlight.get(key)
    if (existing) return existing

    const request = this.client.functions
      .invoke('library-learning-evidence', {
        body: {
          bookId: input.bookId,
          chapterId: input.chapterId,
          eventId: this.createEventId(),
        },
      })
      .then(({ error }) => {
        if (error) throw new Error('Learning evidence could not be recorded')
      })
      .finally(() => {
        this.inFlight.delete(key)
      })
    this.inFlight.set(key, request)
    return request
  }
}
