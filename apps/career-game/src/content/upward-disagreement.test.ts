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
import { upwardDisagreementScenario } from './upward-disagreement'

function choiceForCategory(state: GameState, category: 'strong' | 'risky'): Choice {
  const choice = getAvailableChoices(upwardDisagreementScenario, state).find((candidate) => {
    const outcome = upwardDisagreementScenario.outcomes.find(
      (value) => value.id === candidate.outcomeId,
    )
    return outcome?.category === category
  })
  if (!choice) throw new Error(`No ${category} choice for ${state.currentSceneId}`)
  return choice
}

describe('上司の案に異議を伝える scenario content', () => {
  it('is a valid generic five-decision scenario with a terminal completion', () => {
    expect(validateScenario(upwardDisagreementScenario)).toMatchObject({ ok: true })
    expect(upwardDisagreementScenario.id).toBe('upward-disagreement')
    expect(upwardDisagreementScenario.slug).toBe('upward-disagreement')

    const decisions = upwardDisagreementScenario.scenes.filter(
      (scene) => scene.kind === 'decision',
    )
    expect(decisions).toHaveLength(5)
    expect(upwardDisagreementScenario.scenes.at(-1)?.kind).toBe('terminal')
    expect(
      decisions.every((scene) => scene.choices.length >= 2 && scene.choices.length <= 4),
    ).toBe(true)
    expect(upwardDisagreementScenario.libraryLinks).toEqual(
      expect.arrayContaining([
        { bookId: 'book-meeting-japanese', chapterId: 'mj-ch-04' },
        { bookId: 'book-sample-bj-keigo', chapterId: 'ch-2' },
      ]),
    )
  })

  it('uses only unique shared learning skill IDs at concrete content seams', () => {
    const authoredSkillTags = [
      { source: upwardDisagreementScenario.id, value: upwardDisagreementScenario.skillTags },
      ...upwardDisagreementScenario.outcomes.map((outcome) => ({
        source: outcome.id,
        value: outcome.skillTags,
      })),
    ]

    for (const { source, value } of authoredSkillTags) {
      expect(validateLearningSkillIds(value), source).toEqual({ ok: true, value })
    }
  })

  it('gives every decision a plausible strong, mixed, and risky response with coaching', () => {
    const outcomes = new Map(upwardDisagreementScenario.outcomes.map((outcome) => [outcome.id, outcome]))
    const decisions = upwardDisagreementScenario.scenes.filter((scene) => scene.kind === 'decision')

    for (const scene of decisions) {
      const categories = scene.choices.map((choice) => outcomes.get(choice.outcomeId)?.category)
      expect(new Set(categories), scene.id).toEqual(new Set(['strong', 'mixed', 'risky']))
      for (const choice of scene.choices) {
        const outcome = outcomes.get(choice.outcomeId)
        expect(outcome, choice.id).toBeDefined()
        expect(outcome?.feedback.length, choice.id).toBeGreaterThan(20)
        expect(outcome?.recommendedExpression.length, choice.id).toBeGreaterThan(0)
      }
    }
    expect(upwardDisagreementScenario.outcomes.some((outcome) => outcome.libraryLinks?.length)).toBe(
      true,
    )
  })

  it('runs a strong path through all five decisions and completes deterministically', () => {
    let state = createInitialState(upwardDisagreementScenario)

    for (let decision = 0; decision < 5; decision += 1) {
      expect(getCurrentScene(upwardDisagreementScenario, state)?.kind).toBe('decision')
      const choice = choiceForCategory(state, 'strong')
      const result = applyChoice(upwardDisagreementScenario, state, {
        scenarioId: upwardDisagreementScenario.id,
        contentVersion: upwardDisagreementScenario.contentVersion,
        sceneId: state.currentSceneId,
        choiceId: choice.id,
      })
      expect(['advanced', 'completed']).toContain(result.kind)
      if (result.kind !== 'advanced' && result.kind !== 'completed') throw new Error(result.kind)
      expect(result.outcome.category).toBe('strong')
      state = result.state
    }

    expect(state.status).toBe('completed')
    expect(getCurrentScene(upwardDisagreementScenario, state)?.kind).toBe('terminal')
    expect(state.history).toHaveLength(5)
    expect(state.meters).toEqual({ trust: 5 })
  })

  it('produces a different deterministic branch for an abrupt opening rejection', () => {
    const initial = createInitialState(upwardDisagreementScenario)
    const strong = choiceForCategory(initial, 'strong')
    const risky = getAvailableChoices(upwardDisagreementScenario, initial).find((choice) =>
      choice.id === 'upward-one-on-one-reject-choice',
    )
    if (!risky) throw new Error('missing risky opening choice')

    const strongResult = applyChoice(upwardDisagreementScenario, initial, {
      scenarioId: upwardDisagreementScenario.id,
      contentVersion: upwardDisagreementScenario.contentVersion,
      sceneId: initial.currentSceneId,
      choiceId: strong.id,
    })
    const riskyResult = applyChoice(upwardDisagreementScenario, initial, {
      scenarioId: upwardDisagreementScenario.id,
      contentVersion: upwardDisagreementScenario.contentVersion,
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
    expect(riskyResult.outcome.feedback).toContain('無理です')
  })

  it('keeps the follow-up scene after raising a concern privately after the meeting', () => {
    const initial = createInitialState(upwardDisagreementScenario)
    const openingChoice = choiceForCategory(initial, 'strong')
    const openingResult = applyChoice(upwardDisagreementScenario, initial, {
      scenarioId: upwardDisagreementScenario.id,
      contentVersion: upwardDisagreementScenario.contentVersion,
      sceneId: initial.currentSceneId,
      choiceId: openingChoice.id,
    })
    expect(openingResult.kind).toBe('advanced')
    if (openingResult.kind !== 'advanced') return

    const silentChoice = getAvailableChoices(upwardDisagreementScenario, openingResult.state).find(
      (choice) => choice.id === 'upward-steering-silent-choice',
    )
    if (!silentChoice) throw new Error('missing silent meeting choice')

    const result = applyChoice(upwardDisagreementScenario, openingResult.state, {
      scenarioId: upwardDisagreementScenario.id,
      contentVersion: upwardDisagreementScenario.contentVersion,
      sceneId: openingResult.state.currentSceneId,
      choiceId: silentChoice.id,
    })

    expect(result.kind).toBe('advanced')
    if (result.kind !== 'advanced') return

    expect(result.outcome.id).toBe('upward-steering-silent-outcome')
    expect(result.outcome.nextSceneId).toBe('upward-evidence')
    expect(result.state.currentSceneId).toBe(result.outcome.nextSceneId)

    const nextScene = getCurrentScene(upwardDisagreementScenario, result.state)
    expect(nextScene?.context).toContain('フォローアップ')
    expect(nextScene?.narrative).toContain('公開計画レビューが終わり')
    expect(nextScene?.narrative).not.toContain('会議中')
    expect(nextScene?.dialogue?.[0]?.text).toContain('先ほどのレビューを踏まえ')
    expect(nextScene?.dialogue?.[0]?.text).not.toContain('懸念は分かりました')
  })

  it('rejects stale scene and content-version inputs without mutating progress', () => {
    const state = createInitialState(upwardDisagreementScenario)
    const choice = getAvailableChoices(upwardDisagreementScenario, state)[0]!
    const snapshot = structuredClone(state)

    expect(
      applyChoice(upwardDisagreementScenario, state, {
        scenarioId: upwardDisagreementScenario.id,
        contentVersion: upwardDisagreementScenario.contentVersion,
        sceneId: 'upward-steering',
        choiceId: choice.id,
      }),
    ).toEqual({ kind: 'stale', reason: 'scene_mismatch' })
    expect(state).toEqual(snapshot)

    expect(
      applyChoice(upwardDisagreementScenario, state, {
        scenarioId: upwardDisagreementScenario.id,
        contentVersion: upwardDisagreementScenario.contentVersion + 1,
        sceneId: state.currentSceneId,
        choiceId: choice.id,
      }),
    ).toEqual({ kind: 'stale', reason: 'content_version_mismatch' })
    expect(state).toEqual(snapshot)
  })
})
