import type { PracticeRuntimePayload, PracticeRuntimeQuestion } from '../content-delivery/privatePracticeQuestionBank'
import { validatePracticeQuestionBankSource } from './validate'

export type RunnerResponse = string | string[] | number
export type RuntimeQuestion = PracticeRuntimeQuestion

export function validateRuntimePayload(raw: unknown): PracticeRuntimePayload | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const payload = raw as Partial<PracticeRuntimePayload>
  if (!payload.questionBank || typeof payload.questionBank !== 'object') return null
  const questions = Array.isArray(payload.questionBank.questions) ? payload.questionBank.questions : []
  const source = {
    questionBank: {
      ...payload.questionBank,
      questions: questions.map((question) => ({
        ...question,
        status: 'released' as const,
        releaseNotes: 'runtime validation',
        provenance: {
          authoredBy: 'runtime', reviewedBy: ['runtime'], createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z', basis: ['runtime validation'], originalContentAttestation: true as const,
        },
      })),
    },
    ...(payload.checkpointRegistry ? { checkpointRegistry: payload.checkpointRegistry } : {}),
    ...(payload.supportOverlays ? { supportOverlays: payload.supportOverlays } : {}),
  }
  if (!validatePracticeQuestionBankSource(source, { requireReleased: true }).ok) return null
  return payload as PracticeRuntimePayload
}

export function scoreQuestion(question: RuntimeQuestion, response: RunnerResponse): boolean {
  const answer = question.answer
  if (answer.input.kind === 'single-choice' && answer.expectedAnswer.kind === 'single-choice') return typeof response === 'string' && response === answer.expectedAnswer.choiceId
  if (answer.input.kind === 'multi-select' && answer.expectedAnswer.kind === 'multi-select') return Array.isArray(response) && [...response].sort().join('\0') === [...answer.expectedAnswer.choiceIds].sort().join('\0')
  if (answer.input.kind === 'number' && answer.expectedAnswer.kind === 'number' && answer.scoring.kind === 'numeric') return typeof response === 'number' && Math.abs(response - answer.expectedAnswer.value) <= (answer.scoring.tolerance ?? 0)
  if (answer.input.kind === 'ordering' && answer.expectedAnswer.kind === 'ordering') return Array.isArray(response) && response.join('\0') === answer.expectedAnswer.choiceIds.join('\0')
  return false
}

export function selectableQuestions(payload: PracticeRuntimePayload, family: string, domain: string, category: string, mode: string): RuntimeQuestion[] {
  const latestById = new Map<string, RuntimeQuestion>()
  for (const question of payload.questionBank.questions) {
    const latest = latestById.get(question.id)
    if (!latest || question.version > latest.version) latestById.set(question.id, question)
  }
  return payload.questionBank.questions.filter((question) => latestById.get(question.id) === question
    && question.testFamily === family && question.domain === domain && question.category === category
    && question.practiceProfile === mode && question.answer.input.kind !== 'short-text')
}

export function supportOverlay(payload: PracticeRuntimePayload, question: RuntimeQuestion, locale = 'zh-Hant') {
  const matching = payload.supportOverlays?.filter((overlay) => overlay.questionId === question.id && overlay.questionVersion === question.version) ?? []
  const latest = matching.reduce<(typeof matching)[number] | undefined>((current, overlay) => !current || overlay.version > current.version ? overlay : current, undefined)
  return latest?.byLocale[locale]
}
