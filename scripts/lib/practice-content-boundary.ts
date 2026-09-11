import { extname } from 'node:path'

const PRACTICE_CSV_REQUIRED_COLUMNS = [
  'id', 'version', 'status', 'testFamily', 'domain', 'category', 'subcategory',
  'deliveryProfile', 'practiceProfile', 'difficulty', 'targetSeconds', 'releaseNotes',
  'promptJa', 'answerJson', 'coreExplanationJson', 'itemAnalysisJson', 'provenanceJson',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstCsvRow(csv: string): string[] | null {
  const row: string[] = []
  let value = '', quoted = false
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') { value += '"'; index += 1 }
      else if (char === '"') quoted = false
      else value += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(value); value = '' }
    else if (char === '\n' || char === '\r') { row.push(value); return row }
    else value += char
  }
  return quoted ? null : [...row, value]
}

function hasPracticeQuestionBankShape(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.questionBank)) return false
  const bank = value.questionBank
  return bank.schemaVersion === 1 &&
    typeof bank.version === 'number' &&
    isRecord(bank.vocabularyCatalog) &&
    typeof bank.vocabularyCatalog.version === 'number' &&
    isRecord(bank.vocabularyCatalog.terms) &&
    (bank.questions === undefined || Array.isArray(bank.questions))
}

/** Detect the bounded #114 private authoring contracts without relying on filenames. */
export function isPrivatePracticeAuthoringArtifact(path: string, content: string): boolean {
  const extension = extname(path).toLowerCase()
  if (extension === '.json') {
    try {
      return hasPracticeQuestionBankShape(JSON.parse(content.replace(/^\uFEFF/, '')) as unknown)
    } catch {
      return false
    }
  }
  if (extension !== '.csv') return false
  const header = firstCsvRow(content.replace(/^\uFEFF/, ''))
  return header !== null && PRACTICE_CSV_REQUIRED_COLUMNS.every((column) => header.includes(column))
}

/** Normalizes Rollup's supported input shapes into paths relative to the Vite root. */
export function viteBuildInputPaths(input: unknown): string[] | null {
  if (input === undefined) return []
  if (typeof input === 'string') return [input]
  if (Array.isArray(input)) return input.every((entry) => typeof entry === 'string') ? [...new Set(input)] : null
  if (!isRecord(input)) return null
  const entries = Object.values(input)
  return entries.every((entry) => typeof entry === 'string') ? [...new Set(entries)] : null
}
