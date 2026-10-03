import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/styles/spi-explainer.css'), 'utf8')

describe('SPI explainer CTA layout (#194)', () => {
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
