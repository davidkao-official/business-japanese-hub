import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readStyle = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const tokensCss = readStyle('src/styles/tokens.css')
const styles = new Map([
  ['home', readStyle('src/styles/home-concept-c.css')],
  ['editorial', readStyle('src/styles/editorial-v2.css')],
  ['about', readStyle('src/styles/about.css')],
  ['spi', readStyle('src/styles/spi-explainer.css')],
  ['product', readStyle('src/styles/product-ia.css')],
  ['reading', readStyle('src/styles/reading.css')],
  ['reader', readStyle('src/styles/reader.css')],
  ['shop', readStyle('src/styles/shop.css')],
  ['plus', readStyle('src/styles/plus.css')],
  ['workplace', readStyle('src/workplace-learn/workplace-learn.css')],
])

function declarationBlock(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1]
}

function roleValue(role: string, theme: 'light' | 'dark') {
  const root = tokensCss.match(/:root\s*\{([^}]*)\}/)?.[1] ?? ''
  const dark = theme === 'dark'
    ? tokensCss.match(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/)?.[1] ?? ''
    : ''
  let value: string | undefined
  for (const declaration of [root, dark]) {
    const match = declaration.match(new RegExp(`--${role}:\\s*([^;]+);`))
    if (match) value = match[1].trim()
  }
  if (!value || !/^#[\da-f]{6}$/i.test(value)) throw new Error(`Could not resolve --${role} for ${theme}`)
  return value
}

function tokenDeclaration(name: string, theme: 'light' | 'dark') {
  const root = tokensCss.match(/:root\s*\{([^}]*)\}/)?.[1] ?? ''
  const dark = theme === 'dark'
    ? tokensCss.match(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/)?.[1] ?? ''
    : ''
  let value: string | undefined
  for (const declaration of [root, dark]) {
    const match = declaration.match(new RegExp(`--${name}:\\s*([^;]+);`))
    if (match) value = match[1].trim()
  }
  if (!value) throw new Error(`Could not resolve --${name} for ${theme}`)
  return value
}

