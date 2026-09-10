import type {
  PracticeAnswer,
  PracticeCheckpointRegistry,
  PracticeChoice,
  PracticeQuestion,
  PracticeQuestionBank,
  PracticeQuestionSupportOverlay,
  PracticeRepresentation,
  PrivatePracticeQuestionBankSource,
} from './contract'
import { PRACTICE_QUESTION_BANK_SCHEMA_VERSION } from './contract'

export type PracticeValidationIssue = { path: string; message: string }
export type PracticeValidationResult<T> = { ok: true; value: T } | { ok: false; issues: PracticeValidationIssue[] }

type RecordValue = Record<string, unknown>
type Context = { issues: PracticeValidationIssue[] }

const ID = /^[A-Za-z0-9._:-]{1,128}$/
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function issue(ctx: Context, path: string, message: string): void { ctx.issues.push({ path, message }) }
function string(value: unknown, path: string, ctx: Context): value is string {
  if (typeof value !== 'string' || value.trim() === '') { issue(ctx, path, 'must be a non-empty string'); return false }
  return true
}
function integer(value: unknown, path: string, ctx: Context): value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) { issue(ctx, path, 'must be a positive safe integer'); return false }
  return true
}
function id(value: unknown, path: string, ctx: Context): value is string {
  if (!string(value, path, ctx)) return false
  if (!ID.test(value)) { issue(ctx, path, 'must use a bounded stable identifier'); return false }
  return true
}
function unique(values: readonly string[], path: string, ctx: Context): void {
  if (new Set(values).size !== values.length) issue(ctx, path, 'must not contain duplicate values')
}
function stringArray(value: unknown, path: string, ctx: Context, required = true, distinct = true): value is string[] {
  if (!Array.isArray(value) || (required && value.length === 0)) { issue(ctx, path, required ? 'must be a non-empty array' : 'must be an array'); return false }
  const values: string[] = []
  value.forEach((entry, index) => { if (string(entry, `${path}[${index}]`, ctx)) values.push(entry) })
  if (distinct) unique(values, path, ctx)
  return true
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string, ctx: Context): value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) { issue(ctx, path, `must be one of: ${allowed.join(', ')}`); return false }
  return true
}
function allowedKeys(value: unknown, path: string, allowed: readonly string[], ctx: Context): value is RecordValue {
  if (!isRecord(value)) { issue(ctx, path, 'must be an object'); return false }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issue(ctx, `${path}.${key}`, 'is not allowed by the private Practice authoring contract')
  }
  return true
}
function timestamp(value: unknown, path: string, ctx: Context): void {
  if (!string(value, path, ctx)) return
  if (Number.isNaN(Date.parse(value as string))) issue(ctx, path, 'must be an ISO-8601 timestamp')
}

