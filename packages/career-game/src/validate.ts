import {
  CAREER_GAME_SCHEMA_VERSION,
  CONDITION_KINDS,
  EFFECT_KINDS,
  OUTCOME_CATEGORIES,
  SCENE_KINDS,
} from './types'
import { applyChoice, createInitialState, getAvailableChoices } from './runtime'
import type {
  GameState,
  Scenario,
  ScenarioIssue,
  ScenarioIssueCode,
  ScenarioValidationResult,
} from './types'

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/
const METER_LIMIT = 100
const EFFECT_ADJUSTMENT_LIMIT = 100
const EXECUTABLE_STATE_LIMIT = 50_000

type RecordValue = Record<string, unknown>

interface Reference {
  path: string
  id: string
}

interface ValidationContext {
  issues: ScenarioIssue[]
  allIds: Set<string>
  characterIds: Set<string>
  meterDefinitions: Map<string, { min: number; max: number }>
  flagIds: Set<string>
  sceneIds: Set<string>
  outcomeIds: Set<string>
  characterRefs: Reference[]
  meterRefs: Reference[]
  flagRefs: Reference[]
  outcomeRefs: Reference[]
  sceneRefs: Reference[]
}

function addIssue(
  issues: ScenarioIssue[],
  path: string,
  code: ScenarioIssueCode,
  message: string,
): void {
  issues.push({ path, code, message })
}

function isRecord(value: unknown): value is RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function checkJsonSafe(
  value: unknown,
  path: string,
  issues: ScenarioIssue[],
  ancestors: Set<object>,
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      addIssue(issues, path, 'not_json_safe', `expected a finite number at "${path}"`)
    }
    return
  }
  if (typeof value !== 'object') {
    addIssue(issues, path, 'not_json_safe', `expected JSON-safe plain data at "${path}"`)
    return
  }
  if (ancestors.has(value)) {
    addIssue(issues, path, 'not_json_safe', `cyclic reference at "${path}"`)
    return
  }

  let keys: (string | symbol)[]
  try {
    keys = Reflect.ownKeys(value)
  } catch {
    addIssue(issues, path, 'not_json_safe', `could not inspect value at "${path}" safely`)
    return
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      addIssue(issues, path, 'not_json_safe', `expected a canonical array at "${path}"`)
      return
    }
  } else if (!isRecord(value)) {
    addIssue(issues, path, 'not_json_safe', `expected a plain object at "${path}"`)
    return
  }

  ancestors.add(value)
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const childPath = `${path}[${index}]`
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (descriptor === undefined || !('value' in descriptor)) {
        addIssue(issues, childPath, 'not_json_safe', `expected a plain array value at "${childPath}"`)
      } else {
        checkJsonSafe(descriptor.value, childPath, issues, ancestors)
      }
    }
    for (const key of keys) {
      if (key === 'length') continue
      if (typeof key === 'string' && /^\d+$/.test(key) && Number(key) < value.length) continue
      addIssue(issues, `${path}.${String(key)}`, 'not_json_safe', `unexpected array property at "${path}"`)
    }
  } else {
    for (const key of keys) {
      const childPath = `${path}.${String(key)}`
      if (typeof key !== 'string') {
        addIssue(issues, childPath, 'not_json_safe', `symbol properties are not JSON-safe at "${path}"`)
        continue
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        addIssue(issues, childPath, 'not_json_safe', `expected an enumerable data property at "${childPath}"`)
        continue
      }
      checkJsonSafe(descriptor.value, childPath, issues, ancestors)
    }
  }
  ancestors.delete(value)
}

function rejectUnknown(record: RecordValue, path: string, allowed: readonly string[], ctx: ValidationContext): void {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(record).filter((key) => !allowedSet.has(key)).sort()) {
    addIssue(ctx.issues, `${path}.${key}`, 'unknown_field', `field "${key}" is not supported by schema V1`)
  }
}

function requiredString(record: RecordValue, key: string, path: string, ctx: ValidationContext): string | undefined {
  const fieldPath = `${path}.${key}`
  if (!(key in record)) {
    addIssue(ctx.issues, fieldPath, 'missing_field', `required field "${key}" is missing`)
    return undefined
  }
  const value = record[key]
  if (typeof value !== 'string') {
    addIssue(ctx.issues, fieldPath, 'wrong_type', `expected "${key}" to be a string`)
    return undefined
  }
  if (value.trim() === '') {
    addIssue(ctx.issues, fieldPath, 'empty_string', `field "${key}" must not be empty`)
    return undefined
  }
  return value
}

