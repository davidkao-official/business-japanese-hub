import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readStyle = (file: string) => readFileSync(join(process.cwd(), 'src/styles', file), 'utf8')

function withRules(files: string[], check: (rules: CSSRule[]) => void) {
  const styles = files.map((file) => {
    const style = document.createElement('style')
    style.textContent = readStyle(file)
    document.head.append(style)
    return style
  })
  try {
    check(styles.flatMap((style) => Array.from(style.sheet!.cssRules)))
  } finally {
    styles.forEach((style) => style.remove())
  }
}

function ruleFor(rules: CSSRule[], selector: string) {
  return rules.find(
    (rule) => rule instanceof CSSStyleRule && rule.selectorText === selector,
  ) as CSSStyleRule | undefined
}

describe('sticky header scroll padding (UAT 2026-10-25)', () => {
  it('expresses the rendered site header height with tokens, not a magic number', () => {
    withRules(['tokens.css'], (rules) => {
      const value = ruleFor(rules, ':root')?.style.getPropertyValue('--site-header-h').trim()
      expect(value).toBe('calc(var(--space-8) + var(--space-3) + var(--stroke-thin))')
    })
  })

  it('pads in-page scroll targets below the sticky header on the main site shell', () => {
    withRules(['tokens.css', 'global.css'], (rules) => {
      const selector = 'html:has(.app-shell)'
      expect(ruleFor(rules, selector)?.style.getPropertyValue('scroll-padding-top').trim())
        .toBe('calc(var(--site-header-h) + var(--space-4))')
    })
  })

  it('leaves the immersive Reader without site-shell scroll padding', () => {
    withRules(['tokens.css', 'global.css'], (rules) => {
      const padded = rules.filter(
        (rule) => rule instanceof CSSStyleRule && rule.style.getPropertyValue('scroll-padding-top'),
      ) as CSSStyleRule[]
      // Reader routes render outside `Layout`, so padding must be gated on the
      // `.app-shell` that only the main site mounts.
      expect(padded.map((rule) => rule.selectorText)).toEqual(['html:has(.app-shell)'])
    })
  })
})
