import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'vite'

let outputDirectory = ''
let builtHtml = ''
let builtCss = ''

beforeAll(async () => {
  outputDirectory = mkdtempSync(join(tmpdir(), 'bjh-career-game-appearance-'))
  await build({
    configFile: join(process.cwd(), 'vite.career-game.config.ts'),
    logLevel: 'silent',
    build: { outDir: outputDirectory, emptyOutDir: true, minify: false },
  })

  builtHtml = readFileSync(join(outputDirectory, 'index.html'), 'utf8')
  const cssFiles = readdirSync(join(outputDirectory, 'assets')).filter((file) => file.endsWith('.css'))
  if (cssFiles.length !== 1) {
    throw new Error(`Expected one emitted Career Game stylesheet, got ${cssFiles.length}`)
  }
  builtCss = readFileSync(join(outputDirectory, 'assets', cssFiles[0]), 'utf8')
}, 30_000)

afterAll(() => {
  if (outputDirectory) rmSync(outputDirectory, { recursive: true, force: true })
})

function selectorDeclarations(css: string, selector: string): string[] {
  const declarations: string[] = []
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map((item) => item.trim())
    if (selectors.includes(selector)) declarations.push(match[2])
  }

  return declarations
}

function declarationValue(declarations: string[], property: string): string | undefined {
  let value: string | undefined
  for (const block of declarations) {
    const match = block.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`))
    if (match) value = match[1].trim()
  }
  return value
}

function resolveToken(property: string, ...layers: string[]): string {
  let value = declarationValue(layers, property)
  const visited = new Set<string>()

  while (value?.startsWith('var(')) {
    const referencedProperty = value.match(/^var\((--[\w-]+)\)$/)?.[1]
    if (!referencedProperty || visited.has(referencedProperty)) {
      throw new Error(`Could not resolve ${property} through ${value}`)
    }
    visited.add(referencedProperty)
    value = declarationValue(layers, referencedProperty)
  }

  if (!value) throw new Error(`Missing ${property} in the emitted CSS cascade`)
  return value
}

function relativeLuminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)?.map((channel) => parseInt(channel, 16) / 255)
  if (!channels || channels.length !== 3) throw new Error(`Expected a hex color, got ${hex}`)
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(foreground: string, background: string): number {
  const luminances = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left,
  )
  return (luminances[0] + 0.05) / (luminances[1] + 0.05)
}

describe('Career Game appearance admission', () => {
  it('pins the built Career Game root to its pre-S11 light surface before first paint', () => {
    expect(builtHtml).toMatch(/<html\s+lang="ja"\s+data-theme="light">/)

    // These shared branches remain available to Library; the explicit root
    // choice above opts only this standalone artifact out of automatic dark.
    expect(builtCss).toMatch(/:root\[data-theme=['"]dark['"]\]\s*\{/)
    expect(builtCss).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/)
    expect(builtCss).toMatch(/:root:not\(\[data-theme=['"]light['"]\]\)/)
  })

  it('keeps built 13px stamp labels above AA on the light desk and inset surfaces', () => {
    const rootDeclarations = selectorDeclarations(builtCss, ':root')
    const gameShellDeclarations = selectorDeclarations(builtCss, '.career-game-shell')
    const stampTextSelectors = [
      '.career-game-status',
      '.case-directory__meta',
      '.case-directory__open',
      '.case-eyebrow',
      '.case-cover__stamp',
      '.file-index',
      '.decision-panel legend',
      '.product-switch a:hover',
    ]

    for (const selector of stampTextSelectors) {
      const declarations = selectorDeclarations(builtCss, selector).join(';')
      expect(declarations, `${selector} keeps the stamp color`).toContain('color: var(--game-stamp)')
    }

    const statusDeclarations = selectorDeclarations(builtCss, '.career-game-status')
    expect(statusDeclarations.join(';')).toContain('font-size: var(--text-xs)')
    expect(resolveToken('--text-xs', ...rootDeclarations)).toBe('0.8125rem')

    const resolvedStamp = resolveToken('--game-stamp', ...rootDeclarations, ...gameShellDeclarations)
    const resolvedDesk = resolveToken('--color-bg-elevated', ...rootDeclarations)
    const resolvedInset = resolveToken('--color-surface-muted', ...rootDeclarations)

    expect(contrastRatio(resolvedStamp, resolvedDesk)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(resolvedStamp, resolvedInset)).toBeGreaterThanOrEqual(4.5)
  })
})