function optionalString(record: RecordValue, key: string, path: string, ctx: ValidationContext): string | undefined {
  if (!(key in record)) return undefined
  return requiredString(record, key, path, ctx)
}

function requiredNumber(record: RecordValue, key: string, path: string, ctx: ValidationContext): number | undefined {
  const fieldPath = `${path}.${key}`
  if (!(key in record)) {
    addIssue(ctx.issues, fieldPath, 'missing_field', `required field "${key}" is missing`)
    return undefined
  }
  const value = record[key]
  if (typeof value !== 'number') {
    addIssue(ctx.issues, fieldPath, 'wrong_type', `expected "${key}" to be a number`)
    return undefined
  }
  if (!Number.isFinite(value)) {
    addIssue(ctx.issues, fieldPath, 'invalid_number', `field "${key}" must be finite`)
    return undefined
  }
  return value
}

function requiredBoolean(record: RecordValue, key: string, path: string, ctx: ValidationContext): boolean | undefined {
  const fieldPath = `${path}.${key}`
  if (!(key in record)) {
    addIssue(ctx.issues, fieldPath, 'missing_field', `required field "${key}" is missing`)
    return undefined
  }
  const value = record[key]
  if (typeof value !== 'boolean') {
    addIssue(ctx.issues, fieldPath, 'wrong_type', `expected "${key}" to be a boolean`)
    return undefined
  }
  return value
}

function requiredArray(record: RecordValue, key: string, path: string, ctx: ValidationContext): unknown[] | undefined {
  const fieldPath = `${path}.${key}`
  if (!(key in record)) {
    addIssue(ctx.issues, fieldPath, 'missing_field', `required field "${key}" is missing`)
    return undefined
  }
  if (!Array.isArray(record[key])) {
    addIssue(ctx.issues, fieldPath, 'wrong_type', `expected "${key}" to be an array`)
    return undefined
  }
  return record[key]
}

function optionalArray(record: RecordValue, key: string, path: string, ctx: ValidationContext): unknown[] | undefined {
  if (!(key in record)) return undefined
  return requiredArray(record, key, path, ctx)
}

function validateStringArray(values: unknown[], path: string, ctx: ValidationContext): void {
  values.forEach((value, index) => {
    if (typeof value !== 'string') {
      addIssue(ctx.issues, `${path}[${index}]`, 'wrong_type', `expected a string at "${path}[${index}]"`)
    } else if (value.trim() === '') {
      addIssue(ctx.issues, `${path}[${index}]`, 'empty_string', `string at "${path}[${index}]" must not be empty`)
    }
  })
}

function registerId(
  value: string | undefined,
  path: string,
  target: Set<string>,
  ctx: ValidationContext,
): void {
  if (value === undefined) return
  if (!ID_PATTERN.test(value)) {
    addIssue(ctx.issues, path, 'invalid_format', `identifier "${value}" is not a lowercase stable id`)
    return
  }
  if (ctx.allIds.has(value)) {
    addIssue(ctx.issues, path, 'duplicate_id', `identifier "${value}" is already used in this scenario`)
    return
  }
  ctx.allIds.add(value)
  target.add(value)
}

function validateCharacters(values: unknown[], ctx: ValidationContext): void {
  values.forEach((value, index) => {
    const path = `$.characters[${index}]`
    if (!isRecord(value)) {
      addIssue(ctx.issues, path, 'wrong_type', `expected a character object at "${path}"`)
      return
    }
    const id = requiredString(value, 'id', path, ctx)
    registerId(id, `${path}.id`, ctx.characterIds, ctx)
    requiredString(value, 'name', path, ctx)
    optionalString(value, 'role', path, ctx)
    rejectUnknown(value, path, ['id', 'name', 'role'], ctx)
  })
}