function validateRepresentation(value: unknown, path: string, ctx: Context): value is PracticeRepresentation {
  if (!isRecord(value) || typeof value.kind !== 'string') { issue(ctx, path, 'must be a representation object'); return false }
  switch (value.kind) {
    case 'equation': return allowedKeys(value, path, ['kind', 'expression'], ctx) && string(value.expression, `${path}.expression`, ctx)
    case 'table': {
      allowedKeys(value, path, ['kind', 'columns', 'rows'], ctx)
      if (!stringArray(value.columns, `${path}.columns`, ctx) || !Array.isArray(value.rows)) return false
      const columns = value.columns as unknown[]
      value.rows.forEach((row, index) => {
        if (!Array.isArray(row) || row.length !== columns.length) issue(ctx, `${path}.rows[${index}]`, 'must have one cell per column')
        else stringArray(row, `${path}.rows[${index}]`, ctx, true, false)
      })
      return true
    }
    case 'diagram': {
      allowedKeys(value, path, ['kind', 'altText', 'nodes', 'edges'], ctx)
      if (!string(value.altText, `${path}.altText`, ctx) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) { issue(ctx, path, 'diagram needs nodes and edges'); return false }
      const nodes: string[] = []
      value.nodes.forEach((node, index) => { if (!allowedKeys(node, `${path}.nodes[${index}]`, ['id', 'label'], ctx)) return; if (id(node.id, `${path}.nodes[${index}].id`, ctx)) { nodes.push(node.id); string(node.label, `${path}.nodes[${index}].label`, ctx) } })
      unique(nodes, `${path}.nodes`, ctx)
      value.edges.forEach((edge, index) => { if (!allowedKeys(edge, `${path}.edges[${index}]`, ['from', 'to', 'label'], ctx)) return; if (!string(edge.from, `${path}.edges[${index}].from`, ctx) || !nodes.includes(edge.from as string)) issue(ctx, `${path}.edges[${index}].from`, 'must reference a declared node'); if (!string(edge.to, `${path}.edges[${index}].to`, ctx) || !nodes.includes(edge.to as string)) issue(ctx, `${path}.edges[${index}].to`, 'must reference a declared node'); if (edge.label !== undefined) string(edge.label, `${path}.edges[${index}].label`, ctx) })
      return true
    }
    case 'elimination': return allowedKeys(value, path, ['kind', 'candidates', 'steps'], ctx) && stringArray(value.candidates, `${path}.candidates`, ctx) && stringArray(value.steps, `${path}.steps`, ctx)
    case 'logic-grid': {
      allowedKeys(value, path, ['kind', 'columns', 'rows', 'cells'], ctx)
      if (!stringArray(value.columns, `${path}.columns`, ctx) || !stringArray(value.rows, `${path}.rows`, ctx) || !Array.isArray(value.cells)) return false
      const pairs = new Set<string>()
      value.cells.forEach((cell, index) => { if (!allowedKeys(cell, `${path}.cells[${index}]`, ['row', 'column', 'value'], ctx)) return; const row = cell.row; const column = cell.column; if (!string(row, `${path}.cells[${index}].row`, ctx) || !(value.rows as string[]).includes(row)) issue(ctx, `${path}.cells[${index}].row`, 'must reference a declared row'); if (!string(column, `${path}.cells[${index}].column`, ctx) || !(value.columns as string[]).includes(column)) issue(ctx, `${path}.cells[${index}].column`, 'must reference a declared column'); enumValue(cell.value, ['yes', 'no', 'unknown'], `${path}.cells[${index}].value`, ctx); const pair = `${row}\u0000${column}`; if (pairs.has(pair)) issue(ctx, `${path}.cells[${index}]`, 'duplicates a row/column cell'); pairs.add(pair) })
      return true
    }
    case 'other': return allowedKeys(value, path, ['kind', 'label', 'content'], ctx) && string(value.label, `${path}.label`, ctx) && string(value.content, `${path}.content`, ctx)
    default: issue(ctx, `${path}.kind`, 'is not a supported representation kind'); return false
  }
}

function validateChoices(value: unknown, path: string, ctx: Context): value is PracticeChoice[] {
  if (!Array.isArray(value) || value.length === 0) { issue(ctx, path, 'must contain at least one choice'); return false }
  const ids: string[] = []
  value.forEach((choice, index) => { if (!allowedKeys(choice, `${path}[${index}]`, ['id', 'textJa', 'representation'], ctx)) return; if (id(choice.id, `${path}[${index}].id`, ctx)) ids.push(choice.id); string(choice.textJa, `${path}[${index}].textJa`, ctx); if (choice.representation !== undefined) validateRepresentation(choice.representation, `${path}[${index}].representation`, ctx) })
  unique(ids, path, ctx)
  return true
}

