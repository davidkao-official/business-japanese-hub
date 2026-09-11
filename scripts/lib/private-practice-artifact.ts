/**
 * Public-Git boundary helpers for the private Practice/Web Test authoring
 * artifacts (#114/#136). A complete private question bank — or a renamed copy
 * of one — must never be committed to the public repository or `content-dist`.
 */

/** Canonical filenames reserved for external/private Practice authoring. */
export const PRIVATE_PRACTICE_ARTIFACT_FILENAMES = [
  'practice-question-bank.json',
  'practice-question-bank.csv',
  'practice-question-bank-base.json',
  'practice-questions.csv',
] as const

/**
 * Documented Practice authoring CSV columns. Shared with the deterministic
 * converter so the public-Git guard and the authoring interchange cannot drift.
 */
export const PRACTICE_AUTHORING_REQUIRED_COLUMNS = [
  'id',
  'version',
  'status',
  'testFamily',
  'domain',
  'category',
  'subcategory',
  'deliveryProfile',
  'practiceProfile',
  'difficulty',
  'targetSeconds',
  'releaseNotes',
  'promptJa',
  'answerJson',
  'coreExplanationJson',
  'itemAnalysisJson',
  'provenanceJson',
] as const

/** Removes an optional leading UTF-8 BOM from decoded text. */
export function stripUtf8Bom(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text
}

/** Drops a trailing `?query`/`#hash` suffix from a path-like reference. */
export function stripQueryAndHash(reference: string): string {
  return reference.split(/[?#]/, 1)[0] ?? ''
}

/** True when a path-like reference ends in a reserved private Practice filename. */
export function isCanonicalPrivatePracticeFilename(reference: string): boolean {
  const name = stripQueryAndHash(reference).split(/[/\\]/).at(-1) ?? ''
  return (PRIVATE_PRACTICE_ARTIFACT_FILENAMES as readonly string[]).includes(name)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Detects the documented `questionBank` envelope regardless of filename, so a
 * renamed private bank cannot slip past the canonical-name check. Kept to the
 * minimum identifying fields to avoid flagging ordinary JSON fixtures.
 */
export function isContractShapedPracticeQuestionBankJson(text: string): boolean {
  let document: unknown
  try {
    document = JSON.parse(stripUtf8Bom(text))
  } catch {
    return false
  }
  if (!isPlainObject(document) || !isPlainObject(document.questionBank)) return false
  const bank = document.questionBank
  if (bank.schemaVersion !== 1 || typeof bank.version !== 'number') return false
  if (!isPlainObject(bank.vocabularyCatalog)) return false
  if (typeof bank.vocabularyCatalog.version !== 'number' || !isPlainObject(bank.vocabularyCatalog.terms)) return false
  return bank.questions === undefined || Array.isArray(bank.questions)
}

/** Reads only the first CSV row, honoring quoted cells and embedded commas. */
function firstCsvRow(text: string): string[] {
  const row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (char === '"') quoted = false
      else value += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(value)
      value = ''
    } else if (char === '\n' || char === '\r') {
      row.push(value)
      return row
    } else value += char
  }
  row.push(value)
  return row
}

/**
 * Detects a renamed authoring interchange CSV by requiring every documented
 * header. Ordinary data CSVs do not carry the full Practice authoring header.
 */
export function isContractShapedPracticeAuthoringCsv(text: string): boolean {
  const header = new Set(firstCsvRow(stripUtf8Bom(text)))
  return PRACTICE_AUTHORING_REQUIRED_COLUMNS.every((column) => header.has(column))
}