function validateMeters(values: unknown[], ctx: ValidationContext): void {
  values.forEach((value, index) => {
    const path = `$.meters[${index}]`
    if (!isRecord(value)) {
      addIssue(ctx.issues, path, 'wrong_type', `expected a meter definition at "${path}"`)
      return
    }
    const id = requiredString(value, 'id', path, ctx)
    const before = ctx.meterDefinitions.size
    registerId(id, `${path}.id`, new Set<string>(), ctx)
    requiredString(value, 'label', path, ctx)
    const min = requiredNumber(value, 'min', path, ctx)
    const max = requiredNumber(value, 'max', path, ctx)
    const initial = requiredNumber(value, 'initial', path, ctx)
    for (const [key, number] of [['min', min], ['max', max], ['initial', initial]] as const) {
      if (number !== undefined && (!Number.isInteger(number) || Math.abs(number) > METER_LIMIT)) {
        addIssue(ctx.issues, `${path}.${key}`, 'invalid_number', `meter ${key} must be an integer within ±${METER_LIMIT}`)
      }
    }
    if (min !== undefined && max !== undefined && min > max) {
      addIssue(ctx.issues, `${path}.max`, 'invalid_number', 'meter max must be greater than or equal to min')
    }
    if (initial !== undefined && min !== undefined && max !== undefined && (initial < min || initial > max)) {
      addIssue(ctx.issues, `${path}.initial`, 'invalid_number', 'meter initial must be within min and max')
    }
    if (id !== undefined && before === ctx.meterDefinitions.size && ID_PATTERN.test(id) && min !== undefined && max !== undefined) {
      ctx.meterDefinitions.set(id, { min, max })
    }
    rejectUnknown(value, path, ['id', 'label', 'min', 'max', 'initial'], ctx)
  })
}

function validateFlags(values: unknown[], ctx: ValidationContext): void {
  values.forEach((value, index) => {
    const path = `$.flags[${index}]`
    if (!isRecord(value)) {
      addIssue(ctx.issues, path, 'wrong_type', `expected a flag definition at "${path}"`)
      return
    }
    const id = requiredString(value, 'id', path, ctx)
    registerId(id, `${path}.id`, ctx.flagIds, ctx)
    requiredString(value, 'label', path, ctx)
    requiredBoolean(value, 'initial', path, ctx)
    rejectUnknown(value, path, ['id', 'label', 'initial'], ctx)
  })
}

function validateDialogue(values: unknown[], path: string, ctx: ValidationContext): void {
  if (values.length === 0) addIssue(ctx.issues, path, 'missing_items', 'dialogue must contain at least one line')
  values.forEach((value, index) => {
    const linePath = `${path}[${index}]`
    if (!isRecord(value)) {
      addIssue(ctx.issues, linePath, 'wrong_type', `expected a dialogue line at "${linePath}"`)
      return
    }
    const characterId = requiredString(value, 'characterId', linePath, ctx)
    if (characterId !== undefined) ctx.characterRefs.push({ path: `${linePath}.characterId`, id: characterId })
    requiredString(value, 'text', linePath, ctx)
    rejectUnknown(value, linePath, ['characterId', 'text'], ctx)
  })
}

function validateConditions(values: unknown[], path: string, ctx: ValidationContext): void {
  values.forEach((value, index) => {
    const conditionPath = `${path}[${index}]`
    if (!isRecord(value)) {
      addIssue(ctx.issues, conditionPath, 'wrong_type', `expected a condition at "${conditionPath}"`)
      return
    }
    const kind = requiredString(value, 'kind', conditionPath, ctx)
    if (kind !== undefined && !(CONDITION_KINDS as readonly string[]).includes(kind)) {
      addIssue(ctx.issues, `${conditionPath}.kind`, 'unknown_condition_kind', `condition kind "${kind}" is not supported`)
      rejectUnknown(value, conditionPath, ['kind'], ctx)
      return
    }
    if (kind === 'flagEquals') {
      const flagId = requiredString(value, 'flagId', conditionPath, ctx)
      if (flagId !== undefined) ctx.flagRefs.push({ path: `${conditionPath}.flagId`, id: flagId })
      requiredBoolean(value, 'value', conditionPath, ctx)
      rejectUnknown(value, conditionPath, ['kind', 'flagId', 'value'], ctx)
    } else if (kind === 'meterAtLeast') {
      const meterId = requiredString(value, 'meterId', conditionPath, ctx)
      if (meterId !== undefined) ctx.meterRefs.push({ path: `${conditionPath}.meterId`, id: meterId })
      const threshold = requiredNumber(value, 'value', conditionPath, ctx)
      if (threshold !== undefined && !Number.isInteger(threshold)) {
        addIssue(ctx.issues, `${conditionPath}.value`, 'invalid_number', 'meter threshold must be an integer')
      } else if (threshold !== undefined && meterId !== undefined) {
        const definition = ctx.meterDefinitions.get(meterId)
        if (definition !== undefined && (threshold < definition.min || threshold > definition.max)) {
          addIssue(
            ctx.issues,
            `${conditionPath}.value`,
            'invalid_number',
            'meter threshold must be within the referenced meter range',
          )
        }
      }
      rejectUnknown(value, conditionPath, ['kind', 'meterId', 'value'], ctx)
    }
  })
}