function validateAnswer(value: unknown, path: string, ctx: Context): value is PracticeAnswer {
  if (!allowedKeys(value, path, ['input', 'expectedAnswer', 'scoring'], ctx) || !isRecord(value.input) || !isRecord(value.expectedAnswer) || !isRecord(value.scoring)) { issue(ctx, path, 'must contain input, expectedAnswer, and scoring'); return false }
  const kind = value.input.kind
  if (!enumValue(kind, ['single-choice', 'multi-select', 'short-text', 'number', 'ordering'], `${path}.input.kind`, ctx)) return false
  if (value.expectedAnswer.kind !== kind) issue(ctx, `${path}.expectedAnswer.kind`, 'must match input.kind')
  const choices = kind === 'single-choice' || kind === 'multi-select' || kind === 'ordering' ? value.input.choices : undefined
  if (choices !== undefined) validateChoices(choices, `${path}.input.choices`, ctx)
  const choiceIds = Array.isArray(choices) ? choices.filter(isRecord).map((choice) => choice.id).filter((entry): entry is string => typeof entry === 'string') : []
  const answerKeys = kind === 'single-choice' ? ['kind', 'choiceId'] : kind === 'multi-select' || kind === 'ordering' ? ['kind', 'choiceIds'] : ['kind', 'value']
  allowedKeys(value.input, `${path}.input`, choices === undefined ? ['kind'] : ['kind', 'choices'], ctx)
  allowedKeys(value.expectedAnswer, `${path}.expectedAnswer`, answerKeys, ctx)
  allowedKeys(value.scoring, `${path}.scoring`, kind === 'number' ? ['kind', 'tolerance'] : ['kind'], ctx)
  if (kind === 'single-choice') { if (!string(value.expectedAnswer.choiceId, `${path}.expectedAnswer.choiceId`, ctx) || !choiceIds.includes(value.expectedAnswer.choiceId as string)) issue(ctx, `${path}.expectedAnswer.choiceId`, 'must be an offered choice'); if (value.scoring.kind !== 'exact-choice') issue(ctx, `${path}.scoring.kind`, 'must be exact-choice') }
  if (kind === 'multi-select') { if (!stringArray(value.expectedAnswer.choiceIds, `${path}.expectedAnswer.choiceIds`, ctx) || (value.expectedAnswer.choiceIds as string[]).some((choice) => !choiceIds.includes(choice))) issue(ctx, `${path}.expectedAnswer.choiceIds`, 'must be a unique non-empty subset of offered choices'); if (value.scoring.kind !== 'exact-set') issue(ctx, `${path}.scoring.kind`, 'must be exact-set') }
  if (kind === 'ordering') { if (!stringArray(value.expectedAnswer.choiceIds, `${path}.expectedAnswer.choiceIds`, ctx) || !(value.expectedAnswer.choiceIds as string[]).every((choice) => choiceIds.includes(choice)) || (value.expectedAnswer.choiceIds as string[]).length !== choiceIds.length) issue(ctx, `${path}.expectedAnswer.choiceIds`, 'must be an exact permutation of offered choices'); if (value.scoring.kind !== 'exact-order') issue(ctx, `${path}.scoring.kind`, 'must be exact-order') }
  if (kind === 'short-text') { string(value.expectedAnswer.value, `${path}.expectedAnswer.value`, ctx); if (value.scoring.kind !== 'exact-text') issue(ctx, `${path}.scoring.kind`, 'must be exact-text') }
  if (kind === 'number') { if (typeof value.expectedAnswer.value !== 'number' || !Number.isFinite(value.expectedAnswer.value)) issue(ctx, `${path}.expectedAnswer.value`, 'must be a finite number'); if (value.scoring.kind !== 'numeric') issue(ctx, `${path}.scoring.kind`, 'must be numeric'); if (value.scoring.tolerance !== undefined && (typeof value.scoring.tolerance !== 'number' || value.scoring.tolerance < 0 || !Number.isFinite(value.scoring.tolerance))) issue(ctx, `${path}.scoring.tolerance`, 'must be a finite non-negative number') }
  return true
}

