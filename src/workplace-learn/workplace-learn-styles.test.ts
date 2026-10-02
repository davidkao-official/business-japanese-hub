import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/workplace-learn/workplace-learn.css'), 'utf8')

describe('Workplace Learn save panel layout (#191)', () => {
  it('keeps status width flexible on desktop but content-sized in the mobile column', () => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    try {
      const rules = Array.from(style.sheet!.cssRules)
      const statusSelector = ".workplace-learn__save [role='status']"
      const desktop = rules.find((rule) => rule instanceof CSSStyleRule && rule.selectorText === statusSelector) as CSSStyleRule
      expect(desktop.style.getPropertyValue('flex')).toBe('1 1 14rem')
      const mobile = rules.find((rule) => rule instanceof CSSMediaRule && rule.conditionText === '(max-width: 48rem)') as CSSMediaRule
      const panel = Array.from(mobile.cssRules).find((rule) => rule instanceof CSSStyleRule && rule.selectorText === '.workplace-learn__save') as CSSStyleRule
      expect(panel.style.getPropertyValue('flex-direction')).toBe('column')
      const status = Array.from(mobile.cssRules).find((rule) => rule instanceof CSSStyleRule && rule.selectorText === statusSelector) as CSSStyleRule | undefined
      // A width-oriented 14rem basis becomes an artificial height in a column.
      // Reset the whole flex contract so every status message sizes to content.
      expect(status?.style.getPropertyValue('flex')).toBe('0 1 auto')
    } finally {
      style.remove()
    }
  })
})
