import { describe, expect, it } from 'vitest'
import { convertPracticeQuestionCsv, parsePracticeCsv } from '../../scripts/private-content/convert-practice-question-csv'

const header = 'id,version,status,testFamily,domain,category,subcategory,deliveryProfile,practiceProfile,difficulty,targetSeconds,releaseNotes,promptJa,answerJson,coreExplanationJson,itemAnalysisJson,provenanceJson'
const answer = '{"input":{"kind":"short-text"},"expectedAnswer":{"kind":"short-text","value":"答"},"scoring":{"kind":"exact-text"}}'
const explanation = '{"concise":"説明","whatIsAskedJa":"答えること"}'
const analysis = '{"languageLoads":[],"reasoningLoads":[],"executionLoads":[]}'
const provenance = '{"authoredBy":"fixture","reviewedBy":["reviewer"],"createdAt":"2026-09-10T00:00:00.000Z","updatedAt":"2026-09-10T00:00:00.000Z","basis":["synthetic"],"originalContentAttestation":true}'

function csvField(value: string): string { return `"${value.replaceAll('"', '""')}"` }

describe('private Practice CSV converter', () => {
  it('keeps quoted Japanese and JSON cells deterministic without writing a public artifact', () => {
    const csv = `${header}\nfixture-1,1,released,fixture,verbal,fixture,,web,untimed-learning,foundation,30,fixture release,${csvField('「答」を選ぶ。')},${csvField(answer)},${csvField(explanation)},${csvField(analysis)},${csvField(provenance)}\n`
    const converted = convertPracticeQuestionCsv(csv, { questionBank: { schemaVersion: 1, version: 1, vocabularyCatalog: { version: 1, terms: {} } } }) as { questionBank: { questions: Array<{ promptJa: string; answer: { input: { kind: string } } }> } }
    expect(converted.questionBank.questions[0]).toMatchObject({ promptJa: '「答」を選ぶ。', answer: { input: { kind: 'short-text' } } })
  })

  it('accepts a spreadsheet-exported initial UTF-8 BOM on the authoring header only', () => {
    const csv = `\uFEFF${header}\nfixture-1,1,released,fixture,verbal,fixture,,web,untimed-learning,foundation,30,fixture release,${csvField('「答」を選ぶ。')},${csvField(answer)},${csvField(explanation)},${csvField(analysis)},${csvField(provenance)}\n`
    const converted = convertPracticeQuestionCsv(csv, { questionBank: { schemaVersion: 1, version: 1, vocabularyCatalog: { version: 1, terms: {} } } }) as { questionBank: { questions: Array<{ id: string; promptJa: string }> } }
    expect(converted.questionBank.questions).toMatchObject([{ id: 'fixture-1', promptJa: '「答」を選ぶ。' }])
  })

  it('rejects an unterminated quoted CSV field', () => {
    expect(() => parsePracticeCsv('id\n"unterminated')).toThrow('unterminated quoted CSV field')
  })

  it('preserves an optional prompt representation JSON column', () => {
    const representation = '{"kind":"table","columns":["A","B"],"rows":[["0","0"]]}'
    const extendedHeader = `${header},promptRepresentationJson`
    const csv = `${extendedHeader}\nfixture-1,1,released,fixture,verbal,fixture,,web,untimed-learning,foundation,30,fixture release,${csvField('表を読んで答える。')},${csvField(answer)},${csvField(explanation)},${csvField(analysis)},${csvField(provenance)},${csvField(representation)}\n`
    const converted = convertPracticeQuestionCsv(csv, { questionBank: { schemaVersion: 1, version: 1, vocabularyCatalog: { version: 1, terms: {} } } }) as { questionBank: { questions: Array<{ promptRepresentation: unknown }> } }
    expect(converted.questionBank.questions[0]!.promptRepresentation).toEqual(JSON.parse(representation))
  })

  it('rejects unknown or duplicate headers instead of discarding authoring fields', () => {
    const row = `fixture-1,1,released,fixture,verbal,fixture,,web,untimed-learning,foundation,30,fixture release,${csvField('問題')},${csvField(answer)},${csvField(explanation)},${csvField(analysis)},${csvField(provenance)}`
    expect(() => convertPracticeQuestionCsv(`${header},officialTimeSeconds\n${row},30\n`, { questionBank: {} })).toThrow('unknown or duplicate')
    expect(() => convertPracticeQuestionCsv(`${header},promptJa\n${row},重複\n`, { questionBank: {} })).toThrow('unknown or duplicate')
  })
})