function validateProvenance(value: unknown, path: string, ctx: Context, needsBasis: boolean): void {
  if (!allowedKeys(value, path, needsBasis ? ['authoredBy', 'reviewedBy', 'createdAt', 'updatedAt', 'basis', 'originalContentAttestation'] : ['authoredBy', 'reviewedBy', 'createdAt', 'updatedAt', 'originalContentAttestation'], ctx)) return
  string(value.authoredBy, `${path}.authoredBy`, ctx)
  if (value.reviewedBy !== undefined) stringArray(value.reviewedBy, `${path}.reviewedBy`, ctx)
  timestamp(value.createdAt, `${path}.createdAt`, ctx); timestamp(value.updatedAt, `${path}.updatedAt`, ctx)
  if (needsBasis) stringArray(value.basis, `${path}.basis`, ctx)
  if (value.originalContentAttestation !== true) issue(ctx, `${path}.originalContentAttestation`, 'must be true')
}

function validateQuestion(value: unknown, path: string, ctx: Context): value is PracticeQuestion {
  if (!allowedKeys(value, path, ['id', 'version', 'status', 'testFamily', 'domain', 'category', 'subcategory', 'deliveryProfile', 'practiceProfile', 'difficulty', 'targetSeconds', 'releaseNotes', 'promptJa', 'promptRepresentation', 'answer', 'coreExplanation', 'itemAnalysis', 'provenance'], ctx)) return false
  id(value.id, `${path}.id`, ctx); integer(value.version, `${path}.version`, ctx); const status = enumValue(value.status, ['draft', 'reviewed', 'released', 'retired'], `${path}.status`, ctx)
  string(value.testFamily, `${path}.testFamily`, ctx); enumValue(value.domain, ['verbal', 'nonverbal'], `${path}.domain`, ctx); string(value.category, `${path}.category`, ctx); if (value.subcategory !== undefined) string(value.subcategory, `${path}.subcategory`, ctx)
  string(value.deliveryProfile, `${path}.deliveryProfile`, ctx); string(value.practiceProfile, `${path}.practiceProfile`, ctx); enumValue(value.difficulty, ['foundation', 'standard', 'stretch'], `${path}.difficulty`, ctx)
  if (value.targetSeconds !== undefined) integer(value.targetSeconds, `${path}.targetSeconds`, ctx)
  if (value.releaseNotes !== undefined) string(value.releaseNotes, `${path}.releaseNotes`, ctx)
  string(value.promptJa, `${path}.promptJa`, ctx); if (value.promptRepresentation !== undefined) validateRepresentation(value.promptRepresentation, `${path}.promptRepresentation`, ctx); validateAnswer(value.answer, `${path}.answer`, ctx)
  if (!allowedKeys(value.coreExplanation, `${path}.coreExplanation`, ['concise', 'whatIsAskedJa', 'representation'], ctx)) { /* issue recorded */ } else { string(value.coreExplanation.concise, `${path}.coreExplanation.concise`, ctx); string(value.coreExplanation.whatIsAskedJa, `${path}.coreExplanation.whatIsAskedJa`, ctx); if (value.coreExplanation.representation !== undefined) validateRepresentation(value.coreExplanation.representation, `${path}.coreExplanation.representation`, ctx) }
  if (!allowedKeys(value.itemAnalysis, `${path}.itemAnalysis`, ['languageLoads', 'vocabularyTermIds', 'reasoningLoads', 'executionLoads', 'diagnosticCheckpoints'], ctx)) { /* issue recorded */ } else { const language = ['vocabulary', 'semantic-relation', 'condition-parsing', 'reading-comprehension']; const reasoning = ['model-selection', 'constraint-reasoning', 'quantitative-reasoning']; const execution = ['calculation', 'choice-elimination']; for (const [field, allowed] of [['languageLoads', language], ['reasoningLoads', reasoning], ['executionLoads', execution]] as const) { if (!Array.isArray(value.itemAnalysis[field])) issue(ctx, `${path}.itemAnalysis.${field}`, 'must be an array'); else (value.itemAnalysis[field] as unknown[]).forEach((entry, index) => enumValue(entry, allowed, `${path}.itemAnalysis.${field}[${index}]`, ctx)) }; if (value.itemAnalysis.vocabularyTermIds !== undefined) stringArray(value.itemAnalysis.vocabularyTermIds, `${path}.itemAnalysis.vocabularyTermIds`, ctx); if (value.itemAnalysis.diagnosticCheckpoints !== undefined) { const checkpoints = value.itemAnalysis.diagnosticCheckpoints; if (!allowedKeys(checkpoints, `${path}.itemAnalysis.diagnosticCheckpoints`, ['registryVersion', 'ids'], ctx)) { /* issue recorded */ } else { integer(checkpoints.registryVersion, `${path}.itemAnalysis.diagnosticCheckpoints.registryVersion`, ctx); stringArray(checkpoints.ids, `${path}.itemAnalysis.diagnosticCheckpoints.ids`, ctx) } } }
  validateProvenance(value.provenance, `${path}.provenance`, ctx, true)
  if (status && (value.status === 'reviewed' || value.status === 'released') && (!isRecord(value.provenance) || !Array.isArray(value.provenance.reviewedBy) || value.provenance.reviewedBy.length === 0)) issue(ctx, `${path}.provenance.reviewedBy`, 'is required for reviewed or released content')
  if (status && value.status === 'released' && (!string(value.releaseNotes, `${path}.releaseNotes`, ctx))) issue(ctx, `${path}.releaseNotes`, 'is required for released content')
  return true
}