function resolveValue(value: string, theme: 'light' | 'dark') {
  let resolved = value.trim()
  for (let depth = 0; depth < 8; depth += 1) {
    const variable = resolved.match(/^var\(--([\w-]+)\)$/)
    if (!variable) break
    resolved = tokenDeclaration(variable[1], theme)
  }
  if (!/^#[\da-f]{6}$/i.test(resolved)) throw new Error(`Could not resolve CSS color ${value} for ${theme}`)
  return resolved
}

function declarationValue(css: string, selector: string, property: string) {
  const block = declarationBlock(css, selector)
  const value = block?.match(new RegExp(`(?:^|\\n)\\s*${property}:\\s*([^;]+);`))?.[1].trim()
  if (!value) throw new Error(`Could not find ${property} in ${selector}`)
  return value
}

function replaceDeclaration(css: string, selector: string, property: string, value: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rule = new RegExp(`(${escaped}\\s*\\{[^}]*?(?:^|\\n)\\s*${property}:\\s*)[^;]+`, 's')
  return css.replace(rule, `$1${value}`)
}

function luminance(hex: string) {
  const [red, green, blue] = hex.slice(1).match(/.{2}/g)!.map((channel) => parseInt(channel, 16) / 255)
  const linearize = (channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue)
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

const foregrounds = [
  { file: 'home', selector: '.concept-home-hero__accent', role: 'role-accent-foreground', background: 'role-surface-app' },
  { file: 'home', selector: '.concept-home-hero__action--secondary:hover', role: 'role-text-link', background: 'role-surface-content' },
  { file: 'home', selector: '.concept-journey__number', role: 'role-accent-foreground', background: 'role-surface-content' },
  { file: 'home', selector: '.concept-pillar__index', role: 'role-accent-foreground', background: 'role-surface-content' },
  { file: 'editorial', selector: '.storefront-feature__number', role: 'role-accent-foreground', background: 'role-surface-app' },
  { file: 'about', selector: '.about-page__contrast-arrow', role: 'role-accent-foreground', background: 'role-surface-app' },
  { file: 'about', selector: '.about-page__list > li::before', role: 'role-accent-foreground', background: 'role-surface-app' },
  { file: 'spi', selector: '.spi-explainer__david .spi-explainer__label', role: 'role-accent-foreground', background: 'role-surface-inset' },
  { file: 'product', selector: '.web-test-hub__explainer-hint a', role: 'role-text-link', background: 'role-surface-app' },
  { file: 'reading', selector: '.reading-eyebrow,\n.reading-kicker', role: 'role-accent-foreground', background: 'role-surface-app' },
  { file: 'reading', selector: '.reading-access--plus', role: 'role-accent-foreground', background: 'role-surface-app' },
  { file: 'reading', selector: '.reading-card h3 a:hover,\n.reading-card__action:hover,\n.reading-books__links a:hover,\n.reading-related a:hover,\n.reading-back:hover', role: 'role-text-link', background: 'role-surface-app' },
  { file: 'reader', selector: '.reader-notfound__link', role: 'role-text-link', background: 'role-surface-app' },
  { file: 'shop', selector: '.library-book__cta', role: 'role-text-link', background: 'role-surface-content' },
  { file: 'plus', selector: '.plus-free-links a:hover', role: 'role-text-link', background: 'role-surface-app' },
  { file: 'workplace', selector: '.workplace-learn__browse-links a,\n.workplace-learn__section-heading > a,\n.workplace-learn__related a', role: 'role-text-link', background: 'role-surface-app' },
  { file: 'workplace', selector: '.workplace-learn__access--plus', role: 'role-accent-foreground', background: 'role-surface-app' },
  { file: 'workplace', selector: '.workplace-learn__read-link', role: 'role-text-link', background: 'role-surface-app' },
  { file: 'workplace', selector: '.my-learning-workplace-saves__item a', role: 'role-text-link', background: 'role-surface-app' },
] as const

describe('S2 compatibility accent text contrast', () => {
  it('rejects the former Home hover foreground through the unchanged source background chain', () => {
    const home = styles.get('home')!
    const baseSelector = '.concept-home-hero__action--secondary'
    const hoverSelector = '.concept-home-hero__action--secondary:hover'
    const backgroundSource = declarationValue(home, baseSelector, 'background')
    const hoverColorSource = declarationValue(home, hoverSelector, 'color')
    expect(backgroundSource).toBe('var(--color-surface)')
    expect(hoverColorSource).toBe('var(--role-text-link)')

    // Reconstruct the previous source declaration in memory, then run both
    // versions through the exact same selector and token-alias resolution.
    const oldHome = replaceDeclaration(home, hoverSelector, 'color', 'var(--color-accent)')
    expect(declarationValue(oldHome, baseSelector, 'background')).toBe(backgroundSource)
    expect(declarationValue(oldHome, hoverSelector, 'color')).toBe('var(--color-accent)')
    for (const theme of ['light', 'dark'] as const) {
      const background = resolveValue(declarationValue(home, baseSelector, 'background'), theme)
      const repairedForeground = resolveValue(declarationValue(home, hoverSelector, 'color'), theme)
      const oldForeground = resolveValue(declarationValue(oldHome, hoverSelector, 'color'), theme)
      expect(contrast(repairedForeground, background), `${theme} repaired`).toBeGreaterThanOrEqual(4.5)
      if (theme === 'dark') {
        expect(contrast(oldForeground, background), 'dark old source').toBeCloseTo(3.363, 2)
        expect(contrast(oldForeground, background), 'dark old source').toBeLessThan(4.5)
      }
    }
  })

  it('binds all 19 legacy accent foregrounds to semantic text roles and meets 4.5:1', () => {
    expect(foregrounds).toHaveLength(19)
    for (const declaration of foregrounds) {
      const block = declarationBlock(styles.get(declaration.file)!, declaration.selector)
      expect(block, `${declaration.file} ${declaration.selector}`).toBeDefined()
      expect(block, `${declaration.file} ${declaration.selector}`).toMatch(
        new RegExp(`color:\\s*var\\(--${declaration.role}\\)`),
      )
      for (const theme of ['light', 'dark'] as const) {
        expect(
          contrast(roleValue(declaration.role, theme), roleValue(declaration.background, theme)),
          `${declaration.file} ${declaration.selector} ${theme}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps filled action buttons on the paired primary action recipe', () => {
    const home = styles.get('home')!
    const primary = declarationBlock(home, '.concept-home-hero__action--primary')!
    const hover = declarationBlock(home, '.concept-home-hero__action--primary:hover')!
    expect(primary).toMatch(/background:\s*var\(--color-accent\)/)
    expect(primary).toMatch(/color:\s*var\(--color-accent-contrast\)/)
    expect(hover).toMatch(/background:\s*var\(--color-accent-hover\)/)
    for (const theme of ['light', 'dark'] as const) {
      const foreground = roleValue('role-action-primary-foreground', theme)
      for (const background of ['role-action-primary-background', 'role-action-primary-hover']) {
        expect(contrast(foreground, roleValue(background, theme))).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
