import { describe, expect, it } from 'vitest'
import { narrativeScenario } from './fixtures/narrative-scenario'
import { workplaceScenario } from './fixtures/workplace-scenario'
import { isGameStateValid } from './index'
import {
  applyChoice,
  createInitialState,
  getAvailableChoices,
  getCurrentScene,
} from './runtime'
import type { ApplyChoiceInput, GameState, Scenario } from './types'

function input(state: GameState, choiceId: string): ApplyChoiceInput {
  return {
    scenarioId: state.scenarioId,
    contentVersion: state.contentVersion,
    sceneId: state.currentSceneId,
    choiceId,
  }
}

function advance(scenario: Scenario, state: GameState, choiceId: string): GameState {
  const result = applyChoice(scenario, state, input(state, choiceId))
  if (result.kind !== 'advanced' && result.kind !== 'completed') {
    throw new Error(`expected transition, got ${result.kind}`)
  }
  return result.state
}

describe('Career Game runtime', () => {
  it('creates deterministic initial state and exposes the current scene', () => {
    const first = createInitialState(workplaceScenario)
    const second = createInitialState(workplaceScenario)

    expect(second).toEqual(first)
    expect(first).toEqual({
      scenarioId: 'handoff-alignment',
      contentVersion: 1,
      currentSceneId: 'briefing',
      meters: { trust: 2 },
      flags: { 'risk-raised': false },
      history: [],
      status: 'playing',
    })
    expect(getCurrentScene(workplaceScenario, first)?.id).toBe('briefing')
    expect(getAvailableChoices(workplaceScenario, first).map((choice) => choice.id)).toEqual([
      'clarify-now',
      'assume-tomorrow',
      'mention-risk',
    ])
  })

  it('applies an allowed choice immutably and clamps meter effects', () => {
    const state = createInitialState(workplaceScenario)
    const snapshot = structuredClone(state)
    const result = applyChoice(workplaceScenario, state, input(state, 'clarify-now'))

    expect(result.kind).toBe('advanced')
    if (result.kind !== 'advanced') return
    expect(result.outcome.id).toBe('clarify')
    expect(result.state).toEqual({
      ...state,
      currentSceneId: 'follow-up',
      meters: { trust: 5 },
      history: [
        {
          sceneId: 'briefing',
          choiceId: 'clarify-now',
          outcomeId: 'clarify',
          nextSceneId: 'follow-up',
        },
      ],
    })
    expect(state).toEqual(snapshot)
    expect(result.state).not.toBe(state)
    expect(result.state.meters).not.toBe(state.meters)
  })

  it('sets flags and follows a different branch without engine-specific logic', () => {
    const state = createInitialState(workplaceScenario)
    const result = applyChoice(workplaceScenario, state, input(state, 'mention-risk'))

    expect(result.kind).toBe('advanced')
    if (result.kind !== 'advanced') return
    expect(result.state.flags).toEqual({ 'risk-raised': true })
    expect(result.state.currentSceneId).toBe('follow-up')
    expect(result.outcome.category).toBe('mixed')
  })

  it('exposes and enforces bounded declarative choice conditions', () => {
    let state = createInitialState(workplaceScenario)
    state = advance(workplaceScenario, state, 'assume-tomorrow')
    state = advance(workplaceScenario, state, 'deflect-blame')

    expect(state.currentSceneId).toBe('follow-up')
    expect(state.meters.trust).toBe(0)
    expect(getAvailableChoices(workplaceScenario, state).map((choice) => choice.id)).toEqual([
      'confirm-minimum',
    ])
    const snapshot = structuredClone(state)
    expect(applyChoice(workplaceScenario, state, input(state, 'confirm-summary'))).toEqual({
      kind: 'invalid',
      reason: 'choice_not_available',
    })
    expect(state).toEqual(snapshot)
  })

  it.each([
    ['scenario id', { scenarioId: 'other' }, 'scenario_mismatch'],
    ['content version', { contentVersion: 2 }, 'content_version_mismatch'],
    ['scene id', { sceneId: 'follow-up' }, 'scene_mismatch'],
  ] as const)('rejects stale %s input without mutation', (_label, override, reason) => {
    const state = createInitialState(workplaceScenario)
    const staleInput = { ...input(state, 'clarify-now'), ...override }
    const snapshot = structuredClone(state)

    expect(applyChoice(workplaceScenario, state, staleInput)).toEqual({ kind: 'stale', reason })
    expect(state).toEqual(snapshot)
  })

  it('fails closed when checkpoint content version does not match the scenario', () => {
    const initial = createInitialState(workplaceScenario)
    const oldCheckpoint = { ...initial, contentVersion: 0 }

    expect(
      applyChoice(workplaceScenario, oldCheckpoint, input(oldCheckpoint, 'clarify-now')),
    ).toEqual({ kind: 'stale', reason: 'content_version_mismatch' })
    expect(getCurrentScene(workplaceScenario, oldCheckpoint)).toBeUndefined()
  })

  it('accepts a JSON round-trip checkpoint after deterministic replay', () => {
    const initial = createInitialState(workplaceScenario)
    const advanced = advance(workplaceScenario, initial, 'clarify-now')
    const restored: unknown = JSON.parse(JSON.stringify(advanced))

    expect(isGameStateValid(workplaceScenario, restored)).toBe(true)
    if (!isGameStateValid(workplaceScenario, restored)) return
    expect(restored.currentSceneId).toBe('follow-up')
    expect(restored.meters).toEqual({ trust: 5 })
    expect(restored.history).toHaveLength(1)
  })

  it('rejects malformed and version-mismatched checkpoints without throwing', () => {
    const state = createInitialState(workplaceScenario)
    const malformed = [
      null,
      [],
      { ...state, unexpected: true },
      { ...state, meters: [] },
      { ...state, history: [{ sceneId: 'briefing' }] },
    ]

    for (const inputValue of malformed) {
      expect(() => isGameStateValid(workplaceScenario, inputValue)).not.toThrow()
      expect(isGameStateValid(workplaceScenario, inputValue)).toBe(false)
    }
    expect(isGameStateValid(workplaceScenario, { ...state, contentVersion: 0 })).toBe(false)
    expect(isGameStateValid(workplaceScenario, { ...state, scenarioId: 'other' })).toBe(false)
  })

  it('rejects checkpoints whose scene, effects, or history disagree with replay', () => {
    const initial = createInitialState(workplaceScenario)
    const advanced = advance(workplaceScenario, initial, 'clarify-now')
    const forgedScene = { ...advanced, currentSceneId: 'recovery' }
    const forgedEffect = { ...advanced, meters: { trust: 4 } }
    const forgedHistory = {
      ...advanced,
      history: [{ ...advanced.history[0]!, outcomeId: 'assume' }],
    }
    const missingHistory = { ...advanced, history: [] }

    expect(isGameStateValid(workplaceScenario, forgedScene)).toBe(false)
    expect(isGameStateValid(workplaceScenario, forgedEffect)).toBe(false)
    expect(isGameStateValid(workplaceScenario, forgedHistory)).toBe(false)
    expect(isGameStateValid(workplaceScenario, missingHistory)).toBe(false)
  })

  it('rejects unknown and replayed choices and invalid checkpoints', () => {
    const initial = createInitialState(workplaceScenario)
    expect(applyChoice(workplaceScenario, initial, input(initial, 'unknown'))).toEqual({
      kind: 'invalid',
      reason: 'choice_not_found',
    })

    const firstInput = input(initial, 'clarify-now')
    const after = advance(workplaceScenario, initial, 'clarify-now')
    expect(applyChoice(workplaceScenario, after, firstInput)).toEqual({
      kind: 'stale',
      reason: 'scene_mismatch',
    })

    const invalidState = { ...initial, currentSceneId: 'does-not-exist' }
    expect(
      applyChoice(workplaceScenario, invalidState, input(invalidState, 'clarify-now')),
    ).toEqual({ kind: 'invalid', reason: 'invalid_state' })
  })

  it('enters terminal completion and rejects further choices', () => {
    let state = createInitialState(workplaceScenario)
    state = advance(workplaceScenario, state, 'clarify-now')
    const result = applyChoice(workplaceScenario, state, input(state, 'confirm-summary'))

    expect(result.kind).toBe('completed')
    if (result.kind !== 'completed') return
    expect(result.state.status).toBe('completed')
    expect(result.state.currentSceneId).toBe('complete')
    expect(getCurrentScene(workplaceScenario, result.state)?.kind).toBe('terminal')
    expect(getAvailableChoices(workplaceScenario, result.state)).toEqual([])
    expect(
      applyChoice(workplaceScenario, result.state, input(result.state, 'confirm-summary')),
    ).toEqual({ kind: 'invalid', reason: 'already_completed' })
  })

  it('runs a structurally different narrative case through the same API', () => {
    const state = createInitialState(narrativeScenario)
    expect(state.meters).toEqual({})
    expect(state.flags).toEqual({})
    expect(getCurrentScene(narrativeScenario, state)?.dialogue).toBeUndefined()

    const result = applyChoice(narrativeScenario, state, input(state, 'send-agenda'))
    expect(result.kind).toBe('completed')
    if (result.kind !== 'completed') return
    expect(result.state.currentSceneId).toBe('prepared')
    expect(result.outcome.recommendedExpression).toContain('論点')
  })
})
