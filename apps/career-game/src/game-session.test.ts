import {
  applyChoice,
  createInitialState,
  getAvailableChoices,
} from '@business-japanese-hub/career-game'
import { beforeEach, describe, expect, it } from 'vitest'
import { rookieSurvivalScenario } from './content/rookie-survival'
import {
  clearGameSession,
  gameSessionStorageKey,
  loadGameSession,
  saveGameSession,
} from './game-session'

function firstTransition() {
  const state = createInitialState(rookieSurvivalScenario)
  const choice = getAvailableChoices(rookieSurvivalScenario, state)[0]!
  const result = applyChoice(rookieSurvivalScenario, state, {
    scenarioId: rookieSurvivalScenario.id,
    contentVersion: rookieSurvivalScenario.contentVersion,
    sceneId: state.currentSceneId,
    choiceId: choice.id,
  })
  if (result.kind !== 'advanced') throw new Error(result.kind)
  return result
}

describe('versioned anonymous game session', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keys local recovery by scenario and content version', () => {
    expect(gameSessionStorageKey(rookieSurvivalScenario)).toBe(
      'business-japanese-hub.career-game.rookie-survival@1',
    )
  })

  it('restores a replay-valid state and its pending outcome feedback', () => {
    const result = firstTransition()
    saveGameSession(
      rookieSurvivalScenario,
      { state: result.state, pendingOutcomeId: result.outcome.id },
      window.localStorage,
    )

    expect(loadGameSession(rookieSurvivalScenario, window.localStorage)).toEqual({
      state: result.state,
      pendingOutcomeId: result.outcome.id,
    })
  })

  it('fails closed and removes malformed, stale, or inconsistent checkpoints', () => {
    const key = gameSessionStorageKey(rookieSurvivalScenario)
    window.localStorage.setItem(key, '{not json')
    expect(loadGameSession(rookieSurvivalScenario, window.localStorage)).toBeNull()
    expect(window.localStorage.getItem(key)).toBeNull()

    const result = firstTransition()
    window.localStorage.setItem(
      key,
      JSON.stringify({
        state: { ...result.state, contentVersion: result.state.contentVersion - 1 },
        pendingOutcomeId: result.outcome.id,
      }),
    )
    expect(loadGameSession(rookieSurvivalScenario, window.localStorage)).toBeNull()

    window.localStorage.setItem(
      key,
      JSON.stringify({ state: result.state, pendingOutcomeId: 'wrong-outcome' }),
    )
    expect(loadGameSession(rookieSurvivalScenario, window.localStorage)).toBeNull()
  })

  it('rejects an oversized checkpoint before parsing otherwise valid JSON', () => {
    const result = firstTransition()
    const key = gameSessionStorageKey(rookieSurvivalScenario)
    const valid = JSON.stringify({ state: result.state })
    window.localStorage.setItem(key, `${valid}${' '.repeat(100_000)}`)

    expect(loadGameSession(rookieSurvivalScenario, window.localStorage)).toBeNull()
    expect(window.localStorage.getItem(key)).toBeNull()
  })

  it('clears only the current scenario/version checkpoint for replay', () => {
    const result = firstTransition()
    const key = gameSessionStorageKey(rookieSurvivalScenario)
    window.localStorage.setItem('unrelated-key', 'keep')
    saveGameSession(rookieSurvivalScenario, { state: result.state }, window.localStorage)

    clearGameSession(rookieSurvivalScenario, window.localStorage)

    expect(window.localStorage.getItem(key)).toBeNull()
    expect(window.localStorage.getItem('unrelated-key')).toBe('keep')
  })

  it('does not crash when storage is unavailable', () => {
    const unavailable = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const result = firstTransition()

    expect(() =>
      saveGameSession(rookieSurvivalScenario, { state: result.state }, unavailable),
    ).not.toThrow()
    expect(loadGameSession(rookieSurvivalScenario, unavailable)).toBeNull()
    expect(() => clearGameSession(rookieSurvivalScenario, unavailable)).not.toThrow()
  })
})
