export const CAREER_GAME_SCHEMA_VERSION = 1 as const

export const SCENE_KINDS = ['decision', 'terminal'] as const
export const OUTCOME_CATEGORIES = ['strong', 'mixed', 'risky'] as const
export const CONDITION_KINDS = ['flagEquals', 'meterAtLeast'] as const
export const EFFECT_KINDS = ['adjustMeter', 'setFlag'] as const

export type SceneKind = (typeof SCENE_KINDS)[number]
export type OutcomeCategory = (typeof OUTCOME_CATEGORIES)[number]

export interface Character {
  id: string
  name: string
  role?: string
}

export interface MeterDefinition {
  id: string
  label: string
  min: number
  max: number
  initial: number
}

export interface FlagDefinition {
  id: string
  label: string
  initial: boolean
}

export interface LibraryLink {
  bookId: string
  chapterId?: string
  blockId?: string
}

export interface MediaAsset {
  src: string
  alt: string
  width?: number
  height?: number
}

export interface DialogueLine {
  characterId: string
  text: string
}

export interface FlagEqualsCondition {
  kind: 'flagEquals'
  flagId: string
  value: boolean
}

export interface MeterAtLeastCondition {
  kind: 'meterAtLeast'
  meterId: string
  value: number
}

export type ChoiceCondition = FlagEqualsCondition | MeterAtLeastCondition

export interface Choice {
  id: string
  label: string
  outcomeId: string
  conditions?: ChoiceCondition[]
}

interface SceneBase {
  id: string
  kind: SceneKind
  title?: string
  context: string
  narrative?: string
  dialogue?: DialogueLine[]
}

export interface DecisionScene extends SceneBase {
  kind: 'decision'
  prompt: string
  choices: Choice[]
}

export interface Completion {
  title: string
  summary: string
}

export interface TerminalScene extends SceneBase {
  kind: 'terminal'
  completion: Completion
}

export type Scene = DecisionScene | TerminalScene

export interface AdjustMeterEffect {
  kind: 'adjustMeter'
  meterId: string
  amount: number
}

export interface SetFlagEffect {
  kind: 'setFlag'
  flagId: string
  value: boolean
}

export type OutcomeEffect = AdjustMeterEffect | SetFlagEffect

export interface Outcome {
  id: string
  category: OutcomeCategory
  consequence: string
  feedback: string
  recommendedExpression: string
  acceptableAlternatives: string[]
  effects: OutcomeEffect[]
  nextSceneId: string
  skillTags?: string[]
  libraryLinks?: LibraryLink[]
}

export interface Scenario {
  schemaVersion: typeof CAREER_GAME_SCHEMA_VERSION
  id: string
  slug: string
  contentVersion: number
  locale: string
  title: string
  subtitle?: string
  summary: string
  cover?: MediaAsset
  thumbnail?: MediaAsset
  startSceneId: string
  characters: Character[]
  meters?: MeterDefinition[]
  flags?: FlagDefinition[]
  skillTags?: string[]
  libraryLinks?: LibraryLink[]
  scenes: Scene[]
  outcomes: Outcome[]
}

export type ScenarioIssueCode =
  | 'invalid_root'
  | 'not_json_safe'
  | 'missing_field'
  | 'empty_string'
  | 'wrong_type'
  | 'invalid_number'
  | 'invalid_format'
  | 'invalid_enum'
  | 'missing_items'
  | 'unknown_field'
  | 'unknown_condition_kind'
  | 'unknown_effect_kind'
  | 'duplicate_id'
  | 'reference_not_found'
  | 'schema_version_mismatch'
  | 'invalid_choice_count'
  | 'missing_unconditional_choice'
  | 'terminal_has_choices'
  | 'unreachable_scene'
  | 'no_reachable_completion'
  | 'no_terminal_path'
  | 'no_executable_completion'
  | 'executable_analysis_limit'

export interface ScenarioIssue {
  path: string
  code: ScenarioIssueCode
  message: string
}

export type ScenarioValidationResult =
  | { ok: true; value: Scenario }
  | { ok: false; issues: ScenarioIssue[] }

export interface HistoryRecord {
  sceneId: string
  choiceId: string
  outcomeId: string
  nextSceneId: string
}

export interface GameState {
  scenarioId: string
  contentVersion: number
  currentSceneId: string
  meters: Record<string, number>
  flags: Record<string, boolean>
  history: HistoryRecord[]
  status: 'playing' | 'completed'
}

export interface ApplyChoiceInput {
  scenarioId: string
  contentVersion: number
  sceneId: string
  choiceId: string
}

export type StaleReason = 'scenario_mismatch' | 'content_version_mismatch' | 'scene_mismatch'
export type InvalidChoiceReason =
  | 'invalid_state'
  | 'already_completed'
  | 'choice_not_found'
  | 'choice_not_available'

export type ApplyChoiceResult =
  | { kind: 'advanced' | 'completed'; state: GameState; outcome: Outcome }
  | { kind: 'stale'; reason: StaleReason }
  | { kind: 'invalid'; reason: InvalidChoiceReason }
