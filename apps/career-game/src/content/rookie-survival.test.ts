import {
  applyChoice,
  createInitialState,
  getAvailableChoices,
  getCurrentScene,
  validateScenario,
  type Choice,
  type GameState,
} from '@business-japanese-hub/career-game'
import { describe, expect, it } from 'vitest'
import { rookieSurvivalScenario } from './rookie-survival'

function choiceForCategory(state: GameState, category: 'strong' | 'risky'): Choice {
  const choice = getAvailableChoices(rookieSurvivalScenario, state).find((candidate) => {
    const outcome = rookieSurvivalScenario.outcomes.find(
      (value) => value.id === candidate.outcomeId,
    )
    return outcome?.category === category
  })
  if (!choice) throw new Error(`No ${category} choice for ${state.currentSceneId}`)
  return choice
}

describe('新人社員生存戦 scenario content', () => {
  it('is a valid generic five-decision scenario with meaningful choices', () => {
    expect(validateScenario(rookieSurvivalScenario)).toMatchObject({ ok: true })
    const decisions = rookieSurvivalScenario.scenes.filter((scene) => scene.kind === 'decision')

    expect(decisions).toHaveLength(5)
    expect(decisions.every((scene) => scene.choices.length >= 2 && scene.choices.length <= 4)).toBe(
      true,
    )
    expect(rookieSurvivalScenario.skillTags).toEqual(
      expect.arrayContaining(['request-clarification', 'error-reporting']),
    )
    expect(rookieSurvivalScenario.libraryLinks).toEqual(
      expect.arrayContaining([expect.objectContaining({ bookId: 'book-meeting-japanese' })]),
    )
  })

  it('runs a strong path through all five files and completes deterministically', () => {
    let state = createInitialState(rookieSurvivalScenario)

    for (let file = 0; file < 5; file += 1) {
      const scene = getCurrentScene(rookieSurvivalScenario, state)
      expect(scene?.kind).toBe('decision')
      const choice = choiceForCategory(state, 'strong')
      const result = applyChoice(rookieSurvivalScenario, state, {
        scenarioId: rookieSurvivalScenario.id,
        contentVersion: rookieSurvivalScenario.contentVersion,
        sceneId: state.currentSceneId,
        choiceId: choice.id,
      })
      expect(['advanced', 'completed']).toContain(result.kind)
      if (result.kind !== 'advanced' && result.kind !== 'completed') throw new Error(result.kind)
      state = result.state
    }

    expect(state.status).toBe('completed')
    expect(state.history).toHaveLength(5)
    expect(state.meters).toEqual({ trust: 5 })
  })

  it('produces a visibly different deterministic result for a risky opening choice', () => {
    const initial = createInitialState(rookieSurvivalScenario)
    const strong = choiceForCategory(initial, 'strong')
    const risky = choiceForCategory(initial, 'risky')

    const strongResult = applyChoice(rookieSurvivalScenario, initial, {
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: rookieSurvivalScenario.contentVersion,
      sceneId: initial.currentSceneId,
      choiceId: strong.id,
    })
    const riskyResult = applyChoice(rookieSurvivalScenario, initial, {
      scenarioId: rookieSurvivalScenario.id,
      contentVersion: rookieSurvivalScenario.contentVersion,
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
  })

  it('inherits stale scene protection from the generic runtime', () => {
    const state = createInitialState(rookieSurvivalScenario)
    const choice = getAvailableChoices(rookieSurvivalScenario, state)[0]!

    expect(
      applyChoice(rookieSurvivalScenario, state, {
        scenarioId: rookieSurvivalScenario.id,
        contentVersion: rookieSurvivalScenario.contentVersion,
        sceneId: 'different-scene',
        choiceId: choice.id,
      }),
    ).toEqual({ kind: 'stale', reason: 'scene_mismatch' })
  })
})
