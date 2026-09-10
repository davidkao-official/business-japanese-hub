import { describe, expect, it } from 'vitest'
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
})