function validateChoices(values: unknown[], path: string, ctx: ValidationContext): void {
  if (values.length < 2 || values.length > 4) {
    addIssue(ctx.issues, path, 'invalid_choice_count', 'decision scenes require between 2 and 4 choices')
  }
  values.forEach((value, index) => {
    const choicePath = `${path}[${index}]`
    if (!isRecord(value)) {
      addIssue(ctx.issues, choicePath, 'wrong_type', `expected a choice at "${choicePath}"`)
      return
    }
    const id = requiredString(value, 'id', choicePath, ctx)
    registerId(id, `${choicePath}.id`, new Set<string>(), ctx)
    requiredString(value, 'label', choicePath, ctx)
    const outcomeId = requiredString(value, 'outcomeId', choicePath, ctx)
    if (outcomeId !== undefined) ctx.outcomeRefs.push({ path: `${choicePath}.outcomeId`, id: outcomeId })
    const conditions = optionalArray(value, 'conditions', choicePath, ctx)
    if (conditions !== undefined) validateConditions(conditions, `${choicePath}.conditions`, ctx)
    rejectUnknown(value, choicePath, ['id', 'label', 'outcomeId', 'conditions'], ctx)
  })
  const hasUnconditionalChoice = values.some(
    (value) => isRecord(value) && (!('conditions' in value) || (Array.isArray(value.conditions) && value.conditions.length === 0)),
  )
  if (!hasUnconditionalChoice) {
    addIssue(
      ctx.issues,
      path,
      'missing_unconditional_choice',
      'decision scenes require at least one unconditional fallback choice',
    )
  }
}

function validateScenes(values: unknown[], ctx: ValidationContext): void {
  if (values.length === 0) addIssue(ctx.issues, '$.scenes', 'missing_items', 'scenario requires at least one scene')
  values.forEach((value, index) => {
    const path = `$.scenes[${index}]`
    if (!isRecord(value)) {
      addIssue(ctx.issues, path, 'wrong_type', `expected a scene at "${path}"`)
      return
    }
    const id = requiredString(value, 'id', path, ctx)
    registerId(id, `${path}.id`, ctx.sceneIds, ctx)
    const kind = requiredString(value, 'kind', path, ctx)
    if (kind !== undefined && !(SCENE_KINDS as readonly string[]).includes(kind)) {
      addIssue(ctx.issues, `${path}.kind`, 'invalid_enum', `scene kind "${kind}" is not supported`)
    }
    optionalString(value, 'title', path, ctx)
    requiredString(value, 'context', path, ctx)
    optionalString(value, 'narrative', path, ctx)
    const dialogue = optionalArray(value, 'dialogue', path, ctx)
    if (dialogue !== undefined) validateDialogue(dialogue, `${path}.dialogue`, ctx)

    if (kind === 'decision') {
      requiredString(value, 'prompt', path, ctx)
      const choices = requiredArray(value, 'choices', path, ctx)
      if (choices !== undefined) validateChoices(choices, `${path}.choices`, ctx)
      rejectUnknown(value, path, ['id', 'kind', 'title', 'context', 'narrative', 'dialogue', 'prompt', 'choices'], ctx)
    } else if (kind === 'terminal') {
      if ('choices' in value) {
        addIssue(ctx.issues, `${path}.choices`, 'terminal_has_choices', 'terminal scenes must not define choices')
      }
      const completion = value.completion
      if (completion === undefined) {
        addIssue(ctx.issues, `${path}.completion`, 'missing_field', 'required field "completion" is missing')
      } else if (!isRecord(completion)) {
        addIssue(ctx.issues, `${path}.completion`, 'wrong_type', 'completion must be an object')
      } else {
        requiredString(completion, 'title', `${path}.completion`, ctx)
        requiredString(completion, 'summary', `${path}.completion`, ctx)
        rejectUnknown(completion, `${path}.completion`, ['title', 'summary'], ctx)
      }
      rejectUnknown(value, path, ['id', 'kind', 'title', 'context', 'narrative', 'dialogue', 'completion', 'choices'], ctx)
    } else {
      rejectUnknown(value, path, ['id', 'kind', 'title', 'context', 'narrative', 'dialogue', 'prompt', 'choices', 'completion'], ctx)
    }
  })
}

