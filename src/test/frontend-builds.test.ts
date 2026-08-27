import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const libraryOutput = join(process.cwd(), 'dist')
const careerGameOutput = join(process.cwd(), 'dist-career-game')

function outputFingerprint(root: string): string[] {
  const paths: string[] = []

  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(absolutePath)
        continue
      }

      const digest = createHash('sha256').update(readFileSync(absolutePath)).digest('hex')
      paths.push(`${relative(root, absolutePath)}:${digest}`)
    }
  }

  visit(root)
  return paths.sort()
}

function builtAssetReferences(html: string): string[] {
  return [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((reference): reference is string => reference?.startsWith('/assets/') === true)
}

describe('dual-frontend build topology', () => {
  beforeAll(() => {
    rmSync(libraryOutput, { recursive: true, force: true })
    rmSync(careerGameOutput, { recursive: true, force: true })
    execFileSync('pnpm', ['build'], { cwd: process.cwd(), stdio: 'pipe' })
  }, 30_000)

  it('the root build emits independent Library and Career Game HTML/assets', () => {
    expect(existsSync(join(libraryOutput, 'index.html'))).toBe(true)
    expect(existsSync(join(careerGameOutput, 'index.html'))).toBe(true)

    const libraryHtml = readFileSync(join(libraryOutput, 'index.html'), 'utf8')
    const careerGameHtml = readFileSync(join(careerGameOutput, 'index.html'), 'utf8')

    expect(builtAssetReferences(libraryHtml)).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.js$/), expect.stringMatching(/\.css$/)]),
    )
    expect(builtAssetReferences(careerGameHtml)).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.js$/), expect.stringMatching(/\.css$/)]),
    )
    expect(careerGameHtml).toContain('<title>キャリアゲーム | Business Japanese Hub</title>')
  })

  it('a Career Game rebuild leaves the Library artifact byte-for-byte unchanged', () => {
    const libraryBefore = outputFingerprint(libraryOutput)

    execFileSync('pnpm', ['build:career-game'], { cwd: process.cwd(), stdio: 'pipe' })

    expect(outputFingerprint(libraryOutput)).toEqual(libraryBefore)
  })
})
