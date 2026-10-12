import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/styles/spi-explainer.css'), 'utf8')

describe('SPI explainer CTA layout (#194)', () => {
  it('wraps text and confines wide tables to a shrinkable scroll container at 320px (#205.1)', () => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    try {
      const rules = Array.from(style.sheet!.cssRules)
      const ruleFor = (selector: string, candidates = rules) => candidates.find(
        (candidate) => candidate instanceof CSSStyleRule &&
          candidate.selectorText.split(',').map((part) => part.trim()).includes(selector),
      ) as CSSStyleRule | undefined
      for (const selector of ['.spi-explainer', '.spi-explainer__hero h1', '.spi-explainer__section h2']) {
        expect(ruleFor(selector)?.style.getPropertyValue('overflow-wrap')).toBe('anywhere')
      }
      expect(ruleFor('.spi-explainer__sections')?.style.getPropertyValue('grid-template-columns')).toBe('minmax(0, 1fr)')
      expect(ruleFor('.spi-explainer__section')?.style.getPropertyValue('min-width')).toBe('0px')
      const tableWrap = ruleFor('.spi-explainer__table-wrap')?.style
      expect(tableWrap?.getPropertyValue('min-width')).toBe('0px')
      expect(tableWrap?.getPropertyValue('width')).toBe('100%')
      expect(tableWrap?.getPropertyValue('overflow-x')).toBe('auto')
      const mobile = rules.find((candidate) => candidate instanceof CSSMediaRule &&
        candidate.conditionText === '(max-width: 40rem)') as CSSMediaRule
      for (const selector of ['.spi-explainer__source-note', '.spi-explainer__translation']) {
        expect(ruleFor(selector, Array.from(mobile.cssRules))?.style.getPropertyValue('grid-template-columns'))
          .toBe('minmax(0, 1fr)')
      }
    } finally {
      style.remove()
    }
  })

  it('lets the closing CTA wrap inside its container instead of overflowing narrow screens', () => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    try {
      const rule = Array.from(style.sheet!.cssRules).find(
        (candidate) => candidate instanceof CSSStyleRule && candidate.selectorText === '.spi-explainer__cta .btn',
      ) as CSSStyleRule | undefined
      expect(rule?.style.getPropertyValue('white-space')).toBe('normal')
      expect(rule?.style.getPropertyValue('max-width')).toBe('100%')
    } finally {
      style.remove()
    }
  })
})