function validateEffects(values: unknown[], path: string, ctx: ValidationContext): void {
  values.forEach((value, index) => {
    const effectPath = `${path}[${index}]`
    if (!isRecord(value)) {
      addIssue(ctx.issues, effectPath, 'wrong_type', `expected an effect at "${effectPath}"`)
      return
    }
    const kind = requiredString(value, 'kind', effectPath, ctx)
    if (kind !== undefined && !(EFFECT_KINDS as readonly string[]).includes(kind)) {
      addIssue(ctx.issues, `${effectPath}.kind`, 'unknown_effect_kind', `effect kind "${kind}" is not supported`)
      rejectUnknown(value, effectPath, ['kind'], ctx)
      return
    }
    if (kind === 'adjustMeter') {
      const meterId = requiredString(value, 'meterId', effectPath, ctx)
      if (meterId !== undefined) ctx.meterRefs.push({ path: `${effectPath}.meterId`, id: meterId })
      const amount = requiredNumber(value, 'amount', effectPath, ctx)
      if (amount !== undefined && (!Number.isInteger(amount) || Math.abs(amount) > EFFECT_ADJUSTMENT_LIMIT)) {
        addIssue(ctx.issues, `${effectPath}.amount`, 'invalid_number', `meter adjustment must be an integer within ±${EFFECT_ADJUSTMENT_LIMIT}`)
      }
      rejectUnknown(value, effectPath, ['kind', 'meterId', 'amount'], ctx)
    } else if (kind === 'setFlag') {
      const flagId = requiredString(value, 'flagId', effectPath, ctx)
      if (flagId !== undefined) ctx.flagRefs.push({ path: `${effectPath}.flagId`, id: flagId })
      requiredBoolean(value, 'value', effectPath, ctx)
      rejectUnknown(value, effectPath, ['kind', 'flagId', 'value'], ctx)
    }
  })
}

function validateOutcomes(values: unknown[], ctx: ValidationContext): void {
  if (values.length === 0) addIssue(ctx.issues, '$.outcomes', 'missing_items', 'scenario requires at least one outcome')
  values.forEach((value, index) => {
    const path = `$.outcomes[${index}]`
    if (!isRecord(value)) {
      addIssue(ctx.issues, path, 'wrong_type', `expected an outcome at "${path}"`)
      return
    }
    const id = requiredString(value, 'id', path, ctx)
    registerId(id, `${path}.id`, ctx.outcomeIds, ctx)
    const category = requiredString(value, 'category', path, ctx)
    if (category !== undefined && !(OUTCOME_CATEGORIES as readonly string[]).includes(category)) {
      addIssue(ctx.issues, `${path}.category`, 'invalid_enum', `outcome category "${category}" is not supported`)
    }
    requiredString(value, 'consequence', path, ctx)
    requiredString(value, 'feedback', path, ctx)
    requiredString(value, 'recommendedExpression', path, ctx)
    const alternatives = requiredArray(value, 'acceptableAlternatives', path, ctx)
    if (alternatives !== undefined) validateStringArray(alternatives, `${path}.acceptableAlternatives`, ctx)
    const effects = requiredArray(value, 'effects', path, ctx)
    if (effects !== undefined) validateEffects(effects, `${path}.effects`, ctx)
    const nextSceneId = requiredString(value, 'nextSceneId', path, ctx)
    if (nextSceneId !== undefined) ctx.sceneRefs.push({ path: `${path}.nextSceneId`, id: nextSceneId })
    const skillTags = optionalArray(value, 'skillTags', path, ctx)
    if (skillTags !== undefined) validateStringArray(skillTags, `${path}.skillTags`, ctx)
    const libraryLinks = optionalArray(value, 'libraryLinks', path, ctx)
    if (libraryLinks !== undefined) validateLibraryLinks(libraryLinks, `${path}.libraryLinks`, ctx)
    rejectUnknown(
      value,
      path,
      ['id', 'category', 'consequence', 'feedback', 'recommendedExpression', 'acceptableAlternatives', 'effects', 'nextSceneId', 'skillTags', 'libraryLinks'],
      ctx,
    )
  })
}

