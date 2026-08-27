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
