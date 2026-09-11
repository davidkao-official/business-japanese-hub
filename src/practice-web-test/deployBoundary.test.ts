import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { build, type Plugin } from 'vite'
import { isPrivatePracticeAuthoringArtifact, stripViteSpecifierSuffix, viteBuildInputPaths } from '../../scripts/lib/practice-content-boundary'
import { assertNoExternalDependencyProtocols, type PublicRollupOutput, validatePublicBuildProvenance } from '../../scripts/lib/public-build-provenance'
import packageJson from '../../package.json'

function privateBank(): string {
  return JSON.stringify({ questionBank: { schemaVersion: 1, version: 1, vocabularyCatalog: { version: 1, terms: {} }, questions: [] } })
}

async function fixtureOutput(root: string, plugin?: Plugin): Promise<PublicRollupOutput[]> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    ...(plugin ? { plugins: [plugin] } : {}),
    build: { assetsInlineLimit: 0, write: false },
  })
  return (Array.isArray(result) ? result : [result]) as unknown as PublicRollupOutput[]
}

function fixtureRoot(prefix: string): { root: string; source: string } {
  const root = mkdtempSync(join(tmpdir(), prefix))
  const source = join(root, 'src')
  mkdirSync(source)
  writeFileSync(join(root, 'index.html'), '<script type="module" src="/src/main.ts"></script>')
  return { root, source }
}

describe('canonical browser deployment boundary', () => {
  it('runs the provenance-checked boundary before both deploy artifact builds', () => {
    expect(packageJson.scripts['build:library']).toBe('tsx scripts/build-public-frontend.ts library')
    expect(packageJson.scripts['build:career-game']).toBe('tsx scripts/build-public-frontend.ts career-game')
    expect(packageJson.scripts['build:career-game:deploy']).toMatch(/^pnpm check:public-content-boundary && /)
  })

  it('rejects renamed contract-shaped private Practice JSON and CSV without blocking unrelated data files', () => {
    const csvHeader = 'id,version,status,testFamily,domain,category,subcategory,deliveryProfile,practiceProfile,difficulty,targetSeconds,releaseNotes,promptJa,answerJson,coreExplanationJson,itemAnalysisJson,provenanceJson\n'
    expect(isPrivatePracticeAuthoringArtifact('/tmp/renamed-bank.json', privateBank())).toBe(true)
    expect(isPrivatePracticeAuthoringArtifact('/tmp/renamed-bank.csv', csvHeader)).toBe(true)
    expect(isPrivatePracticeAuthoringArtifact('/tmp/practice-question-bank-base.json', '{"incomplete":true}')).toBe(true)
    expect(isPrivatePracticeAuthoringArtifact('/tmp/practice-questions.csv', 'id,name\n1,draft\n')).toBe(true)
    expect(isPrivatePracticeAuthoringArtifact('/tmp/ordinary.json', JSON.stringify({ version: 1, records: [] }))).toBe(false)
    expect(stripViteSpecifierSuffix('../../private-content/practice-question-bank.json?raw#cache')).toBe('../../private-content/practice-question-bank.json')
  })

  it('normalizes the supported Vite input forms and rejects unknown forms', () => {
    expect(viteBuildInputPaths('src/entry.ts')).toEqual(['src/entry.ts'])
    expect(viteBuildInputPaths(['src/entry.ts', 'src/entry.ts'])).toEqual(['src/entry.ts'])
    expect(viteBuildInputPaths({ library: 'src/entry.ts', careerGame: 'apps/career-game/src/main.tsx' })).toEqual(['src/entry.ts', 'apps/career-game/src/main.tsx'])
    expect(viteBuildInputPaths({ invalid: 1 })).toBeNull()
  })

  it('rejects an external asset expanded by Vite import.meta.glob', async () => {
    const { root, source } = fixtureRoot('bjh-vite-glob-')
    const outside = mkdtempSync(join(tmpdir(), 'bjh-private-glob-'))
    try {
      writeFileSync(join(outside, 'bank.json'), privateBank())
      writeFileSync(join(source, 'main.ts'), `console.log(import.meta.glob('${join(relative(source, outside), '*.json')}', { eager: true, query: '?raw', import: 'default' }))\n`)
      await expect(fixtureOutput(root).then((output) => validatePublicBuildProvenance(output, root, root))).rejects.toThrow(/outside the repository/)
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('rejects Vite-normalized HTML and CSS paths that resolve outside the repository', async () => {
    const { root, source } = fixtureRoot('bjh-vite-normalized-')
    const outside = mkdtempSync(join(tmpdir(), 'bjh-private-normalized-'))
    try {
      writeFileSync(join(outside, 'private.svg'), '<svg><text>private</text></svg>')
      const external = relative(root, join(outside, 'private.svg'))
      writeFileSync(join(root, 'index.html'), `<img src="${external.replace('.svg', '%2esvg')}"><script type="module" src="/src/main.ts"></script>`)
      writeFileSync(join(source, 'main.ts'), "import './style.css'\n")
      writeFileSync(join(source, 'style.css'), `.logo { background: url('${relative(source, join(outside, 'private.svg')).replace('.svg', '\\\\.svg')}') }`)
      await expect(fixtureOutput(root).then((output) => validatePublicBuildProvenance(output, root, root))).rejects.toThrow(/outside the repository/)
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('rejects a plugin-emitted asset without source provenance', async () => {
    const { root, source } = fixtureRoot('bjh-vite-plugin-output-')
    try {
      writeFileSync(join(source, 'main.ts'), 'console.log("public")\n')
      const plugin: Plugin = { name: 'spoofed-public-plugin', generateBundle() { this.emitFile({ type: 'asset', fileName: 'private.txt', source: 'private' }) } }
      await expect(fixtureOutput(root, plugin).then((output) => validatePublicBuildProvenance(output, root, root))).rejects.toThrow(/unprovenanced asset/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('accepts only the exact deployment-identity generated asset contracts', () => {
    const root = mkdtempSync(join(tmpdir(), 'bjh-generated-asset-'))
    try {
      const output: PublicRollupOutput[] = [{
        output: [{
          type: 'asset',
          fileName: 'build-info.json',
          originalFileNames: [],
          source: '{"schemaVersion":1,"product":"library","commitSha":"0000000000000000000000000000000000000000","private":"no"}',
        }],
      }]
      expect(() => validatePublicBuildProvenance(output, root, root)).toThrow(/invalid generated build-info asset/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects sibling-checkout dependency protocols before Vite resolves a bare import', () => {
    const root = mkdtempSync(join(tmpdir(), 'bjh-file-dependency-'))
    try {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { 'private-wrapper': 'file:../private-content' } }))
      expect(() => assertNoExternalDependencyProtocols(root)).toThrow(/external dependency protocol/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