function validateLibraryLink(value: unknown, path: string, ctx: ValidationContext): void {
  if (!isRecord(value)) {
    addIssue(ctx.issues, path, 'wrong_type', 'Library link must be an object')
    return
  }
  requiredString(value, 'bookId', path, ctx)
  optionalString(value, 'chapterId', path, ctx)
  optionalString(value, 'blockId', path, ctx)
  rejectUnknown(value, path, ['bookId', 'chapterId', 'blockId'], ctx)
}

function validateLibraryLinks(values: unknown[], path: string, ctx: ValidationContext): void {
  if (values.length === 0) {
    addIssue(ctx.issues, path, 'missing_items', 'libraryLinks must contain at least one link')
  }
  values.forEach((value, index) => validateLibraryLink(value, `${path}[${index}]`, ctx))
}

function validateMediaAsset(value: unknown, path: string, ctx: ValidationContext): void {
  if (!isRecord(value)) {
    addIssue(ctx.issues, path, 'wrong_type', 'media asset must be an object')
    return
  }
  requiredString(value, 'src', path, ctx)
  requiredString(value, 'alt', path, ctx)
  for (const field of ['width', 'height'] as const) {
    if (!(field in value)) continue
    const dimension = requiredNumber(value, field, path, ctx)
    if (dimension !== undefined && (!Number.isInteger(dimension) || dimension < 1)) {
      addIssue(ctx.issues, `${path}.${field}`, 'invalid_number', `${field} must be a positive integer`)
    }
  }
  rejectUnknown(value, path, ['src', 'alt', 'width', 'height'], ctx)
}

function checkReferences(ctx: ValidationContext): void {
  const groups: Array<[Reference[], Set<string> | Map<string, unknown>]> = [
    [ctx.characterRefs, ctx.characterIds],
    [ctx.meterRefs, ctx.meterDefinitions],
    [ctx.flagRefs, ctx.flagIds],
    [ctx.outcomeRefs, ctx.outcomeIds],
    [ctx.sceneRefs, ctx.sceneIds],
  ]
  for (const [references, ids] of groups) {
    for (const reference of references) {
      if (!ids.has(reference.id)) {
        addIssue(ctx.issues, reference.path, 'reference_not_found', `reference "${reference.id}" does not exist`)
      }
    }
  }
}

function checkGraph(scenario: RecordValue, ctx: ValidationContext): void {
  const scenes = scenario.scenes as Array<RecordValue>
  const outcomes = scenario.outcomes as Array<RecordValue>
  const startSceneId = scenario.startSceneId as string
  const outcomeTargets = new Map(outcomes.map((outcome) => [outcome.id as string, outcome.nextSceneId as string]))
  const edges = new Map<string, string[]>()

  for (const scene of scenes) {
    const targets = scene.kind === 'decision'
      ? (scene.choices as Array<RecordValue>).map((choice) => outcomeTargets.get(choice.outcomeId as string)!)
      : []
    edges.set(scene.id as string, targets)
  }

  const reachable = new Set<string>()
  const pending = [startSceneId]
  while (pending.length > 0) {
    const id = pending.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    pending.push(...(edges.get(id) ?? []))
  }

  scenes.forEach((scene, index) => {
    if (!reachable.has(scene.id as string)) {
      addIssue(ctx.issues, `$.scenes[${index}]`, 'unreachable_scene', `scene "${String(scene.id)}" is unreachable from the start`)
    }
  })

  const terminals = new Set(
    scenes.filter((scene) => scene.kind === 'terminal').map((scene) => scene.id as string),
  )
  if (![...terminals].some((id) => reachable.has(id))) {
    addIssue(ctx.issues, '$.scenes', 'no_reachable_completion', 'the graph has no reachable terminal completion')
  }

  const canReachTerminal = new Set(terminals)
  let changed = true
  while (changed) {
    changed = false
    for (const [sceneId, targets] of edges) {
      if (!canReachTerminal.has(sceneId) && targets.some((target) => canReachTerminal.has(target))) {
        canReachTerminal.add(sceneId)
        changed = true
      }
    }
  }
  scenes.forEach((scene, index) => {
    const sceneId = scene.id as string
    if (reachable.has(sceneId) && !canReachTerminal.has(sceneId)) {
      addIssue(ctx.issues, `$.scenes[${index}]`, 'no_terminal_path', `scene "${sceneId}" has no route to a terminal completion`)
    }
  })
}

