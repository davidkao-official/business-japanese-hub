/**
 * Deterministic private-source CSV adapter. Each JSON-valued column is kept
 * explicit so editorial tools can preserve rich input/answer data without a
 * React component or a public production fixture.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { repoRoot } from '../lib/books'

const REQUIRED_COLUMNS = ['id', 'version', 'status', 'testFamily', 'domain', 'category', 'subcategory', 'deliveryProfile', 'practiceProfile', 'difficulty', 'targetSeconds', 'releaseNotes', 'promptJa', 'answerJson', 'coreExplanationJson', 'itemAnalysisJson', 'provenanceJson'] as const

function outsidePublicRepository(path: string): boolean {
  const relationship = relative(repoRoot(), path)
  return relationship === '..' || relationship.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

/** Minimal RFC-4180 reader for the one-sheet authoring interchange. */
export function parsePracticeCsv(csv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], value = '', quoted = false
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') { value += '"'; index += 1 } else if (char === '"') quoted = false
      else value += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(value); value = '' }
    else if (char === '\n' || char === '\r') { if (char === '\r' && csv[index + 1] === '\n') index += 1; row.push(value); rows.push(row); row = []; value = '' }
    else value += char
  }
  if (quoted) throw new Error('unterminated quoted CSV field')
  if (value !== '' || row.length > 0) { row.push(value); rows.push(row) }
  return rows.filter((entry) => entry.some((field) => field !== ''))
}

export function convertPracticeQuestionCsv(csv: string, base: unknown): unknown {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) throw new Error('base artifact must be an object')
  const rows = parsePracticeCsv(csv)
  const [header, ...body] = rows
  if (!header || REQUIRED_COLUMNS.some((column) => !header.includes(column))) throw new Error('CSV header is missing a required authoring column')
  const column = Object.fromEntries(header.map((name, index) => [name, index])) as Record<string, number>
  const questions = body.map((row, rowIndex) => {
    if (row.length !== header.length) throw new Error(`CSV row ${rowIndex + 2} has a different column count`)
    const read = (name: string) => row[column[name]!]
    try {
      return {
        id: read('id'), version: Number(read('version')), status: read('status'), testFamily: read('testFamily'), domain: read('domain'), category: read('category'),
        ...(read('subcategory') ? { subcategory: read('subcategory') } : {}), deliveryProfile: read('deliveryProfile'), practiceProfile: read('practiceProfile'), difficulty: read('difficulty'),
        ...(read('targetSeconds') ? { targetSeconds: Number(read('targetSeconds')) } : {}), ...(read('releaseNotes') ? { releaseNotes: read('releaseNotes') } : {}), promptJa: read('promptJa'), answer: JSON.parse(read('answerJson')!), coreExplanation: JSON.parse(read('coreExplanationJson')!), itemAnalysis: JSON.parse(read('itemAnalysisJson')!), provenance: JSON.parse(read('provenanceJson')!),
      }
    } catch { throw new Error(`CSV row ${rowIndex + 2} has invalid JSON or numeric metadata`) }
  })
  const baseRecord = base as Record<string, unknown>
  const existingQuestionBank = baseRecord.questionBank
  if (typeof existingQuestionBank !== 'object' || existingQuestionBank === null || Array.isArray(existingQuestionBank)) throw new Error('base artifact must contain a questionBank object')
  return { ...baseRecord, questionBank: { ...(existingQuestionBank as Record<string, unknown>), questions } }
}

const args = process.argv.slice(2)
const arg = (name: string) => args.find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1)
const source = arg('--source'), output = arg('--output')
if (source !== undefined || output !== undefined) {
  if (!source || !output || !outsidePublicRepository(resolve(source)) || !outsidePublicRepository(resolve(output))) {
    console.error('ERR  pass --source=<private CSV> and --output=<private JSON outside the public repository>')
    process.exitCode = 1
  } else {
    try {
      const basePath = resolve(resolve(source), '..', 'practice-question-bank-base.json')
      const converted = convertPracticeQuestionCsv(readFileSync(resolve(source), 'utf8'), JSON.parse(readFileSync(basePath, 'utf8')) as unknown)
      writeFileSync(resolve(output), `${JSON.stringify(converted, null, 2)}\n`)
      console.log('ok   converted private practice CSV without logging question bodies')
    } catch (error) {
      console.error(`ERR  ${error instanceof Error ? error.message : 'private CSV conversion failed'}`)
      process.exitCode = 1
    }
  }
}