function validateCheckpointRegistry(value: unknown, questions: readonly PracticeQuestion[], ctx: Context): value is PracticeCheckpointRegistry {
  if (!allowedKeys(value, '$.checkpointRegistry', ['version', 'checkpoints'], ctx)) return false
  const validVersion = integer(value.version, '$.checkpointRegistry.version', ctx)
  if (!Array.isArray(value.checkpoints)) { issue(ctx, '$.checkpointRegistry.checkpoints', 'must be an array'); return false }
  let usable = validVersion
  const ids: string[] = []
  value.checkpoints.forEach((checkpoint, index) => { const path = `$.checkpointRegistry.checkpoints[${index}]`; if (!allowedKeys(checkpoint, path, ['id', 'version', 'questionId', 'questionVersion', 'dimension', 'promptJa', 'answer', 'provenance'], ctx)) { usable = false; return }; const checkpointId = checkpoint.id; const questionId = checkpoint.questionId; const validId = id(checkpointId, `${path}.id`, ctx); if (validId && typeof checkpointId === 'string') ids.push(checkpointId); else usable = false; if (!integer(checkpoint.version, `${path}.version`, ctx)) usable = false; const validQuestionId = id(questionId, `${path}.questionId`, ctx); if (!validQuestionId || !integer(checkpoint.questionVersion, `${path}.questionVersion`, ctx)) usable = false; const question = validQuestionId && typeof questionId === 'string' ? questions.find((entry) => entry.id === questionId && entry.version === checkpoint.questionVersion) : undefined; if (!question) { issue(ctx, `${path}.questionId`, 'must reference a question in this bank'); usable = false }; if (!enumValue(checkpoint.dimension, ['meaning', 'representation', 'execution'], `${path}.dimension`, ctx)) usable = false; if (!string(checkpoint.promptJa, `${path}.promptJa`, ctx)) usable = false; if (!validateAnswer(checkpoint.answer, `${path}.answer`, ctx)) usable = false; validateProvenance(checkpoint.provenance, `${path}.provenance`, ctx, false) })
  unique(ids, '$.checkpointRegistry.checkpoints', ctx)
  if (new Set(ids).size !== ids.length) usable = false
  return usable
}