function executableStateKey(scenario: Scenario, state: GameState): string {
  return JSON.stringify([
    state.currentSceneId,
    (scenario.meters ?? []).map((meter) => state.meters[meter.id]),
    (scenario.flags ?? []).map((flag) => state.flags[flag.id]),
    state.status,
  ])
}

/**
 * Proves that at least one terminal is executable under the same bounded
 * condition/effect semantics as the runtime. History is deliberately removed
 * from queued states because no V1 condition or effect can inspect it.
 */
function checkExecutableCompletion(scenario: Scenario, ctx: ValidationContext): void {
  const initial = createInitialState(scenario)
  if (initial.status === 'completed') return

  const queue: GameState[] = [{ ...initial, history: [] }]
  const visited = new Set([executableStateKey(scenario, initial)])
  let cursor = 0

  while (cursor < queue.length) {
    const state = queue[cursor]!
    cursor += 1
    for (const choice of getAvailableChoices(scenario, state)) {
      const result = applyChoice(scenario, state, {
        scenarioId: scenario.id,
        contentVersion: scenario.contentVersion,
        sceneId: state.currentSceneId,
        choiceId: choice.id,
      })
      if (result.kind === 'completed') return
      if (result.kind !== 'advanced') continue

      const nextState: GameState = { ...result.state, history: [] }
      const key = executableStateKey(scenario, nextState)
      if (visited.has(key)) continue
      if (visited.size >= EXECUTABLE_STATE_LIMIT) {
        addIssue(
          ctx.issues,
          '$.scenes',
          'executable_analysis_limit',
          `could not prove an executable completion within ${EXECUTABLE_STATE_LIMIT} runtime states`,
        )
        return
      }
      visited.add(key)
      queue.push(nextState)
    }
  }

  addIssue(
    ctx.issues,
    '$.scenes',
    'no_executable_completion',
    'no terminal completion is executable from the initial runtime state',
  )
}

