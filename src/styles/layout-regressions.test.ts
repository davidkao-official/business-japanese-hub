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

// Resolve exact-selector declarations in source order. This is a CSS contract
// check, not a font measurement or browser layout simulation (16px root).
function declarations(rules: CSSRule[], selector: string, width = 320): Map<string, string> {
  const result = new Map<string, string>()
  for (const rule of rules) {
    if (rule instanceof CSSMediaRule) {
      const query = rule.conditionText
      const minimum = query.match(/^\(min-width: ([\d.]+)rem\)$/)
      const maximum = query.match(/^\(max-width: ([\d.]+)rem\)$/)
      const lessThan = query.match(/^\(width < ([\d.]+)rem\)$/)
      const applies = minimum ? width >= Number(minimum[1]) * 16
        : maximum ? width <= Number(maximum[1]) * 16
          : lessThan ? width < Number(lessThan[1]) * 16 : false
      if (applies) {
        for (const [key, value] of declarations(Array.from(rule.cssRules), selector, width)) result.set(key, value)
      }
    } else if (rule instanceof CSSStyleRule && rule.selectorText.split(',').map((s) => s.trim()).includes(selector)) {
      for (const key of Array.from(rule.style)) result.set(key, rule.style.getPropertyValue(key))
    }
  }
  return result
}

describe('bounded layout and typography regressions', () => {
  it('fits navigation and appearance beside a shrinkable account at exactly 80rem (#208)', () => {
    withRules(['global.css', 'shop.css', 'editorial-v2.css'], (rules) => {
      const width = 80 * 16
      const tools = declarations(rules, '.site-header__tools', width)
      expect(tools.get('display')).toBe('flex')
      expect(tools.get('min-width')).toMatch(/^0(?:px)?$/)
      expect(tools.get('flex-wrap')).toBe('nowrap')
      const account = declarations(rules, '.site-header__tools > .account-control', width)
      expect(account.get('flex')).toBe('0 1 auto')
      expect(account.get('min-width')).toMatch(/^0(?:px)?$/)
      const identity = declarations(rules, '.site-header__tools .account-control__identity', width)
      expect(identity.get('min-width')).toMatch(/^0(?:px)?$/)
      expect(declarations(rules, '.account-control__identity', width).get('text-overflow')).toBe('ellipsis')
      expect(declarations(rules, '.site-header__tools .account-control > .btn', width).get('flex')).toBe('0 0 auto')
      expect(declarations(rules, '.site-header__tools > .appearance-control', width).get('flex')).toBe('0 0 auto')
      expect(declarations(rules, '.site-nav', width).get('flex')).toBe('0 0 auto')
      expect(declarations(rules, '.site-nav__list', width).get('flex-wrap')).toBe('nowrap')
      expect(declarations(rules, '.site-nav__link', width).get('white-space')).toBe('nowrap')
      expect(declarations(rules, '.site-header__tools', width - 1).get('display')).toBe('none')
    })
  })

  it('keeps founder languages at credential body size and muted profile colour (#203)', () => {
    withRules(['tokens.css', 'global.css', 'about.css'], (rules) => {
      const tokens = declarations(rules, ':root')
      expect(tokens.get('--text-base')).toBe('var(--size-body)')
      expect(tokens.get('--size-body')).toBe('1rem')
      expect(declarations(rules, 'body').get('font-size')).toBe('var(--text-base)')
      expect(declarations(rules, '.about-profile ul').get('color')).toBe('var(--color-text-muted)')
      expect(declarations(rules, '.about-profile__languages').get('font-size')).toBe('var(--text-base)')
      expect(declarations(rules, '.about-profile__languages').get('color')).toBe('var(--color-text-muted)')
      expect(declarations(rules, '.about-profile__languages strong').get('color')).toBe('var(--color-text-muted)')
    })
  })

  it('separates runner alert text and actions with a wrapping token gap (#205.6)', () => {
    withRules(['product-ia.css'], (rules) => {
      const notice = declarations(rules, '.web-test-hub__notice-action')
      expect(notice.get('display')).toBe('flex')
      expect(notice.get('flex-wrap')).toBe('wrap')
      expect(notice.get('gap')).toBe('var(--space-2)')
      expect(declarations(rules, '.web-test-hub__notice-action > span').get('min-width')).toBe('0px')
    })
  })

  it('lets the hero use shared Japanese heading rules without overriding auto-phrase', () => {
    withRules(['global.css', 'home-concept-c.css'], (rules) => {
      const heading = declarations(rules, 'h1')
      expect(heading.get('line-break')).toBe('strict')
      expect(heading.get('word-break')).toBe('auto-phrase')
      expect(heading.get('text-wrap')).toBe('balance')
      expect(declarations(rules, '.concept-home-hero__title').has('word-break')).toBe(false)
      expect(declarations(rules, '.phrase').get('white-space')).toBe('nowrap')
    })
  })
})

describe('purchase CTA rows', () => {
  it('top-aligns CTA rows that hold a purchase CTA so its status note cannot push siblings down', () => {
    const shop = readStyle('shop.css')
    expect(shop).toMatch(/\.cta-row:has\(> \.purchase-cta\)\s*\{\s*align-items:\s*flex-start;\s*\}/)
  })
})
