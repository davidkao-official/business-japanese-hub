export interface RecordChapterOpenedInput {
  bookId: string
  chapterId: string
}

/** Library-owned write seam; identity and skills are always server-derived. */
export interface LibraryLearningEvidenceRepository {
  recordChapterOpened(input: RecordChapterOpenedInput, localIdentityScope: string): Promise<void>
}
