import type {
  ApplyChoiceInput,
  ApplyChoiceResult,
  Choice,
  ChoiceCondition,
  GameState,
  OutcomeEffect,
  Scenario,
  Scene,
} from './types'

function findScene(scenario: Scenario, sceneId: string): Scene | undefined {
  return scenario.scenes.find((scene) => scene.id === sceneId)
}

function conditionsPass(conditions: ChoiceCondition[] | undefined, state: GameState): boolean {
  return (conditions ?? []).every((condition) => {
    switch (condition.kind) {
      case 'flagEquals':
        return state.flags[condition.flagId] === condition.value
      case 'meterAtLeast':
        return (state.meters[condition.meterId] ?? Number.NEGATIVE_INFINITY) >= condition.value
    }
  })
}

function hasExactKeys<T>(record: Record<string, T>, expectedKeys: string[]): boolean {
  const actualKeys = Object.keys(record)
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => key in record)
}

function isValidState(scenario: Scenario, state: GameState): boolean {
  const scene = findScene(scenario, state.currentSceneId)
  if (scene === undefined || !Array.isArray(state.history)) return false
  if (state.status !== 'playing' && state.status !== 'completed') return false
  if ((scene.kind === 'terminal') !== (state.status === 'completed')) return false

  const meters = scenario.meters ?? []
  if (!hasExactKeys(state.meters, meters.map((meter) => meter.id))) return false
  for (const meter of meters) {
    const value = state.meters[meter.id]
    if (value === undefined || !Number.isInteger(value) || value < meter.min || value > meter.max) {
      return false
    }
  }

  const flags = scenario.flags ?? []
  if (!hasExactKeys(state.flags, flags.map((flag) => flag.id))) return false
  return flags.every((flag) => typeof state.flags[flag.id] === 'boolean')
}

function applyEffects(
  scenario: Scenario,
  state: GameState,
  effects: OutcomeEffect[],
): Pick<GameState, 'meters' | 'flags'> {
  const meters = { ...state.meters }
  const flags = { ...state.flags }
  const meterDefinitions = new Map((scenario.meters ?? []).map((meter) => [meter.id, meter]))

  for (const effect of effects) {
    switch (effect.kind) {
      case 'adjustMeter': {
        const definition = meterDefinitions.get(effect.meterId)!
        const adjusted = meters[effect.meterId]! + effect.amount
        meters[effect.meterId] = Math.min(definition.max, Math.max(definition.min, adjusted))
        break
      }
      case 'setFlag':
        flags[effect.flagId] = effect.value
        break
    }
  }

  return { meters, flags }
}

export function createInitialState(scenario: Scenario): GameState {
  const startScene = findScene(scenario, scenario.startSceneId)
  return {
    scenarioId: scenario.id,
    contentVersion: scenario.contentVersion,
    currentSceneId: scenario.startSceneId,
    meters: Object.fromEntries((scenario.meters ?? []).map((meter) => [meter.id, meter.initial])),
    flags: Object.fromEntries((scenario.flags ?? []).map((flag) => [flag.id, flag.initial])),
    history: [],
    status: startScene?.kind === 'terminal' ? 'completed' : 'playing',
  }
}

export function getCurrentScene(scenario: Scenario, state: GameState): Scene | undefined {
  if (state.scenarioId !== scenario.id || state.contentVersion !== scenario.contentVersion) return undefined
  return findScene(scenario, state.currentSceneId)
}

export function getAvailableChoices(scenario: Scenario, state: GameState): Choice[] {
  if (!isValidState(scenario, state) || state.status !== 'playing') return []
  const scene = getCurrentScene(scenario, state)
  if (scene?.kind !== 'decision') return []
  return scene.choices.filter((choice) => conditionsPass(choice.conditions, state))
}

export function applyChoice(
  scenario: Scenario,
  state: GameState,
  input: ApplyChoiceInput,
): ApplyChoiceResult {
  if (input.scenarioId !== scenario.id || state.scenarioId !== scenario.id) {
    return { kind: 'stale', reason: 'scenario_mismatch' }
  }
  if (
    input.contentVersion !== scenario.contentVersion ||
    state.contentVersion !== scenario.contentVersion
  ) {
    return { kind: 'stale', reason: 'content_version_mismatch' }
  }
  if (input.sceneId !== state.currentSceneId) {
    return { kind: 'stale', reason: 'scene_mismatch' }
  }
  if (state.status === 'completed') return { kind: 'invalid', reason: 'already_completed' }
  if (!isValidState(scenario, state)) return { kind: 'invalid', reason: 'invalid_state' }

  const scene = findScene(scenario, state.currentSceneId)
  if (scene?.kind !== 'decision') return { kind: 'invalid', reason: 'invalid_state' }
  const choice = scene.choices.find((candidate) => candidate.id === input.choiceId)
  if (choice === undefined) return { kind: 'invalid', reason: 'choice_not_found' }
  if (!conditionsPass(choice.conditions, state)) {
    return { kind: 'invalid', reason: 'choice_not_available' }
  }

  const outcome = scenario.outcomes.find((candidate) => candidate.id === choice.outcomeId)
  if (outcome === undefined) return { kind: 'invalid', reason: 'invalid_state' }
  const nextScene = findScene(scenario, outcome.nextSceneId)
  if (nextScene === undefined) return { kind: 'invalid', reason: 'invalid_state' }
  const updated = applyEffects(scenario, state, outcome.effects)
  const status = nextScene.kind === 'terminal' ? 'completed' : 'playing'
  const nextState: GameState = {
    ...state,
    ...updated,
    currentSceneId: nextScene.id,
    history: [
      ...state.history,
      {
        sceneId: scene.id,
        choiceId: choice.id,
        outcomeId: outcome.id,
        nextSceneId: nextScene.id,
      },
    ],
    status,
  }

  return { kind: status === 'completed' ? 'completed' : 'advanced', state: nextState, outcome }
}