function validateOverlays(value: unknown, questions: readonly PracticeQuestion[], catalog: PracticeQuestionBank['vocabularyCatalog'], ctx: Context): value is PracticeQuestionSupportOverlay[] {
  if (!Array.isArray(value)) { issue(ctx, '$.supportOverlays', 'must be an array'); return false }
  const identities: string[] = []
  value.forEach((overlay, index) => { const path = `$.supportOverlays[${index}]`; if (!allowedKeys(overlay, path, ['questionId', 'questionVersion', 'version', 'byLocale'], ctx)) return; id(overlay.questionId, `${path}.questionId`, ctx); integer(overlay.questionVersion, `${path}.questionVersion`, ctx); integer(overlay.version, `${path}.version`, ctx); const question = questions.find((entry) => entry.id === overlay.questionId && entry.version === overlay.questionVersion); const vocabularyTermIds = question?.itemAnalysis?.vocabularyTermIds; if (!question) issue(ctx, `${path}.questionId`, 'must reference a question in this bank'); if (!isRecord(overlay.byLocale) || Object.keys(overlay.byLocale).length === 0) issue(ctx, `${path}.byLocale`, 'must have at least one locale'); else for (const [locale, content] of Object.entries(overlay.byLocale)) { if (!LOCALE.test(locale)) issue(ctx, `${path}.byLocale.${locale}`, 'must use a BCP-47-like locale tag'); if (!allowedKeys(content, `${path}.byLocale.${locale}`, ['concise', 'whatIsAsked', 'keyTerms', 'representationExplanation', 'commonMisread'], ctx)) continue; for (const field of ['concise', 'whatIsAsked', 'representationExplanation', 'commonMisread']) if (content[field] !== undefined) string(content[field], `${path}.byLocale.${locale}.${field}`, ctx); if (content.keyTerms !== undefined) { if (!Array.isArray(content.keyTerms)) issue(ctx, `${path}.byLocale.${locale}.keyTerms`, 'must be an array'); else content.keyTerms.forEach((term, termIndex) => { if (!allowedKeys(term, `${path}.byLocale.${locale}.keyTerms[${termIndex}]`, ['termId', 'surface', 'meaning', 'note'], ctx)) return; if (!string(term.termId, `${path}.byLocale.${locale}.keyTerms[${termIndex}].termId`, ctx) || !Array.isArray(vocabularyTermIds) || !vocabularyTermIds.includes(term.termId as string) || !Object.hasOwn(catalog.terms, term.termId as string)) issue(ctx, `${path}.byLocale.${locale}.keyTerms[${termIndex}].termId`, 'must reference this question\'s catalogued vocabulary term'); string(term.surface, `${path}.byLocale.${locale}.keyTerms[${termIndex}].surface`, ctx); string(term.meaning, `${path}.byLocale.${locale}.keyTerms[${termIndex}].meaning`, ctx); if (term.note !== undefined) string(term.note, `${path}.byLocale.${locale}.keyTerms[${termIndex}].note`, ctx) }) } }
    identities.push(`${overlay.questionId}\u0000${overlay.questionVersion}\u0000${overlay.version}`) })
  unique(identities, '$.supportOverlays', ctx)
  return true
}

