import { describe, expect, it } from 'vitest'
import { narrativeScenario } from './fixtures/narrative-scenario'
import { workplaceScenario } from './fixtures/workplace-scenario'
import { validateScenario } from './validate'
import type { Scenario, ScenarioIssue } from './types'

function clone(value: Scenario = workplaceScenario): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function expectInvalid(input: unknown): ScenarioIssue[] {
  const result = validateScenario(input)
  if (result.ok) throw new Error('expected scenario validation to fail')
  return result.issues
}

function conditionDeadlockScenario(): Record<string, unknown> {
  const scenario = clone(narrativeScenario)
  scenario.flags = [{ id: 'gate', label: 'Completion gate', initial: false }]
  scenario.scenes = [
    {
      id: 'waiting',
      kind: 'decision',
      context: 'The completion gate is initially closed.',
      prompt: 'What happens next?',
      choices: [
        { id: 'wait-again', label: 'Wait', outcomeId: 'loop-outcome' },
        {
          id: 'finish-case',
          label: 'Finish',
          outcomeId: 'finish-outcome',
          conditions: [{ kind: 'flagEquals', flagId: 'gate', value: true }],
        },
      ],
    },
    {
      id: 'finished',
      kind: 'terminal',
      context: 'The gate opened.',
      completion: { title: 'Complete', summary: 'The executable route reached completion.' },
    },
  ]
  scenario.startSceneId = 'waiting'
  scenario.outcomes = [
    {
      id: 'loop-outcome',
      category: 'mixed',
      consequence: 'Nothing changes.',
      feedback: 'The gate remains closed.',
      recommendedExpression: 'もう少し待ちます。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'waiting',
    },
    {
      id: 'finish-outcome',
      category: 'strong',
      consequence: 'The case completes.',
      feedback: 'The gate was open.',
      recommendedExpression: '完了します。',
      acceptableAlternatives: [],
      effects: [],
      nextSceneId: 'finished',
    },
  ]
  return scenario
}

function analysisLimitScenario(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'analysis-limit',
    slug: 'analysis-limit',
    contentVersion: 1,
    locale: 'ja-JP',
    title: 'Executable analysis limit',
    summary: 'Three bounded meters produce more than 50,000 semantic runtime states.',
    startSceneId: 'counting',
    characters: [],
    meters: ['a', 'b', 'c'].map((suffix) => ({
      id: `meter-${suffix}`,
      label: `Meter ${suffix}`,
      min: 0,
      max: 37,
      initial: 0,
    })),
    flags: [{ id: 'gate', label: 'Completion gate', initial: false }],
    scenes: [
      {
        id: 'counting',
        kind: 'decision',
        context: 'Each choice increments one bounded meter.',
        prompt: 'Which meter changes?',
        choices: [
          { id: 'increase-a', label: 'Increase A', outcomeId: 'increase-a-outcome' },
          { id: 'increase-b', label: 'Increase B', outcomeId: 'increase-b-outcome' },
          { id: 'increase-c', label: 'Increase C', outcomeId: 'increase-c-outcome' },
          {
            id: 'finish-analysis',
            label: 'Finish',
            outcomeId: 'finish-analysis-outcome',
            conditions: [{ kind: 'flagEquals', flagId: 'gate', value: true }],
          },
        ],
      },
      {
        id: 'analysis-finished',
        kind: 'terminal',
        context: 'The unreachable gate opened.',
        completion: { title: 'Complete', summary: 'The analysis reached completion.' },
      },
    ],
    outcomes: [
      ...['a', 'b', 'c'].map((suffix) => ({
        id: `increase-${suffix}-outcome`,
        category: 'mixed',
        consequence: `Meter ${suffix} increases.`,
        feedback: 'The state remains bounded.',
        recommendedExpression: '数え続けます。',
        acceptableAlternatives: [],
        effects: [{ kind: 'adjustMeter', meterId: `meter-${suffix}`, amount: 1 }],
        nextSceneId: 'counting',
      })),
      {
        id: 'finish-analysis-outcome',
        category: 'strong',
        consequence: 'The case completes.',
        feedback: 'The gate was open.',
        recommendedExpression: '完了します。',
        acceptableAlternatives: [],
        effects: [],
        nextSceneId: 'analysis-finished',
      },
    ],
  }
}

