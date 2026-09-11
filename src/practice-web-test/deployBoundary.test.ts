import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isCanonicalPrivatePracticeFilename,
  isContractShapedPracticeAuthoringCsv,
  isContractShapedPracticeQuestionBankJson,
  privatePracticeArtifactReason,
  stripQueryAndHash,
} from '../../scripts/lib/private-practice-artifact'
import packageJson from '../../package.json'

const AUTHORING_HEADER =
  'id,version,status,testFamily,domain,category,subcategory,deliveryProfile,practiceProfile,difficulty,targetSeconds,releaseNotes,promptJa,answerJson,coreExplanationJson,itemAnalysisJson,provenanceJson'

const CONTRACT_BANK = JSON.stringify({
  questionBank: {
    schemaVersion: 1,
    version: 1,
    vocabularyCatalog: { version: 1, terms: {} },
    questions: [],
  },
})

describe('canonical browser deployment boundary', () => {
  it('runs the boundary guard before either Cloudflare Pages artifact build', () => {
    expect(packageJson.scripts['build:library:deploy']).toMatch(/^pnpm check:public-content-boundary && /)
    expect(packageJson.scripts['build:career-game:deploy']).toMatch(/^pnpm check:public-content-boundary && /)
  })

  it('keeps GitHub source admission in clean, public-only checkouts', () => {
    const workflow = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8')
    expect(workflow).toContain('ref: ${{ github.event.pull_request.head.sha || github.sha }}')
    expect(workflow.match(/persist-credentials: false/g)).toHaveLength(2)
    expect(workflow.match(/run: pnpm check:public-content-boundary/g)).toHaveLength(2)
    expect(workflow).not.toContain('business-japanese-hub-content')
  })

  it('records hosted checkout, not local builds, as artifact-isolation authority', () => {
    const deploymentGuide = readFileSync(resolve(import.meta.dirname, '../../docs/deployment.md'), 'utf8')
    expect(deploymentGuide).toContain('Clean hosted checkout is the frontend artifact-admission authority.')
    expect(deploymentGuide).toMatch(/must not mount, check out, copy, or otherwise make the\s+private canonical content repository available/)
  })

  it('rejects every canonical private Practice artifact filename', () => {
    const names = ['practice-question-bank.json', 'practice-question-bank.csv', 'practice-question-bank-base.json', 'practice-questions.csv']
    for (const name of names) {
      expect(isCanonicalPrivatePracticeFilename(name)).toBe(true)
      expect(isCanonicalPrivatePracticeFilename(`private/nested/${name}`)).toBe(true)
    }
    expect(isCanonicalPrivatePracticeFilename('practice-question-bank.txt')).toBe(false)
    expect(isCanonicalPrivatePracticeFilename('practice-question-bank.json.example')).toBe(false)
    expect(isCanonicalPrivatePracticeFilename('README.md')).toBe(false)
  })

  it('ignores ?query/#hash suffixes when matching canonical names', () => {
    expect(stripQueryAndHash('practice-question-bank.json?raw=1')).toBe('practice-question-bank.json')
    expect(stripQueryAndHash('authoring/answers.csv#L10')).toBe('authoring/answers.csv')
    expect(isCanonicalPrivatePracticeFilename('private/practice-questions.csv?v=2#row')).toBe(true)
  })

  it('detects a renamed contract-shaped private bank, BOM included', () => {
    expect(privatePracticeArtifactReason('private/opaque-bank.txt', CONTRACT_BANK)).toBe('question bank shape')
    expect(privatePracticeArtifactReason('private/practice-question-bank.json.bak', CONTRACT_BANK)).toBe('question bank shape')
    expect(isContractShapedPracticeQuestionBankJson(`\uFEFF${CONTRACT_BANK}`)).toBe(true)
    expect(isContractShapedPracticeQuestionBankJson(JSON.stringify({ questionBank: { schemaVersion: 1, version: 1, vocabularyCatalog: { version: 1, terms: {} } } }))).toBe(true)
    expect(isContractShapedPracticeQuestionBankJson(CONTRACT_BANK)).toBe(true)
  })

  it('does not flag ordinary JSON data or incomplete bank shapes', () => {
    expect(isContractShapedPracticeQuestionBankJson('{"rows":[1,2,3]}')).toBe(false)
    expect(isContractShapedPracticeQuestionBankJson('[{"id":"fixture"}]')).toBe(false)
    expect(isContractShapedPracticeQuestionBankJson('{"schemaVersion":2,"slugs":[]}')).toBe(false)
    expect(isContractShapedPracticeQuestionBankJson('not json')).toBe(false)
    expect(isContractShapedPracticeQuestionBankJson('{"questionBank":{"schemaVersion":2,"version":1,"vocabularyCatalog":{"version":1,"terms":{}}}}')).toBe(false)
    expect(isContractShapedPracticeQuestionBankJson('{"questionBank":{"schemaVersion":1,"version":"1","vocabularyCatalog":{"version":1,"terms":{}}}}')).toBe(false)
    expect(isContractShapedPracticeQuestionBankJson('{"questionBank":{"schemaVersion":1,"version":1,"vocabularyCatalog":{"version":1,"terms":[]}}}')).toBe(false)
    expect(isContractShapedPracticeQuestionBankJson('{"questionBank":{"schemaVersion":1,"version":1,"vocabularyCatalog":{"version":1,"terms":{}},"questions":{}}}')).toBe(false)
  })

  it('detects a renamed contract-shaped authoring CSV, BOM included', () => {
    const csv = `${AUTHORING_HEADER}\nfixture-1,1,released,fixture,verbal,fixture,,web,untimed-learning,foundation,30,fixture release,問題,"{}","{}","{}","{}"\n`
    expect(isContractShapedPracticeAuthoringCsv(csv)).toBe(true)
    expect(isContractShapedPracticeAuthoringCsv(`\uFEFF${csv}`)).toBe(true)
    expect(privatePracticeArtifactReason('archive/answers.backup', csv)).toBe('authoring CSV shape')
  })

  it('does not flag ordinary CSV data', () => {
    expect(isContractShapedPracticeAuthoringCsv('id,name\n1,example\n')).toBe(false)
    expect(isContractShapedPracticeAuthoringCsv('a,b,c\n1,2,3\n')).toBe(false)
    expect(isContractShapedPracticeAuthoringCsv('')).toBe(false)
  })
})