/** Validate a private-source question bank without emitting proprietary bodies. */
export function validatePracticeQuestionBankSource(raw: unknown, options: { requireReleased?: boolean } = {}): PracticeValidationResult<PrivatePracticeQuestionBankSource> {
  const ctx: Context = { issues: [] }
  if (!allowedKeys(raw, '$', ['questionBank', 'checkpointRegistry', 'supportOverlays'], ctx) || !isRecord(raw.questionBank)) { issue(ctx, '$.questionBank', 'must be an object'); return { ok: false, issues: ctx.issues } }
  const bank = raw.questionBank
  allowedKeys(bank, '$.questionBank', ['schemaVersion', 'version', 'vocabularyCatalog', 'questions'], ctx)
  if (bank.schemaVersion !== PRACTICE_QUESTION_BANK_SCHEMA_VERSION) issue(ctx, '$.questionBank.schemaVersion', `must equal ${PRACTICE_QUESTION_BANK_SCHEMA_VERSION}`)
  integer(bank.version, '$.questionBank.version', ctx)
  let vocabularyCatalog: PracticeQuestionBank['vocabularyCatalog'] | null = null
  if (!allowedKeys(bank.vocabularyCatalog, '$.questionBank.vocabularyCatalog', ['version', 'terms'], ctx)) { /* issue recorded */ }
  else if (!isRecord(bank.vocabularyCatalog.terms)) issue(ctx, '$.questionBank.vocabularyCatalog.terms', 'must be an object')
  else { const validVersion = integer(bank.vocabularyCatalog.version, '$.questionBank.vocabularyCatalog.version', ctx); let usable = validVersion; for (const [termId, term] of Object.entries(bank.vocabularyCatalog.terms)) { id(termId, `$.questionBank.vocabularyCatalog.terms.${termId}`, ctx); if (!allowedKeys(term, `$.questionBank.vocabularyCatalog.terms.${termId}`, ['surfaceJa', 'explanationJa'], ctx)) { usable = false; continue }; if (!string(term.surfaceJa, `$.questionBank.vocabularyCatalog.terms.${termId}.surfaceJa`, ctx)) usable = false; if (term.explanationJa !== undefined) string(term.explanationJa, `$.questionBank.vocabularyCatalog.terms.${termId}.explanationJa`, ctx) }; if (usable) vocabularyCatalog = bank.vocabularyCatalog as PracticeQuestionBank['vocabularyCatalog'] }
  if (!Array.isArray(bank.questions) || bank.questions.length === 0) issue(ctx, '$.questionBank.questions', 'must be a non-empty array')
  else bank.questions.forEach((question, index) => validateQuestion(question, `$.questionBank.questions[${index}]`, ctx))
  const questions = Array.isArray(bank.questions) ? bank.questions.filter(isRecord) as PracticeQuestion[] : []
  unique(questions.map((question) => `${question.id}\u0000${question.version}`), '$.questionBank.questions', ctx)
  if (vocabularyCatalog) for (const [index, question] of questions.entries()) {
    const vocabularyTermIds = question.itemAnalysis?.vocabularyTermIds
    if (!Array.isArray(vocabularyTermIds)) continue
    for (const termId of vocabularyTermIds) if (!Object.hasOwn(vocabularyCatalog.terms, termId)) issue(ctx, `$.questionBank.questions[${index}].itemAnalysis.vocabularyTermIds`, 'must reference a vocabulary-catalog term')
  }
  if (options.requireReleased) questions.forEach((question, index) => { if (question.status !== 'released') issue(ctx, `$.questionBank.questions[${index}].status`, 'must be released before server import') })
  const declaredCheckpointRefs = questions.map((question) => isRecord(question.itemAnalysis) && question.itemAnalysis.diagnosticCheckpoints !== undefined ? question.itemAnalysis.diagnosticCheckpoints : undefined)
  if (raw.checkpointRegistry === undefined) declaredCheckpointRefs.forEach((reference, index) => { if (reference !== undefined) issue(ctx, `$.questionBank.questions[${index}].itemAnalysis.diagnosticCheckpoints`, 'requires a matching checkpoint registry') })
  else if (validateCheckpointRegistry(raw.checkpointRegistry, questions, ctx)) { for (const [index, question] of questions.entries()) { const refs = declaredCheckpointRefs[index]; if (!isRecord(refs) || !integer(refs.registryVersion, `$.questionBank.questions[${index}].itemAnalysis.diagnosticCheckpoints.registryVersion`, ctx) || !Array.isArray(refs.ids) || refs.ids.some((entry) => typeof entry !== 'string')) continue; if (refs.registryVersion !== raw.checkpointRegistry.version) issue(ctx, `$.questionBank.questions[${index}].itemAnalysis.diagnosticCheckpoints.registryVersion`, 'must match the supplied checkpoint registry'); for (const checkpointId of refs.ids) { const checkpoint = raw.checkpointRegistry.checkpoints.find((entry) => entry.id === checkpointId); if (!checkpoint || checkpoint.questionId !== question.id || checkpoint.questionVersion !== question.version) issue(ctx, `$.questionBank.questions[${index}].itemAnalysis.diagnosticCheckpoints.ids`, 'must resolve to this question in the supplied registry') } } }
  if (raw.supportOverlays !== undefined && vocabularyCatalog) validateOverlays(raw.supportOverlays, questions, vocabularyCatalog, ctx)
  return ctx.issues.length === 0 ? { ok: true, value: raw as PrivatePracticeQuestionBankSource } : { ok: false, issues: ctx.issues }
}
