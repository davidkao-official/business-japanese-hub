import {
  applyChoice,
  createInitialState,
  getAvailableChoices,
  getCurrentScene,
  validateScenario,
  type Choice,
  type GameState,
} from '@business-japanese-hub/career-game'
import { validateLearningSkillIds } from '@business-japanese-hub/learning'
import { describe, expect, it } from 'vitest'
import { customerCommunicationScenario } from './customer-communication'

function choiceForCategory(state: GameState, category: 'strong' | 'risky'): Choice {
  const choice = getAvailableChoices(customerCommunicationScenario, state).find((candidate) => {
    const outcome = customerCommunicationScenario.outcomes.find(
      (value) => value.id === candidate.outcomeId,
    )
    return outcome?.category === category
  })
  if (!choice) throw new Error(`No ${category} choice for ${state.currentSceneId}`)
  return choice
}

describe('取引先との一手 scenario content', () => {
  it('is a valid generic five-decision scenario with a terminal completion', () => {
    expect(validateScenario(customerCommunicationScenario)).toMatchObject({ ok: true })
    expect(customerCommunicationScenario.id).toBe('customer-communication')
    expect(customerCommunicationScenario.slug).toBe('customer-communication')

    const decisions = customerCommunicationScenario.scenes.filter(
      (scene) => scene.kind === 'decision',
    )
    expect(decisions).toHaveLength(5)
    expect(customerCommunicationScenario.scenes.at(-1)?.kind).toBe('terminal')
    expect(
      decisions.every((scene) => scene.choices.length >= 2 && scene.choices.length <= 4),
    ).toBe(true)
    expect(customerCommunicationScenario.libraryLinks).toEqual(
      expect.arrayContaining([
        { bookId: 'book-sample-bj-email', chapterId: 'bm-ch-3' },
        { bookId: 'book-sample-bj-keigo', chapterId: 'ch-2' },
      ]),
    )
  })

  it('uses only unique shared learning skill IDs at concrete content seams', () => {
    const authoredSkillTags = [
      { source: customerCommunicationScenario.id, value: customerCommunicationScenario.skillTags },
      ...customerCommunicationScenario.outcomes.map((outcome) => ({
        source: outcome.id,
        value: outcome.skillTags,
      })),
    ]

    for (const { source, value } of authoredSkillTags) {
      expect(validateLearningSkillIds(value), source).toEqual({ ok: true, value })
    }
  })

  it('runs a strong path through all five decisions and completes deterministically', () => {
    let state = createInitialState(customerCommunicationScenario)

    for (let decision = 0; decision < 5; decision += 1) {
      expect(getCurrentScene(customerCommunicationScenario, state)?.kind).toBe('decision')
      const choice = choiceForCategory(state, 'strong')
      const result = applyChoice(customerCommunicationScenario, state, {
        scenarioId: customerCommunicationScenario.id,
        contentVersion: customerCommunicationScenario.contentVersion,
        sceneId: state.currentSceneId,
        choiceId: choice.id,
      })
      expect(['advanced', 'completed']).toContain(result.kind)
      if (result.kind !== 'advanced' && result.kind !== 'completed') throw new Error(result.kind)
      expect(result.outcome.category).toBe('strong')
      state = result.state
    }

    expect(state.status).toBe('completed')
    expect(getCurrentScene(customerCommunicationScenario, state)?.kind).toBe('terminal')
    expect(state.history).toHaveLength(5)
    expect(state.meters).toEqual({ trust: 5 })
  })

  it('produces a different deterministic outcome for an overconfident opening promise', () => {
    const initial = createInitialState(customerCommunicationScenario)
    const strong = choiceForCategory(initial, 'strong')
    const risky = getAvailableChoices(customerCommunicationScenario, initial).find((choice) =>
      choice.id === 'customer-scope-promise-choice',
    )
    if (!risky) throw new Error('missing risky opening choice')

    const strongResult = applyChoice(customerCommunicationScenario, initial, {
      scenarioId: customerCommunicationScenario.id,
      contentVersion: customerCommunicationScenario.contentVersion,
      sceneId: initial.currentSceneId,
      choiceId: strong.id,
    })
    const riskyResult = applyChoice(customerCommunicationScenario, initial, {
      scenarioId: customerCommunicationScenario.id,
      contentVersion: customerCommunicationScenario.contentVersion,
      sceneId: initial.currentSceneId,
      choiceId: risky.id,
    })

    expect(strongResult.kind).toBe('advanced')
    expect(riskyResult.kind).toBe('advanced')
    if (strongResult.kind !== 'advanced' || riskyResult.kind !== 'advanced') return
    expect(strongResult.outcome.category).toBe('strong')
    expect(riskyResult.outcome.category).toBe('risky')
    expect(strongResult.state.meters.trust).toBe(1)
    expect(riskyResult.state.meters.trust).toBe(-1)
    expect(riskyResult.outcome.feedback).toContain('問題ありません')
  })

  it('rejects stale scene and content-version inputs without mutating progress', () => {
    const state = createInitialState(customerCommunicationScenario)
    const choice = getAvailableChoices(customerCommunicationScenario, state)[0]!
    const snapshot = structuredClone(state)

    expect(
      applyChoice(customerCommunicationScenario, state, {
        scenarioId: customerCommunicationScenario.id,
        contentVersion: customerCommunicationScenario.contentVersion,
        sceneId: 'customer-risk',
        choiceId: choice.id,
      }),
    ).toEqual({ kind: 'stale', reason: 'scene_mismatch' })
    expect(state).toEqual(snapshot)

    expect(
      applyChoice(customerCommunicationScenario, state, {
        scenarioId: customerCommunicationScenario.id,
        contentVersion: customerCommunicationScenario.contentVersion + 1,
        sceneId: state.currentSceneId,
        choiceId: choice.id,
      }),
    ).toEqual({ kind: 'stale', reason: 'content_version_mismatch' })
    expect(state).toEqual(snapshot)
  })
})