describe('validateScenario', () => {
  it('accepts a generic workplace scenario as JSON-safe data', () => {
    const result = validateScenario(workplaceScenario)
    expect(result).toEqual({ ok: true, value: workplaceScenario })
    expect(JSON.parse(JSON.stringify(workplaceScenario))).toEqual(workplaceScenario)
  })

  it('accepts a structurally different narrative scenario without schema branches', () => {
    expect(validateScenario(narrativeScenario)).toEqual({ ok: true, value: narrativeScenario })
  })

  it('accepts scenario media and feedback-level learning references as plain data', () => {
    const scenario = clone()
    scenario.cover = {
      src: '/career-game/handoff-cover.jpg',
      alt: '青木さんから引き継ぎを受ける森さん',
      width: 1200,
      height: 1600,
    }
    scenario.thumbnail = {
      src: '/career-game/handoff-thumbnail.jpg',
      alt: '曖昧な引き継ぎ',
    }
    scenario.libraryLinks = [{ bookId: 'workplace-communication' }]
    const outcomes = scenario.outcomes as Array<Record<string, unknown>>
    outcomes[0]!.skillTags = ['clarification', 'deadline-alignment']
    outcomes[0]!.libraryLinks = [
      {
        bookId: 'workplace-communication',
        chapterId: 'clarifying-requests',
        blockId: 'confirming-deadlines',
      },
    ]

    const result = validateScenario(scenario)
    expect(result.ok).toBe(true)
  })

  it('rejects malformed media and nested Library links contextually', () => {
    const scenario = clone()
    scenario.cover = { src: '', alt: 'Cover', width: 0 }
    scenario.libraryLinks = [{ bookId: '' }]
    const outcomes = scenario.outcomes as Array<Record<string, unknown>>
    outcomes[0]!.libraryLinks = [{ chapterId: 'missing-book' }]

    expect(expectInvalid(scenario)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.cover.src', code: 'empty_string' }),
        expect.objectContaining({ path: '$.cover.width', code: 'invalid_number' }),
        expect.objectContaining({ path: '$.libraryLinks[0].bookId', code: 'empty_string' }),
        expect.objectContaining({
          path: '$.outcomes[0].libraryLinks[0].bookId',
          code: 'missing_field',
        }),
      ]),
    )
  })

  it('reports structural issues in deterministic document order', () => {
    const scenario = clone()
    scenario.schemaVersion = 2
    scenario.id = ''
    scenario.slug = 'Not Safe'

    const first = expectInvalid(scenario)
    const second = expectInvalid(scenario)

    expect(second).toEqual(first)
    expect(first.slice(0, 3).map(({ path, code }) => ({ path, code }))).toEqual([
      { path: '$.schemaVersion', code: 'schema_version_mismatch' },
      { path: '$.id', code: 'empty_string' },
      { path: '$.slug', code: 'invalid_format' },
    ])
  })

  it('rejects a missing schema version', () => {
    const scenario = clone()
    delete scenario.schemaVersion

    expect(expectInvalid(scenario)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.schemaVersion', code: 'missing_field' }),
      ]),
    )
  })

  it('rejects broken graph and domain references contextually', () => {
    const scenario = clone()
    scenario.startSceneId = 'missing-scene'
    const scenes = scenario.scenes as Array<Record<string, unknown>>
    const choices = scenes[0]!.choices as Array<Record<string, unknown>>
    choices[0]!.outcomeId = 'missing-outcome'
    const outcomes = scenario.outcomes as Array<Record<string, unknown>>
    outcomes[0]!.nextSceneId = 'missing-next'
    const effects = outcomes[0]!.effects as Array<Record<string, unknown>>
    effects[0]!.meterId = 'missing-meter'
    const dialogue = scenes[0]!.dialogue as Array<Record<string, unknown>>
    dialogue[0]!.characterId = 'missing-character'

    expect(expectInvalid(scenario).map(({ path, code }) => ({ path, code }))).toEqual(
      expect.arrayContaining([
        { path: '$.startSceneId', code: 'reference_not_found' },
        { path: '$.scenes[0].dialogue[0].characterId', code: 'reference_not_found' },
        { path: '$.scenes[0].choices[0].outcomeId', code: 'reference_not_found' },
        { path: '$.outcomes[0].nextSceneId', code: 'reference_not_found' },
        { path: '$.outcomes[0].effects[0].meterId', code: 'reference_not_found' },
      ]),
    )
  })

  it('fails closed for unknown fields, kinds, enums, conditions, and effects', () => {
    const scenario = clone()
    scenario.futureField = 'not accepted in V1'
    const scenes = scenario.scenes as Array<Record<string, unknown>>
    scenes[0]!.kind = 'cutscene'
    const choices = scenes[1]!.choices as Array<Record<string, unknown>>
    const conditions = choices[0]!.conditions as Array<Record<string, unknown>>
    conditions[0]!.kind = 'javascript'
    const outcomes = scenario.outcomes as Array<Record<string, unknown>>
    outcomes[0]!.category = 'perfect'
    const effects = outcomes[0]!.effects as Array<Record<string, unknown>>
    effects[0]!.kind = 'runScript'

    const issues = expectInvalid(scenario)
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.futureField', code: 'unknown_field' }),
        expect.objectContaining({ path: '$.scenes[0].kind', code: 'invalid_enum' }),
        expect.objectContaining({
          path: '$.scenes[1].choices[0].conditions[0].kind',
          code: 'unknown_condition_kind',
        }),
        expect.objectContaining({ path: '$.outcomes[0].category', code: 'invalid_enum' }),
        expect.objectContaining({
          path: '$.outcomes[0].effects[0].kind',
          code: 'unknown_effect_kind',
        }),
      ]),
    )
  })

  it('rejects duplicate stable ids', () => {
    const scenario = clone()
    const scenes = scenario.scenes as Array<Record<string, unknown>>
    scenes[1]!.id = scenes[0]!.id

    expect(expectInvalid(scenario)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.scenes[1].id', code: 'duplicate_id' }),
      ]),
    )
  })

  it('rejects non-JSON-safe content before schema traversal', () => {
    const scenario = clone()
    scenario.summary = () => 'executable content'

    expect(expectInvalid(scenario)).toEqual([
      expect.objectContaining({ path: '$.summary', code: 'not_json_safe' }),
    ])
  })

  it('rejects sparse and oversized arrays quickly with bounded preflight output', () => {
    const sparseScenario = clone()
    const sparse = new Array<unknown>(4)
    sparse[0] = { id: 'only-item', name: 'Only item' }
    sparseScenario.characters = sparse

    expect(expectInvalid(sparseScenario)).toEqual([
      expect.objectContaining({ path: '$.characters', code: 'not_json_safe' }),
    ])

    const oversizedScenario = clone()
    const oversized = new Array<unknown>(100_001)
    oversized[0] = { id: 'only-item', name: 'Only item' }
    oversizedScenario.characters = oversized
    const startedAt = performance.now()
    const issues = expectInvalid(oversizedScenario)
    const elapsedMilliseconds = performance.now() - startedAt

    expect(issues).toEqual([
      expect.objectContaining({ path: '$.characters', code: 'too_many_items' }),
    ])
    expect(issues.length).toBeLessThanOrEqual(100)
    expect(elapsedMilliseconds).toBeLessThan(250)
  })

  it('caps JSON-safe preflight node work and issue output', () => {
    const oversizedTree = clone()
    oversizedTree.futureField = Array.from({ length: 256 }, () =>
      Array.from({ length: 200 }, () => 0),
    )
    expect(expectInvalid(oversizedTree)).toEqual([
      expect.objectContaining({ code: 'validation_limit' }),
    ])

    const manyInvalidValues = clone()
    manyInvalidValues.futureField = Array.from({ length: 200 }, () => () => 'not JSON')
    const issues = expectInvalid(manyInvalidValues)
    expect(issues).toHaveLength(100)
    expect(issues.every((issue) => issue.code === 'not_json_safe')).toBe(true)
  })

  it('accepts identifiers at the V1 width boundary', () => {
    const scenario = clone()
    const boundaryId = `s${'a'.repeat(63)}`
    const scenes = scenario.scenes as Array<Record<string, unknown>>
    const previousStartId = scenes[0]!.id
    scenes[0]!.id = boundaryId
    scenario.startSceneId = boundaryId
    const outcomes = scenario.outcomes as Array<Record<string, unknown>>
    for (const outcome of outcomes) {
      if (outcome.nextSceneId === previousStartId) outcome.nextSceneId = boundaryId
    }

    expect(validateScenario(scenario)).toEqual({ ok: true, value: scenario })
  })

  it('rejects oversized identifiers consistently for declarations and references', () => {
    const scenario = clone()
    const oversizedId = `i${'d'.repeat(100_000)}`
    scenario.id = oversizedId
    scenario.startSceneId = oversizedId

    const characters = scenario.characters as Array<Record<string, unknown>>
    characters[0]!.id = oversizedId
    const meters = scenario.meters as Array<Record<string, unknown>>
    meters[0]!.id = oversizedId
    const flags = scenario.flags as Array<Record<string, unknown>>
    flags[0]!.id = oversizedId
    const scenes = scenario.scenes as Array<Record<string, unknown>>
    scenes[0]!.id = oversizedId
    const dialogue = scenes[0]!.dialogue as Array<Record<string, unknown>>
    dialogue[0]!.characterId = oversizedId
    const firstChoices = scenes[0]!.choices as Array<Record<string, unknown>>
    firstChoices[0]!.id = oversizedId
    firstChoices[0]!.outcomeId = oversizedId
    const gatedChoices = scenes[1]!.choices as Array<Record<string, unknown>>
    const conditions = gatedChoices[0]!.conditions as Array<Record<string, unknown>>
    conditions[0]!.meterId = oversizedId

    const outcomes = scenario.outcomes as Array<Record<string, unknown>>
    outcomes[0]!.id = oversizedId
    const meterEffects = outcomes[0]!.effects as Array<Record<string, unknown>>
    meterEffects[0]!.meterId = oversizedId
    const flagEffects = outcomes[2]!.effects as Array<Record<string, unknown>>
    flagEffects[0]!.flagId = oversizedId
    scenario.libraryLinks = [{ bookId: oversizedId, chapterId: oversizedId, blockId: oversizedId }]

    const issues = expectInvalid(scenario)
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.id', code: 'identifier_too_long' }),
        expect.objectContaining({ path: '$.startSceneId', code: 'identifier_too_long' }),
        expect.objectContaining({ path: '$.characters[0].id', code: 'identifier_too_long' }),
        expect.objectContaining({
          path: '$.scenes[0].dialogue[0].characterId',
          code: 'identifier_too_long',
        }),
        expect.objectContaining({ path: '$.meters[0].id', code: 'identifier_too_long' }),
        expect.objectContaining({
          path: '$.scenes[1].choices[0].conditions[0].meterId',
          code: 'identifier_too_long',
        }),
        expect.objectContaining({ path: '$.flags[0].id', code: 'identifier_too_long' }),
        expect.objectContaining({
          path: '$.outcomes[2].effects[0].flagId',
          code: 'identifier_too_long',
        }),
        expect.objectContaining({ path: '$.scenes[0].id', code: 'identifier_too_long' }),
        expect.objectContaining({ path: '$.scenes[0].choices[0].id', code: 'identifier_too_long' }),
        expect.objectContaining({
          path: '$.scenes[0].choices[0].outcomeId',
          code: 'identifier_too_long',
        }),
        expect.objectContaining({ path: '$.outcomes[0].id', code: 'identifier_too_long' }),
        expect.objectContaining({
          path: '$.outcomes[0].effects[0].meterId',
          code: 'identifier_too_long',
        }),
        expect.objectContaining({ path: '$.libraryLinks[0].bookId', code: 'identifier_too_long' }),
        expect.objectContaining({ path: '$.libraryLinks[0].chapterId', code: 'identifier_too_long' }),
        expect.objectContaining({ path: '$.libraryLinks[0].blockId', code: 'identifier_too_long' }),
      ]),
    )
    expect(issues.length).toBeLessThanOrEqual(100)
    expect(Math.max(...issues.map((issue) => issue.message.length))).toBeLessThan(512)
  })

  it('never throws when Proxy has/get traps reject schema traversal', () => {
    const inputs = [
      new Proxy(clone(), {
        has() {
          throw new Error('has trap rejected access')
        },
      }),
      new Proxy(clone(), {
        get() {
          throw new Error('get trap rejected access')
        },
      }),
    ]

    for (const input of inputs) {
      expect(() => validateScenario(input)).not.toThrow()
      expect(validateScenario(input)).toEqual({
        ok: false,
        issues: [expect.objectContaining({ path: '$', code: 'not_json_safe' })],
      })
    }

    const nested = clone()
    nested.characters = new Proxy([], {
      ownKeys() {
        throw new Error('nested ownKeys trap rejected access')
      },
    })
    expect(validateScenario(nested)).toEqual({
      ok: false,
      issues: [
        expect.objectContaining({ path: '$.characters', code: 'not_json_safe' }),
      ],
    })
  })

  it('rejects invalid scene choice cardinality and terminal choices', () => {
    const scenario = clone()
    const scenes = scenario.scenes as Array<Record<string, unknown>>
    scenes[0]!.choices = [
      (scenes[0]!.choices as unknown[])[0],
    ]
    ;(scenes.at(-1) as Record<string, unknown>).choices = [
      { id: 'terminal-choice', label: 'Continue', outcomeId: 'outcome-clarify' },
    ]

    const issues = expectInvalid(scenario)
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.scenes[0].choices', code: 'invalid_choice_count' }),
        expect.objectContaining({ path: '$.scenes[3].choices', code: 'terminal_has_choices' }),
      ]),
    )
  })

  it('rejects collections that exceed V1 executable-analysis width budgets', () => {
    const scenario = clone()
    scenario.meters = Array.from({ length: 5 }, (_, index) => ({
      id: `budget-meter-${index}`,
      label: `Budget meter ${index}`,
      min: 0,
      max: 10,
      initial: 0,
    }))
    scenario.flags = Array.from({ length: 9 }, (_, index) => ({
      id: `budget-flag-${index}`,
      label: `Budget flag ${index}`,
      initial: false,
    }))

    const scenes = scenario.scenes as Array<Record<string, unknown>>
    const choices = scenes[0]!.choices as Array<Record<string, unknown>>
    scenes[0]!.choices = Array.from({ length: 5 }, (_, index) => ({
      ...choices[0],
      id: `budget-choice-${index}`,
      conditions: Array.from({ length: 5 }, () => ({
        kind: 'flagEquals',
        flagId: 'budget-flag-0',
        value: false,
      })),
    }))
    for (let index = scenes.length; index < 25; index += 1) {
      scenes.push({
        id: `budget-scene-${index}`,
        kind: 'terminal',
        context: 'This scene exceeds the scenario width budget.',
        completion: { title: 'Over budget', summary: 'Not analyzed.' },
      })
    }

    const outcomes = scenario.outcomes as Array<Record<string, unknown>>
    outcomes[0]!.effects = Array.from({ length: 5 }, () => ({
      kind: 'setFlag',
      flagId: 'budget-flag-0',
      value: true,
    }))
    for (let index = outcomes.length; index < 97; index += 1) {
      outcomes.push({
        id: `budget-outcome-${index}`,
        category: 'mixed',
        consequence: 'This outcome exceeds the scenario width budget.',
        feedback: 'Not analyzed.',
        recommendedExpression: '確認します。',
        acceptableAlternatives: [],
        effects: [],
        nextSceneId: 'complete',
      })
    }

    expect(expectInvalid(scenario)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.meters', code: 'too_many_items' }),
        expect.objectContaining({ path: '$.flags', code: 'too_many_items' }),
        expect.objectContaining({ path: '$.scenes', code: 'too_many_items' }),
        expect.objectContaining({ path: '$.scenes[0].choices', code: 'invalid_choice_count' }),
        expect.objectContaining({
          path: '$.scenes[0].choices[0].conditions',
          code: 'too_many_items',
        }),
        expect.objectContaining({ path: '$.outcomes', code: 'too_many_items' }),
        expect.objectContaining({ path: '$.outcomes[0].effects', code: 'too_many_items' }),
      ]),
    )
  })

  it('rejects a decision scene without choices without throwing', () => {
    const scenario = clone()
    const scenes = scenario.scenes as Array<Record<string, unknown>>
    delete scenes[0]!.choices

    expect(expectInvalid(scenario)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.scenes[0].choices', code: 'missing_field' }),
      ]),
    )
  })

  it('requires an unconditional fallback choice in every decision scene', () => {
    const scenario = clone()
    const scenes = scenario.scenes as Array<Record<string, unknown>>
    const choices = scenes[0]!.choices as Array<Record<string, unknown>>
    for (const choice of choices) {
      choice.conditions = [{ kind: 'flagEquals', flagId: 'risk-raised', value: true }]
    }

    expect(expectInvalid(scenario)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.scenes[0].choices',
          code: 'missing_unconditional_choice',
        }),
      ]),
    )
  })

  it('rejects a structurally routed terminal that no runtime state can execute', () => {
    expect(expectInvalid(conditionDeadlockScenario())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.scenes', code: 'no_executable_completion' }),
      ]),
    )
  })

  it('accepts a runtime-reachable terminal after an effect opens its condition gate', () => {
    const scenario = conditionDeadlockScenario()
    const outcomes = scenario.outcomes as Array<Record<string, unknown>>
    outcomes[0]!.effects = [{ kind: 'setFlag', flagId: 'gate', value: true }]

    expect(validateScenario(scenario)).toEqual({ ok: true, value: scenario })
  })

  it('fails closed at the executable analysis state limit within all width budgets', () => {
    expect(expectInvalid(analysisLimitScenario())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.scenes', code: 'executable_analysis_limit' }),
      ]),
    )
  })

  it('rejects unreachable scenes and graphs without a reachable completion', () => {
    const unreachable = clone()
    const unreachableScenes = unreachable.scenes as Array<Record<string, unknown>>
    unreachableScenes.push({
      id: 'orphan',
      kind: 'terminal',
      title: 'Orphan',
      context: 'Never entered',
      completion: { title: 'Unused', summary: 'Unused completion' },
    })
    expect(expectInvalid(unreachable)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.scenes[4]', code: 'unreachable_scene' }),
      ]),
    )

    const noCompletion = clone()
    const outcomes = noCompletion.outcomes as Array<Record<string, unknown>>
    for (const outcome of outcomes) outcome.nextSceneId = 'follow-up'
    expect(expectInvalid(noCompletion)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.scenes', code: 'no_reachable_completion' }),
        expect.objectContaining({ path: '$.scenes[0]', code: 'no_terminal_path' }),
      ]),
    )
  })
})