function validateScenarioUnsafe(input: unknown): ScenarioValidationResult {
  const jsonIssues: ScenarioIssue[] = []
  try {
    checkJsonSafe(input, '$', jsonIssues, new Set())
  } catch {
    addIssue(jsonIssues, '$', 'not_json_safe', 'input could not be inspected safely')
  }
  if (jsonIssues.length > 0) return { ok: false, issues: jsonIssues }
  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '$', code: 'invalid_root', message: 'scenario must be a plain object' }] }
  }

  const ctx: ValidationContext = {
    issues: [],
    allIds: new Set(),
    characterIds: new Set(),
    meterDefinitions: new Map(),
    flagIds: new Set(),
    sceneIds: new Set(),
    outcomeIds: new Set(),
    characterRefs: [],
    meterRefs: [],
    flagRefs: [],
    outcomeRefs: [],
    sceneRefs: [],
  }

  if (!('schemaVersion' in input)) {
    addIssue(ctx.issues, '$.schemaVersion', 'missing_field', 'required field "schemaVersion" is missing')
  } else if (typeof input.schemaVersion !== 'number') {
    addIssue(ctx.issues, '$.schemaVersion', 'wrong_type', 'schemaVersion must be a number')
  } else if (input.schemaVersion !== CAREER_GAME_SCHEMA_VERSION) {
    addIssue(ctx.issues, '$.schemaVersion', 'schema_version_mismatch', `only schema version ${CAREER_GAME_SCHEMA_VERSION} is supported`)
  }

  const scenarioId = requiredString(input, 'id', '$', ctx)
  registerId(scenarioId, '$.id', new Set<string>(), ctx)
  const slug = requiredString(input, 'slug', '$', ctx)
  if (slug !== undefined && !ID_PATTERN.test(slug)) {
    addIssue(ctx.issues, '$.slug', 'invalid_format', `slug "${slug}" is not a URL-safe segment`)
  }
  const contentVersion = requiredNumber(input, 'contentVersion', '$', ctx)
  if (contentVersion !== undefined && (!Number.isInteger(contentVersion) || contentVersion < 1)) {
    addIssue(ctx.issues, '$.contentVersion', 'invalid_number', 'contentVersion must be a positive integer')
  }
  const locale = requiredString(input, 'locale', '$', ctx)
  if (locale !== undefined && !LOCALE_PATTERN.test(locale)) {
    addIssue(ctx.issues, '$.locale', 'invalid_format', `locale "${locale}" is not a supported BCP-47 form`)
  }
  requiredString(input, 'title', '$', ctx)
  optionalString(input, 'subtitle', '$', ctx)
  requiredString(input, 'summary', '$', ctx)
  if ('cover' in input) validateMediaAsset(input.cover, '$.cover', ctx)
  if ('thumbnail' in input) validateMediaAsset(input.thumbnail, '$.thumbnail', ctx)
  const startSceneId = requiredString(input, 'startSceneId', '$', ctx)

  const characters = requiredArray(input, 'characters', '$', ctx)
  if (characters !== undefined) validateCharacters(characters, ctx)
  const meters = optionalArray(input, 'meters', '$', ctx)
  if (meters !== undefined) validateMeters(meters, ctx)
  const flags = optionalArray(input, 'flags', '$', ctx)
  if (flags !== undefined) validateFlags(flags, ctx)
  const skillTags = optionalArray(input, 'skillTags', '$', ctx)
  if (skillTags !== undefined) validateStringArray(skillTags, '$.skillTags', ctx)
  const libraryLinks = optionalArray(input, 'libraryLinks', '$', ctx)
  if (libraryLinks !== undefined) validateLibraryLinks(libraryLinks, '$.libraryLinks', ctx)
  const scenes = requiredArray(input, 'scenes', '$', ctx)
  if (scenes !== undefined) validateScenes(scenes, ctx)
  const outcomes = requiredArray(input, 'outcomes', '$', ctx)
  if (outcomes !== undefined) validateOutcomes(outcomes, ctx)

  rejectUnknown(
    input,
    '$',
    ['schemaVersion', 'id', 'slug', 'contentVersion', 'locale', 'title', 'subtitle', 'summary', 'cover', 'thumbnail', 'startSceneId', 'characters', 'meters', 'flags', 'skillTags', 'libraryLinks', 'scenes', 'outcomes'],
    ctx,
  )

  if (startSceneId !== undefined && scenes !== undefined && !ctx.sceneIds.has(startSceneId)) {
    addIssue(ctx.issues, '$.startSceneId', 'reference_not_found', `start scene "${startSceneId}" does not exist`)
  }
  checkReferences(ctx)
  if (
    ctx.issues.length === 0 &&
    startSceneId !== undefined &&
    ctx.sceneIds.has(startSceneId) &&
    scenes !== undefined && scenes.every(isRecord) &&
    outcomes !== undefined && outcomes.every(isRecord)
  ) {
    checkGraph(input, ctx)
    if (ctx.issues.length === 0) {
      checkExecutableCompletion(input as unknown as Scenario, ctx)
    }
  }

  return ctx.issues.length === 0
    ? { ok: true, value: input as unknown as Scenario }
    : { ok: false, issues: ctx.issues }
}

export function validateScenario(input: unknown): ScenarioValidationResult {
  try {
    return validateScenarioUnsafe(input)
  } catch {
    return {
      ok: false,
      issues: [
        {
          path: '$',
          code: 'not_json_safe',
          message: 'input could not be inspected safely',
        },
      ],
    }
  }
}
