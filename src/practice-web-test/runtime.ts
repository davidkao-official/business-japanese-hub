import type { PracticeRuntimeCheckpoint, PracticeRuntimePayload, PracticeRuntimeQuestion } from '../content-delivery/privatePracticeQuestionBank'
import type { PracticeAnswer } from './contract'
import { validatePracticeQuestionBankSource } from './validate'

export type RunnerResponse = string | string[] | number
export type RuntimeQuestion = PracticeRuntimeQuestion

function hasAnyOwnKey(value: unknown, keys: readonly string[]): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && keys.some((key) => Object.hasOwn(value, key))
}

export function scoreAnswer(answer: PracticeAnswer, response: RunnerResponse): boolean {
  if (answer.input.kind === 'single-choice' && answer.expectedAnswer.kind === 'single-choice') return typeof response === 'string' && response === answer.expectedAnswer.choiceId
  if (answer.input.kind === 'multi-select' && answer.expectedAnswer.kind === 'multi-select') return Array.isArray(response) && [...response].sort().join('\0') === [...answer.expectedAnswer.choiceIds].sort().join('\0')
  if (answer.input.kind === 'number' && answer.expectedAnswer.kind === 'number' && answer.scoring.kind === 'numeric') return typeof response === 'number' && Math.abs(response - answer.expectedAnswer.value) <= (answer.scoring.tolerance ?? 0)
  if (answer.input.kind === 'ordering' && answer.expectedAnswer.kind === 'ordering') return Array.isArray(response) && response.join('\0') === answer.expectedAnswer.choiceIds.join('\0')
  if (answer.input.kind === 'short-text' && answer.expectedAnswer.kind === 'short-text') return typeof response === 'string' && response === answer.expectedAnswer.value
  return false
}

export function validateRuntimePayload(raw: unknown): PracticeRuntimePayload | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  if (Object.keys(raw).some((key) => !['questionBank', 'checkpointRegistry', 'supportOverlays'].includes(key))) return null
  const payload = raw as Partial<PracticeRuntimePayload>
  if (!payload.questionBank || typeof payload.questionBank !== 'object') return null
  const questions = Array.isArray(payload.questionBank.questions) ? payload.questionBank.questions : []
  if (questions.some((question) => hasAnyOwnKey(question, ['status', 'releaseNotes', 'provenance']))) return null
  if (payload.checkpointRegistry !== undefined && (typeof payload.checkpointRegistry !== 'object' || payload.checkpointRegistry === null || Array.isArray(payload.checkpointRegistry))) return null
  if (payload.supportOverlays !== undefined && !Array.isArray(payload.supportOverlays)) return null
  const checkpointRegistry = payload.checkpointRegistry === undefined ? undefined : {
    ...payload.checkpointRegistry,
    checkpoints: Array.isArray(payload.checkpointRegistry.checkpoints) ? (payload.checkpointRegistry.checkpoints.some((checkpoint) => hasAnyOwnKey(checkpoint, ['provenance'])) ? null : payload.checkpointRegistry.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      provenance: {
        authoredBy: 'runtime',
        reviewedBy: ['runtime'],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        originalContentAttestation: true as const,
      },
    }))) : payload.checkpointRegistry.checkpoints,
  }
  if (checkpointRegistry?.checkpoints === null) return null
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
    ...(checkpointRegistry ? { checkpointRegistry } : {}),
    ...(payload.supportOverlays ? { supportOverlays: payload.supportOverlays } : {}),
  }
  if (!validatePracticeQuestionBankSource(source, { requireReleased: true }).ok) return null
  return payload as PracticeRuntimePayload
}

export function scoreQuestion(question: RuntimeQuestion, response: RunnerResponse): boolean {
  return scoreAnswer(question.answer, response)
}

export function selectableQuestions(payload: PracticeRuntimePayload, family: string, domain: string, category: string, mode: string): RuntimeQuestion[] {
  const latestById = new Map<string, RuntimeQuestion>()
  for (const question of payload.questionBank.questions) {
    const latest = latestById.get(question.id)
    if (!latest || question.version > latest.version) latestById.set(question.id, question)
  }
  return payload.questionBank.questions.filter((question) => latestById.get(question.id) === question
    && question.deliveryProfile === 'web'
    && question.testFamily === family && question.domain === domain && question.category === category
    && question.practiceProfile === mode && question.answer.input.kind !== 'short-text')
}

export function resolveQuestionCheckpoints(payload: PracticeRuntimePayload, question: RuntimeQuestion): PracticeRuntimeCheckpoint[] | null {
  const ids = question.itemAnalysis.diagnosticCheckpoints?.ids ?? []
  if (ids.length === 0) return []
  const registry = payload.checkpointRegistry
  if (!registry || question.itemAnalysis.diagnosticCheckpoints?.registryVersion !== registry.version) return null
  const checkpoints = ids.map((id) => registry.checkpoints.find((checkpoint) => checkpoint.id === id))
  if (checkpoints.some((checkpoint) => !checkpoint || checkpoint.questionId !== question.id || checkpoint.questionVersion !== question.version)) return null
  return checkpoints as PracticeRuntimeCheckpoint[]
}

export function supportOverlay(payload: PracticeRuntimePayload, question: RuntimeQuestion, locale = 'zh-Hant') {
  const matching = payload.supportOverlays?.filter((overlay) => overlay.questionId === question.id && overlay.questionVersion === question.version) ?? []
  const latest = matching.reduce<(typeof matching)[number] | undefined>((current, overlay) => !current || overlay.version > current.version ? overlay : current, undefined)
  return latest?.byLocale[locale]
}
