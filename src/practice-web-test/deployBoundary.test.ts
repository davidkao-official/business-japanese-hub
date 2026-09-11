import { describe, expect, it } from 'vitest'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isPrivatePracticeAuthoringArtifact, viteBuildInputPaths } from '../../scripts/lib/practice-content-boundary'
import { configuredViteBuildEntries } from '../../scripts/lib/vite-build-input'
import { viteHtmlModuleScripts } from '../../scripts/lib/vite-html-entry'
import packageJson from '../../package.json'

describe('canonical browser deployment boundary', () => {
  it('runs the boundary guard before the Career Game deploy artifact build', () => {
    expect(packageJson.scripts['build:career-game:deploy']).toMatch(/^pnpm check:public-content-boundary && /)
  })

  it('parses external and inline canonical-style Vite HTML module entries', () => {
    expect(viteHtmlModuleScripts('<script type="module" src="./practice-web-test/fixtures/nonProprietaryPracticeFixture.ts"></script>')).toEqual([{ source: './practice-web-test/fixtures/nonProprietaryPracticeFixture.ts', content: '' }])
    expect(viteHtmlModuleScripts('<script type=module>import "./practice-web-test/fixtures/nonProprietaryPracticeFixture.ts"</script>')).toEqual([{ content: 'import "./practice-web-test/fixtures/nonProprietaryPracticeFixture.ts"' }])
  })

  it('rejects renamed contract-shaped private Practice JSON and CSV without blocking unrelated data files', () => {
    const privateBank = JSON.stringify({
      questionBank: {
        schemaVersion: 1,
        version: 1,
        vocabularyCatalog: { version: 1, terms: {} },
        questions: [],
      },
    })
    const csvHeader = 'id,version,status,testFamily,domain,category,subcategory,deliveryProfile,practiceProfile,difficulty,targetSeconds,releaseNotes,promptJa,answerJson,coreExplanationJson,itemAnalysisJson,provenanceJson\n'

    expect(isPrivatePracticeAuthoringArtifact('/tmp/renamed-bank.json', privateBank)).toBe(true)
    expect(isPrivatePracticeAuthoringArtifact('/tmp/renamed-bank.csv', csvHeader)).toBe(true)
    expect(isPrivatePracticeAuthoringArtifact('/tmp/ordinary.json', JSON.stringify({ version: 1, records: [] }))).toBe(false)
    expect(isPrivatePracticeAuthoringArtifact('/tmp/ordinary.csv', 'id,name\n1,fixture\n')).toBe(false)
  })

  it('normalizes all supported configured Vite input forms and rejects unknown forms', () => {
    expect(viteBuildInputPaths('src/entry.ts')).toEqual(['src/entry.ts'])
    expect(viteBuildInputPaths(['src/entry.ts', 'src/entry.ts'])).toEqual(['src/entry.ts'])
    expect(viteBuildInputPaths({ library: 'src/entry.ts', careerGame: 'apps/career-game/src/main.tsx' })).toEqual(['src/entry.ts', 'apps/career-game/src/main.tsx'])
    expect(viteBuildInputPaths({ invalid: 1 })).toBeNull()
  })

  it('loads configured Rollup input roots for browser inspection', async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'bjh-vite-input-'))
    const configPath = join(temporaryRoot, 'vite.config.ts')
    try {
      const resolvedRoot = realpathSync(temporaryRoot)
      writeFileSync(configPath, "export default { root: 'browser', build: { rollupOptions: { input: { privateWrapper: 'src/private-wrapper.ts' } } } }\n")
      await expect(configuredViteBuildEntries(temporaryRoot, [configPath])).resolves.toEqual([
        { path: join(resolvedRoot, 'browser', 'src', 'private-wrapper.ts'), viteRoot: join(resolvedRoot, 'browser'), configPath },
      ])
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('includes Rollup browser roots added by Vite config plugins', async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'bjh-vite-plugin-entry-'))
    const configPath = join(temporaryRoot, 'vite.config.ts')
    try {
      const resolvedRoot = realpathSync(temporaryRoot)
      writeFileSync(
        configPath,
        "export default { plugins: [{ name: 'private-browser-entry', config() { return { build: { rollupOptions: { input: { privateWrapper: 'src/private-wrapper.ts' } } } } } }] }\n",
      )
      await expect(configuredViteBuildEntries(temporaryRoot, [configPath])).resolves.toEqual([
        { path: join(resolvedRoot, 'src', 'private-wrapper.ts'), viteRoot: resolvedRoot, configPath },
      ])
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('uses a Vite root default index.html when configured input is omitted', async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'bjh-vite-default-entry-'))
    const configPath = join(temporaryRoot, 'vite.config.ts')
    try {
      const resolvedRoot = realpathSync(temporaryRoot)
      writeFileSync(configPath, "export default { root: 'browser' }\n")
      await expect(configuredViteBuildEntries(temporaryRoot, [configPath])).resolves.toEqual([
        { path: join(resolvedRoot, 'browser', 'index.html'), viteRoot: join(resolvedRoot, 'browser'), configPath },
      ])
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })
})
