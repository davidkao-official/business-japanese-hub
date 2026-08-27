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

type UnknownRecord = Record<string, unknown>

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
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(record, key))
}

function isGameStateStructurallyValid(scenario: Scenario, state: GameState): boolean {
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

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactOwnKeys(record: UnknownRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
}

function isCanonicalJsonValue(value: unknown, ancestors: Set<object>): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || ancestors.has(value)) return false

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false
    const keys = Reflect.ownKeys(value)
    if (keys.some((key) => typeof key !== 'string')) return false
    if (keys.length !== value.length + 1 || !keys.includes('length')) return false
    ancestors.add(value)
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        ancestors.delete(value)
        return false
      }
      if (!isCanonicalJsonValue(descriptor.value, ancestors)) {
        ancestors.delete(value)
        return false
      }
    }
    ancestors.delete(value)
    return true
  }

  if (!isPlainRecord(value)) return false
  ancestors.add(value)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      ancestors.delete(value)
      return false
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      ancestors.delete(value)
      return false
    }
    if (!isCanonicalJsonValue(descriptor.value, ancestors)) {
      ancestors.delete(value)
      return false
    }
  }
  ancestors.delete(value)
  return true
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

function transitionAllowedChoice(
  scenario: Scenario,
  state: GameState,
  choice: Choice,
): { state: GameState; outcome: Scenario['outcomes'][number] } | undefined {
  const scene = findScene(scenario, state.currentSceneId)
  if (scene?.kind !== 'decision' || !conditionsPass(choice.conditions, state)) return undefined
  const outcome = scenario.outcomes.find((candidate) => candidate.id === choice.outcomeId)
  if (outcome === undefined) return undefined
  const nextScene = findScene(scenario, outcome.nextSceneId)
  if (nextScene === undefined) return undefined
  const updated = applyEffects(scenario, state, outcome.effects)
  const status = nextScene.kind === 'terminal' ? 'completed' : 'playing'
  return {
    outcome,
    state: {
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
    },
  }
}

function recordsEqual<T extends string | number | boolean>(
  left: Record<string, T>,
  right: Record<string, T>,
): boolean {
  const keys = Object.keys(left)
  return hasExactKeys(right, keys) && keys.every((key) => left[key] === right[key])
}

function statesEqual(left: GameState, right: GameState): boolean {
  return (
    left.scenarioId === right.scenarioId &&
    left.contentVersion === right.contentVersion &&
    left.currentSceneId === right.currentSceneId &&
    left.status === right.status &&
    recordsEqual(left.meters, right.meters) &&
    recordsEqual(left.flags, right.flags) &&
    left.history.length === right.history.length &&
    left.history.every((record, index) => {
      const other = right.history[index]
      return (
        other !== undefined &&
        record.sceneId === other.sceneId &&
        record.choiceId === other.choiceId &&
        record.outcomeId === other.outcomeId &&
        record.nextSceneId === other.nextSceneId
      )
    })
  )
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
  if (!isGameStateStructurallyValid(scenario, state) || state.status !== 'playing') return []
  const scene = getCurrentScene(scenario, state)
  if (scene?.kind !== 'decision') return []
  return scene.choices.filter((choice) => conditionsPass(choice.conditions, state))
}

/**
 * Validates a locally restored checkpoint without throwing. Exact shape and
 * scenario identity are checked first, then every history record is replayed
 * from the scenario's initial state so scenes, effects, and progression cannot
 * be forged independently.
 */
export function isGameStateValid(scenario: Scenario, input: unknown): input is GameState {
  try {
    if (!isCanonicalJsonValue(input, new Set()) || !isPlainRecord(input)) return false
    if (
      !hasExactOwnKeys(input, [
        'scenarioId',
        'contentVersion',
        'currentSceneId',
        'meters',
        'flags',
        'history',
        'status',
      ])
    ) {
      return false
    }
    if (
      input.scenarioId !== scenario.id ||
      input.contentVersion !== scenario.contentVersion ||
      typeof input.currentSceneId !== 'string' ||
      (input.status !== 'playing' && input.status !== 'completed') ||
      !isPlainRecord(input.meters) ||
      !isPlainRecord(input.flags) ||
      !Array.isArray(input.history)
    ) {
      return false
    }

    const history = [] as GameState['history']
    for (const value of input.history) {
      if (
        !isPlainRecord(value) ||
        !hasExactOwnKeys(value, ['sceneId', 'choiceId', 'outcomeId', 'nextSceneId']) ||
        typeof value.sceneId !== 'string' ||
        typeof value.choiceId !== 'string' ||
        typeof value.outcomeId !== 'string' ||
        typeof value.nextSceneId !== 'string'
      ) {
        return false
      }
      history.push({
        sceneId: value.sceneId,
        choiceId: value.choiceId,
        outcomeId: value.outcomeId,
        nextSceneId: value.nextSceneId,
      })
    }

    const candidate: GameState = {
      scenarioId: input.scenarioId,
      contentVersion: input.contentVersion,
      currentSceneId: input.currentSceneId,
      meters: input.meters as Record<string, number>,
      flags: input.flags as Record<string, boolean>,
      history,
      status: input.status,
    }
    if (!isGameStateStructurallyValid(scenario, candidate)) return false

    let replayed = createInitialState(scenario)
    for (const record of history) {
      if (replayed.status !== 'playing' || replayed.currentSceneId !== record.sceneId) return false
      const scene = findScene(scenario, replayed.currentSceneId)
      if (scene?.kind !== 'decision') return false
      const choice = scene.choices.find((value) => value.id === record.choiceId)
      if (choice === undefined || choice.outcomeId !== record.outcomeId) return false
      const transition = transitionAllowedChoice(scenario, replayed, choice)
      if (transition === undefined || transition.state.currentSceneId !== record.nextSceneId) return false
      replayed = transition.state
    }

    return statesEqual(candidate, replayed)
  } catch {
    return false
  }
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
  if (!isGameStateStructurallyValid(scenario, state)) {
    return { kind: 'invalid', reason: 'invalid_state' }
  }

  const scene = findScene(scenario, state.currentSceneId)
  if (scene?.kind !== 'decision') return { kind: 'invalid', reason: 'invalid_state' }
  const choice = scene.choices.find((candidate) => candidate.id === input.choiceId)
  if (choice === undefined) return { kind: 'invalid', reason: 'choice_not_found' }
  if (!conditionsPass(choice.conditions, state)) {
    return { kind: 'invalid', reason: 'choice_not_available' }
  }
  const transition = transitionAllowedChoice(scenario, state, choice)
  if (transition === undefined) return { kind: 'invalid', reason: 'invalid_state' }
  return {
    kind: transition.state.status === 'completed' ? 'completed' : 'advanced',
    state: transition.state,
    outcome: transition.outcome,
  }
}
