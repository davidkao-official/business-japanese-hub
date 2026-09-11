import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isPrivatePracticeAuthoringArtifact, stripViteSpecifierSuffix, viteBuildInputPaths } from '../../scripts/lib/practice-content-boundary'
import { configuredViteBuildEntries, isApprovedVitePublicDir } from '../../scripts/lib/vite-build-input'
import { hasFixtureHtmlEntryBypass, hasUnsafeBrowserModuleGraph } from '../../scripts/lib/browser-module-boundary'
import { viteHtmlModuleScripts, viteHtmlStylesheets } from '../../scripts/lib/vite-html-entry'
import packageJson from '../../package.json'

describe('canonical browser deployment boundary', () => {
  it('runs the boundary guard before the Career Game deploy artifact build', () => {
    expect(packageJson.scripts['build:career-game:deploy']).toMatch(/^pnpm check:public-content-boundary && /)
  })

  it('parses external and inline canonical-style Vite HTML module entries', () => {
    expect(viteHtmlModuleScripts('<script type="module" src="./practice-web-test/fixtures/nonProprietaryPracticeFixture.ts"></script>')).toEqual([{ source: './practice-web-test/fixtures/nonProprietaryPracticeFixture.ts', content: '' }])
    expect(viteHtmlModuleScripts('<script type=module>import "./practice-web-test/fixtures/nonProprietaryPracticeFixture.ts"</script>')).toEqual([{ content: 'import "./practice-web-test/fixtures/nonProprietaryPracticeFixture.ts"' }])
    expect(viteHtmlStylesheets('<link rel="stylesheet" href="./style.css"><style>.a { color: red }</style>')).toEqual([{ source: './style.css', content: '' }, { content: '.a { color: red }' }])
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
    expect(isPrivatePracticeAuthoringArtifact('/tmp/practice-question-bank-base.json', '{"incomplete":true}')).toBe(true)
    expect(isPrivatePracticeAuthoringArtifact('/tmp/practice-questions.csv', 'id,name\n1,draft\n')).toBe(true)
    expect(isPrivatePracticeAuthoringArtifact('/tmp/practice-question-bank.json?raw', '{"incomplete":true}')).toBe(true)
    expect(isPrivatePracticeAuthoringArtifact('/tmp/ordinary.json', JSON.stringify({ version: 1, records: [] }))).toBe(false)
    expect(isPrivatePracticeAuthoringArtifact('/tmp/ordinary.csv', 'id,name\n1,fixture\n')).toBe(false)
    expect(stripViteSpecifierSuffix('../../private-content/practice-question-bank.json?raw#cache')).toBe('../../private-content/practice-question-bank.json')
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
        { path: join(resolvedRoot, 'browser', 'src', 'private-wrapper.ts'), viteRoot: join(resolvedRoot, 'browser'), configPath, publicDir: join(resolvedRoot, 'browser', 'public') },
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
        { path: join(resolvedRoot, 'src', 'private-wrapper.ts'), viteRoot: resolvedRoot, configPath, publicDir: join(resolvedRoot, 'public') },
      ])
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('includes Vite 8 top-level and client-environment inputs from config plugins', async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'bjh-vite-environment-entry-'))
    const configPath = join(temporaryRoot, 'vite.config.ts')
    try {
      const resolvedRoot = realpathSync(temporaryRoot)
      writeFileSync(
        configPath,
        "export default { plugins: [{ name: 'private-browser-entry', config() { return { input: 'src/top-level.ts', environments: { client: { input: 'src/private-wrapper.ts' } } } } }] }\n",
      )
      await expect(configuredViteBuildEntries(temporaryRoot, [configPath])).resolves.toEqual([
        { path: join(resolvedRoot, 'src', 'top-level.ts'), viteRoot: resolvedRoot, configPath, publicDir: join(resolvedRoot, 'public') },
        { path: join(resolvedRoot, 'src', 'private-wrapper.ts'), viteRoot: resolvedRoot, configPath, publicDir: join(resolvedRoot, 'public') },
      ])
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('follows Vite resource queries, aliases, extensionless wrappers, and static new URL assets', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'bjh-vite-private-asset-'))
    try {
      const privateDirectory = join(temporaryRoot, 'private')
      const sourceDirectory = join(temporaryRoot, 'src')
      mkdirSync(privateDirectory)
      mkdirSync(sourceDirectory)
      const privateBank = JSON.stringify({ questionBank: { schemaVersion: 1, version: 1, vocabularyCatalog: { version: 1, terms: {} }, questions: [] } })
      writeFileSync(join(privateDirectory, 'renamed-bank.json'), privateBank)
      writeFileSync(join(privateDirectory, 'wrapper.mts'), "export { default as questionBank } from './renamed-bank.json?raw'\n")
      const aliasEntry = join(sourceDirectory, 'alias-entry.ts')
      writeFileSync(aliasEntry, "import '@private/wrapper'\n")
      const urlEntry = join(sourceDirectory, 'url-entry.ts')
      writeFileSync(urlEntry, "new URL('../private/renamed-bank.json?raw', import.meta.url)\n")

      const aliases = [{ find: '@private', replacement: privateDirectory }]
      expect(hasUnsafeBrowserModuleGraph(aliasEntry, temporaryRoot, new Set(), temporaryRoot, undefined, aliases)).toBe(true)
      expect(hasUnsafeBrowserModuleGraph(urlEntry, temporaryRoot)).toBe(true)
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('follows CSS imports and asset URLs into private authoring artifacts', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'bjh-vite-private-css-'))
    try {
      const privateDirectory = join(temporaryRoot, 'private')
      const sourceDirectory = join(temporaryRoot, 'src')
      mkdirSync(privateDirectory)
      mkdirSync(sourceDirectory)
      const privateBank = JSON.stringify({ questionBank: { schemaVersion: 1, version: 1, vocabularyCatalog: { version: 1, terms: {} }, questions: [] } })
      writeFileSync(join(privateDirectory, 'renamed-bank.json'), privateBank)
      writeFileSync(join(sourceDirectory, 'entry.ts'), "import './style.css'\n")
      writeFileSync(join(sourceDirectory, 'style.css'), "@import url('../private/renamed-bank.json');\n.logo { background: url('../private/renamed-bank.json') }\n")

      expect(hasUnsafeBrowserModuleGraph(join(sourceDirectory, 'entry.ts'), temporaryRoot)).toBe(true)
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('follows HTML stylesheet links and inline CSS asset URLs into private authoring artifacts', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'bjh-vite-private-html-css-'))
    try {
      const privateDirectory = join(temporaryRoot, 'private')
      mkdirSync(privateDirectory)
      const privateBank = JSON.stringify({ questionBank: { schemaVersion: 1, version: 1, vocabularyCatalog: { version: 1, terms: {} }, questions: [] } })
      writeFileSync(join(privateDirectory, 'renamed-bank.json'), privateBank)
      const htmlPath = join(temporaryRoot, 'index.html')
      writeFileSync(htmlPath, '<link rel="stylesheet" href="./style.css"><style>.logo { background: url("./private/renamed-bank.json") }</style>')
      writeFileSync(join(temporaryRoot, 'style.css'), '.logo { background: url("./private/renamed-bank.json") }')

      expect(hasFixtureHtmlEntryBypass(htmlPath, temporaryRoot, temporaryRoot)).toBe(true)
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  it('records a configured Vite publicDir so the deploy guard can reject external static inventory', async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'bjh-vite-public-dir-'))
    const configPath = join(temporaryRoot, 'vite.config.ts')
    try {
      const resolvedRoot = realpathSync(temporaryRoot)
      mkdirSync(join(temporaryRoot, 'external'))
      writeFileSync(configPath, "export default { publicDir: 'external' }\n")
      await expect(configuredViteBuildEntries(temporaryRoot, [configPath])).resolves.toEqual([
        { path: join(resolvedRoot, 'index.html'), viteRoot: resolvedRoot, configPath, publicDir: join(resolvedRoot, 'external') },
      ])
      expect(isApprovedVitePublicDir(join(resolvedRoot, 'external'), resolvedRoot, resolvedRoot)).toBe(false)
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
        { path: join(resolvedRoot, 'browser', 'index.html'), viteRoot: join(resolvedRoot, 'browser'), configPath, publicDir: join(resolvedRoot, 'browser', 'public') },
      ])
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })
})
