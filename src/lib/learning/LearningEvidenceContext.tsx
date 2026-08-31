import { createContext, useContext, type ReactNode } from 'react'
import type { LibraryLearningEvidenceRepository } from './repository'

const LearningEvidenceContext = createContext<LibraryLearningEvidenceRepository | null>(null)

export function LearningEvidenceProvider({
  repository,
  children,
}: {
  repository: LibraryLearningEvidenceRepository | null
  children: ReactNode
}) {
  return (
    <LearningEvidenceContext.Provider value={repository}>
      {children}
    </LearningEvidenceContext.Provider>
  )
}

export function useLearningEvidenceRepository(): LibraryLearningEvidenceRepository | null {
  return useContext(LearningEvidenceContext)
}
