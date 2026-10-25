/**
 * Cross-category practice set (#204).
 *
 * A mixed set is drawn from every released category of one test family. It is
 * a selection over the existing runtime payload; it does not introduce a new
 * bank, content id, or persistence shape. Each answered question keeps its own
 * question id, version, and category, so attempts are saved under the original
 * question metadata exactly like a single-category unit.
 */
import type { PracticeRuntimePayload } from '../content-delivery/privatePracticeQuestionBank'
import { isBrowserSupportedQuestion, type RuntimeQuestion } from './runtime'

export const MIXED_SET_SIZE = 10
/** The practice profile a mixed set uses; the route carries no other mode. */
export const MIXED_PRACTICE_MODE = 'untimed-learning'

type Random = () => number

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[result[index], result[swap]] = [result[swap]!, result[index]!]
  }
  return result
}

/**
 * Picks up to `size` current questions across every category of `family`,
 * interleaving domains so a set spans verbal and nonverbal whenever both have
 * inventory. Inventory below `size` yields every available question.
 */
export function selectMixedQuestions(
  payload: PracticeRuntimePayload,
  family: string,
  size = MIXED_SET_SIZE,
  random: Random = Math.random,
): RuntimeQuestion[] {
  const latestById = new Map<string, RuntimeQuestion>()
  for (const question of payload.questionBank.questions) {
    const latest = latestById.get(question.id)
    if (!latest || question.version > latest.version) latestById.set(question.id, question)
  }
  const eligible = payload.questionBank.questions.filter((question) =>
    latestById.get(question.id) === question
    && question.deliveryProfile === 'web'
    && question.testFamily === family
    && question.practiceProfile === MIXED_PRACTICE_MODE
    && isBrowserSupportedQuestion(question))
  const byDomain = new Map<string, RuntimeQuestion[]>()
  for (const question of eligible) {
    const group = byDomain.get(question.domain) ?? []
    group.push(question)
    byDomain.set(question.domain, group)
  }
  const queues = [...byDomain.keys()].sort().map((domain) => shuffled(byDomain.get(domain)!, random))
  const selected: RuntimeQuestion[] = []
  while (selected.length < size && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift()
      if (next && selected.length < size) selected.push(next)
    }
  }
  // The interleave guarantees domain coverage; the final shuffle randomises order.
  return shuffled(selected, random)
}
